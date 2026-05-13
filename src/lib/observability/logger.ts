/**
 * TETO 1.6 结构化 Logger — 替代所有 console.log
 *
 * 约束（原则7）：
 *   - console.log 禁止用于生产日志（必须走本 Logger）
 *   - 每条日志必须含 trace_id
 *   - 生产环境输出到结构化 JSON，开发环境输出到控制台
 *   - 错误必须记录 error_code
 */

import type { PipelineStage } from '@/lib/ai/agent-pipeline';

// ═══════════════════════════════════════════════════════════
// 日志级别
// ═══════════════════════════════════════════════════════════

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

// ═══════════════════════════════════════════════════════════
// 日志条目结构
// ═══════════════════════════════════════════════════════════

export interface LogEntry {
  /** ISO 时间戳 */
  timestamp: string;

  /** 日志级别 */
  level: LogLevel;

  /** 日志消息 */
  message: string;

  // 编号体系字段（可观测性核心）
  traceId?: string;
  spanId?: string;
  stepId?: string;
  componentId?: string;
  behaviorId?: string;
  decisionId?: string;
  toolCallId?: string;
  errorCode?: string;

  // 上下文
  stage?: PipelineStage;
  userId?: string;

  // 数据摘要
  inputSummary?: string;
  outputSummary?: string;
  durationMs?: number;

  // 关联实体
  relatedRecordId?: string;
  relatedDomain?: string;

  // 扩展数据
  details?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// Logger 接口
// ═══════════════════════════════════════════════════════════

export interface ILogger {
  debug(message: string, meta?: Partial<LogEntry>): void;
  info(message: string, meta?: Partial<LogEntry>): void;
  warn(message: string, meta?: Partial<LogEntry>): void;
  error(message: string, meta?: Partial<LogEntry>): void;
  fatal(message: string, meta?: Partial<LogEntry>): void;
}

// ═══════════════════════════════════════════════════════════
// Logger 实现
// ═══════════════════════════════════════════════════════════

class StructuredLogger implements ILogger {
  private readonly minLevel: LogLevel;

  constructor(minLevel: LogLevel = 'debug') {
    this.minLevel = minLevel;
  }

  debug(message: string, meta?: Partial<LogEntry>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Partial<LogEntry>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Partial<LogEntry>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Partial<LogEntry>): void {
    this.log('error', message, meta);
  }

  fatal(message: string, meta?: Partial<LogEntry>): void {
    this.log('fatal', message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Partial<LogEntry>): void {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[this.minLevel]) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...meta,
    };

    const jsonLine = JSON.stringify(entry);

    // 生产环境：单行 JSON 到控制台（与 stdout 管道等价，且兼容 Edge Runtime）
    // 避免直接引用 process.stdout —— Turbopack/Edge 会静态报不支持。
    if (process.env.NODE_ENV === 'production') {
      console.log(jsonLine);
    } else {
      this.devPrint(entry, jsonLine);
    }
  }

  private devPrint(entry: LogEntry, jsonLine: string): void {
    const prefix = this.colorPrefix(entry.level);
    // 开发环境下同时输出可读版和 JSON 版
    const compact = [
      entry.timestamp.slice(11, 19),
      entry.traceId?.slice(0, 18) ?? '-',
      entry.stage !== undefined ? `S${entry.stage}` : '--',
      entry.errorCode ?? '-',
      entry.message.slice(0, 60),
    ].join(' | ');

    console.log(`${prefix}${compact}`);
    if (entry.details && Object.keys(entry.details).length > 0) {
      console.log(`  ↳ details:`, entry.details);
    }
  }

  private colorPrefix(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m', // green
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
      fatal: '\x1b[35m', // magenta
    };
    return `${colors[level]}[${level.toUpperCase()}]\x1b[0m `;
  }
}

// ═══════════════════════════════════════════════════════════
// 导出单例
// ═══════════════════════════════════════════════════════════

/** 默认 Logger 实例 */
export const logger: ILogger = new StructuredLogger(
  process.env.NODE_ENV === 'production' ? 'info' : 'debug'
);

/** 创建自定义 Logger（测试、特定模块） */
export function createLogger(minLevel: LogLevel = 'info'): ILogger {
  return new StructuredLogger(minLevel);
}

// ═══════════════════════════════════════════════════════════
// 便捷函数（带默认字段的快速日志）
// ═══════════════════════════════════════════════════════════

/** 创建带 componentId 的快速 log 函数 */
export function createComponentLogger(componentId: string): ILogger {
  const wrap = (fn: (message: string, meta?: Partial<LogEntry>) => void) =>
    (message: string, meta?: Partial<LogEntry>) =>
      fn(message, { ...meta, componentId });

  return {
    debug: wrap(logger.debug.bind(logger)),
    info: wrap(logger.info.bind(logger)),
    warn: wrap(logger.warn.bind(logger)),
    error: wrap(logger.error.bind(logger)),
    fatal: wrap(logger.fatal.bind(logger)),
  };
}
