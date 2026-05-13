/**
 * GET /api/health
 *
 * TETO 1.6 健康检查端点
 *
 * 响应包含：
 *   - 总体状态（healthy / degraded / unhealthy）
 *   - 服务版本和运行时长
 *   - 各组件的检查结果（database、migrations、llm_api）
 *
 * 安全约束（原则10）：
 *   - 不暴露内部配置（DB 连接串、API key）
 *   - 不暴露用户数据或系统负载详情
 *   - 速率限制：每分钟最多 60 次
 */

import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/observability/logger';
import { COMPONENT_IDS } from '@/lib/observability/id-registry';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ═══════════════════════════════════════════════════════════
// 服务器启动时间
// ═══════════════════════════════════════════════════════════

const SERVER_START_TIME = Date.now();

// ═══════════════════════════════════════════════════════════
// 简单速率限制（内存，每分钟最多 60 次）
// ═══════════════════════════════════════════════════════════

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);

  if (!record || now > record.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  record.count++;
  return record.count > RATE_LIMIT;
}

// ═══════════════════════════════════════════════════════════
// 检查函数
// ═══════════════════════════════════════════════════════════

interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  latencyMs: number;
  error?: string;
}

interface MigrationCheck extends HealthCheck {
  lastMigration: string;
  pendingCount: number;
}

interface LLMCheck extends HealthCheck {
  provider: string;
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('records').select('id', { count: 'exact', head: true });
    const latencyMs = Date.now() - start;

    if (error) {
      return { status: 'error', latencyMs, error: error.message };
    }
    return { status: 'ok', latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : '数据库连接失败';
    return { status: 'error', latencyMs, error: message };
  }
}

function checkMigrations(): MigrationCheck {
  const start = Date.now();
  try {
    const historyPath = join(process.cwd(), 'sql', 'migrations_history.txt');

    if (!existsSync(historyPath)) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        lastMigration: 'unknown',
        pendingCount: 0,
        error: 'migrations_history.txt 不存在',
      };
    }

    const content = readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.includes('|'));

    // 找到最后一条待执行 migration
    const pendingSection = content.indexOf('## TETO 1.6（待执行）');
    const pendingLines =
      pendingSection >= 0
        ? content
            .slice(pendingSection)
            .split('\n')
            .filter((l) => l.includes('.sql'))
        : [];

    const lastMigration = pendingLines.length > 0
      ? pendingLines[pendingLines.length - 1].split('|')[1]?.trim() ?? 'unknown'
      : 'unknown';

    return {
      status: pendingLines.length > 0 ? 'error' : 'ok',
      latencyMs: Date.now() - start,
      lastMigration,
      pendingCount: pendingLines.length,
      ...(pendingLines.length > 0
        ? { error: `${pendingLines.length} 个 1.6 migration 待执行` }
        : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Migration 检查失败';
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      lastMigration: 'unknown',
      pendingCount: 0,
      error: message,
    };
  }
}

// ═══════════════════════════════════════════════════════════
// Handler
// ═══════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  const start = Date.now();

  // 速率限制
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  try {
    // 并行检查
    const [dbCheck, migrationCheck] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkMigrations()), // fs 同步操作，包装为 Promise
    ]);

    // 判定总体状态
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (dbCheck.status === 'error') {
      overallStatus = 'unhealthy';
    } else if (migrationCheck.status === 'error') {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);

    const body = {
      status: overallStatus,
      version: '1.6.0',
      uptime_seconds: uptimeSeconds,
      checks: {
        database: dbCheck,
        migrations: migrationCheck,
      },
    };

    logger.info('[health] 健康检查完成', {
      componentId: COMPONENT_IDS.DIAGNOSE,
      durationMs: Date.now() - start,
      details: { status: overallStatus },
    });

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '健康检查内部错误';
    logger.error('[health] 健康检查失败', {
      componentId: COMPONENT_IDS.DIAGNOSE,
      errorCode: 'ERR-HEALTH-001',
      details: { error: message },
    });

    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        version: '1.6.0',
        uptime_seconds: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
        checks: {
          database: { status: 'error', latencyMs: 0, error: message },
          migrations: { status: 'error', latencyMs: 0, error: message },
        },
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
