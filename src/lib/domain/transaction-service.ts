/**
 * 事务服务层 — 封装 Supabase RPC 调用，提供原子性多步操作
 *
 * 核心设计：
 * 1. tryRpc: 懒检测 + 自动缓存可用性，首次调用时探测 RPC 是否已部署
 * 2. callRpc: 纯 RPC 调用封装（调用方自行确保可用性）
 * 3. detectRpcAvailability: 批量预检测（可选，启动时调用）
 *
 * 使用模式：
 * - 删除/升格函数使用 tryRpc，自动选择 RPC 或 fallback
 * - RPC 未部署时自动缓存结果，后续调用跳过 RPC 直接走 fallback
 */

import { createClient } from '@/lib/supabase/server'

export interface TransactionResult {
  ok: boolean
  data?: Record<string, any>
  error?: string
}

/** RPC 调用结果，附带可用性信息 */
export interface RpcAttemptResult extends TransactionResult {
  /** true 表示 RPC 函数确实存在于数据库中（即使业务逻辑返回了错误） */
  rpcDeployed: boolean
}

// RPC 可用性缓存（进程级，Next.js cold start 后重置）
const rpcAvailability: Record<string, boolean> = {}

const RPC_FUNCTIONS = [
  'rpc_delete_item',
  'rpc_delete_sub_item',
  'rpc_delete_phase',
  'rpc_promote_sub_item',
] as const

/**
 * 判断 Supabase 错误是否表示"RPC 函数不存在"
 */
function isFunctionNotFoundError(error: { message?: string; code?: string }): boolean {
  const msg = (error.message || '').toLowerCase()
  const code = error.code || ''
  // PostgreSQL 42883 = undefined function
  if (code === '42883') return true
  if (msg.includes('could not find the function')) return true
  if (msg.includes('does not exist') && msg.includes('function')) return true
  if (msg.includes('not found') && msg.includes('rpc')) return true
  return false
}

/**
 * 尝试调用 RPC，自动检测和缓存可用性
 *
 * - 已知不可用 → 跳过调用，返回 { ok: false, rpcDeployed: false }
 * - 已知可用 → 直接调用
 * - 未知 → 尝试调用，根据结果缓存可用性
 */
export async function tryRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  functionName: string,
  params: Record<string, any>
): Promise<RpcAttemptResult> {
  // 已知不可用，直接跳过
  if (functionName in rpcAvailability && !rpcAvailability[functionName]) {
    return { ok: false, rpcDeployed: false, error: 'RPC_NOT_DEPLOYED' }
  }

  const { data, error } = await supabase.rpc(functionName, params)

  if (error) {
    if (isFunctionNotFoundError(error)) {
      // 函数不存在，缓存为不可用
      rpcAvailability[functionName] = false
      return { ok: false, rpcDeployed: false, error: error.message }
    }
    // 函数存在但调用出错（如权限问题），不缓存，允许重试
    return { ok: false, rpcDeployed: true, error: error.message }
  }

  // 调用成功，缓存为可用
  rpcAvailability[functionName] = true

  // RPC 函数返回 { ok: boolean, error?: string, ... }
  return { ...(data as TransactionResult), rpcDeployed: true }
}

/**
 * 检测单个 RPC 函数是否可用（基于缓存）
 */
export function isRpcAvailable(fn: string): boolean {
  return rpcAvailability[fn] === true
}

/**
 * 标记 RPC 可用性（用于手动控制或测试）
 */
export function setRpcAvailability(fn: string, available: boolean): void {
  rpcAvailability[fn] = available
}

/**
 * 批量预检测所有 RPC 函数的可用性
 * 可选调用：启动时调用一次可避免首次请求的探测延迟
 */
export async function detectRpcAvailability(): Promise<void> {
  const supabase = await createClient()
  for (const fn of RPC_FUNCTIONS) {
    if (fn in rpcAvailability) continue // 已缓存则跳过
    try {
      const { error } = await supabase.rpc(fn, { p_user_id: '00000000-0000-0000-0000-000000000000' })
      rpcAvailability[fn] = !error || !isFunctionNotFoundError(error)
    } catch {
      rpcAvailability[fn] = false
    }
  }
}

/**
 * 纯 RPC 调用封装（不检测可用性，调用方自行确保）
 *
 * @returns TransactionResult — ok=true 表示成功，ok=false 表示失败
 */
export async function callRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  functionName: string,
  params: Record<string, any>
): Promise<TransactionResult> {
  const { data, error } = await supabase.rpc(functionName, params)

  if (error) {
    return { ok: false, error: error.message }
  }

  return data as TransactionResult
}
