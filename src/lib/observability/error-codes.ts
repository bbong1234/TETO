/**
 * TETO 1.6 error_code 注册表
 *
 * 格式：ERR-{DOMAIN}-{3位序号}
 * 约束：一旦分配不得删除或修改，只能新增。
 *
 * 已从 id-registry.ts 复用初始定义，此处为完整注册表。
 */

import { ERROR_CODES, type ErrorCode } from '@/lib/observability/id-registry';

// 重导出以便统一引用
export { ERROR_CODES };
export type { ErrorCode };

// ═══════════════════════════════════════════════════════════
// error_code → 语义映射（用于诊断 API 和自动提示）
// ═══════════════════════════════════════════════════════════

export interface ErrorCodeInfo {
  code: string;
  domain: string;
  severity: 'blocking' | 'warning';
  message: string;
  suggestedFix: string;
}

export const ERROR_CODE_REGISTRY: Record<string, ErrorCodeInfo> = {
  // ── Record 域 ──
  [ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED]: {
    code: ERROR_CODES.RECORD_CREATE_VALIDATION_FAILED,
    domain: 'RECORD',
    severity: 'blocking',
    message: '记录创建校验失败',
    suggestedFix: '检查输入字段是否满足 record-invariants.ts 中的约束',
  },
  [ERROR_CODES.RECORD_STATE_TRANSITION_INVALID]: {
    code: ERROR_CODES.RECORD_STATE_TRANSITION_INVALID,
    domain: 'RECORD',
    severity: 'blocking',
    message: '记录状态流转非法',
    suggestedFix: '检查记录当前 lifecycle_status 是否允许目标状态',
  },
  [ERROR_CODES.RECORD_NOT_FOUND]: {
    code: ERROR_CODES.RECORD_NOT_FOUND,
    domain: 'RECORD',
    severity: 'blocking',
    message: '记录不存在',
    suggestedFix: '确认 record ID 是否正确',
  },
  [ERROR_CODES.RECORD_FIELD_OWNERSHIP_VIOLATION]: {
    code: ERROR_CODES.RECORD_FIELD_OWNERSHIP_VIOLATION,
    domain: 'RECORD',
    severity: 'blocking',
    message: '字段所有权违规',
    suggestedFix: '检查 source_type 是否允许修改该字段',
  },

  // ── Item 域 ──
  [ERROR_CODES.ITEM_MATCH_FAILED]: {
    code: ERROR_CODES.ITEM_MATCH_FAILED,
    domain: 'ITEM',
    severity: 'warning',
    message: '事项匹配失败',
    suggestedFix: '检查 items 表中是否有匹配名称的事项；或新建事项后再录入',
  },
  [ERROR_CODES.ITEM_NOT_FOUND]: {
    code: ERROR_CODES.ITEM_NOT_FOUND,
    domain: 'ITEM',
    severity: 'blocking',
    message: '事项不存在',
    suggestedFix: '确认 item ID 是否正确',
  },
  [ERROR_CODES.ITEM_TITLE_REQUIRED]: {
    code: ERROR_CODES.ITEM_TITLE_REQUIRED,
    domain: 'ITEM',
    severity: 'blocking',
    message: '事项标题不能为空',
    suggestedFix: '提供有效的事项标题',
  },
  [ERROR_CODES.ITEM_DUPLICATE_NAME]: {
    code: ERROR_CODES.ITEM_DUPLICATE_NAME,
    domain: 'ITEM',
    severity: 'warning',
    message: '事项名称重复',
    suggestedFix: '使用不同的事项名称或检查是否已存在同名事项',
  },
  [ERROR_CODES.ITEM_ARCHIVED_IMMUTABLE]: {
    code: ERROR_CODES.ITEM_ARCHIVED_IMMUTABLE,
    domain: 'ITEM',
    severity: 'blocking',
    message: '已搁置/已完成的事项不可修改',
    suggestedFix: '如需修改，先将事项状态回退为活跃',
  },

  // ── Parse 域 ──
  [ERROR_CODES.PARSE_UNINTELLIGIBLE]: {
    code: ERROR_CODES.PARSE_UNINTELLIGIBLE,
    domain: 'PARSE',
    severity: 'warning',
    message: '语义解析不可理解',
    suggestedFix: '检查输入是否过于模糊或包含无法识别的实体',
  },
  [ERROR_CODES.PARSE_INSUFFICIENT_INFO]: {
    code: ERROR_CODES.PARSE_INSUFFICIENT_INFO,
    domain: 'PARSE',
    severity: 'warning',
    message: '语义解析信息不足',
    suggestedFix: '引导用户补充更多信息（如数量、单位、事项名称）',
  },

  // ── Goal 域 ──
  [ERROR_CODES.GOAL_NO_DATA]: {
    code: ERROR_CODES.GOAL_NO_DATA,
    domain: 'GOAL',
    severity: 'warning',
    message: '目标计算无数据',
    suggestedFix: '确认该事项是否有符合统计资格的记录',
  },
  [ERROR_CODES.GOAL_CALCULATION_ERROR]: {
    code: ERROR_CODES.GOAL_CALCULATION_ERROR,
    domain: 'GOAL',
    severity: 'blocking',
    message: '目标计算错误',
    suggestedFix: '检查 goal_config 配置和 computation/index.ts 的计算逻辑',
  },
  [ERROR_CODES.GOAL_TITLE_REQUIRED]: {
    code: ERROR_CODES.GOAL_TITLE_REQUIRED,
    domain: 'GOAL',
    severity: 'blocking',
    message: '目标标题不能为空',
    suggestedFix: '提供有效的目标标题',
  },
  [ERROR_CODES.GOAL_COMPLETED_LOCKED]: {
    code: ERROR_CODES.GOAL_COMPLETED_LOCKED,
    domain: 'GOAL',
    severity: 'blocking',
    message: '已完成的目标不可修改',
    suggestedFix: '先将目标状态回退为「放弃」或「暂停」后再修改',
  },
  [ERROR_CODES.GOAL_INVALID_RULE_TYPE]: {
    code: ERROR_CODES.GOAL_INVALID_RULE_TYPE,
    domain: 'GOAL',
    severity: 'blocking',
    message: '目标规则类型无效',
    suggestedFix: '选择合法的规则类型：一次性完成、周期性达成、周期性限制',
  },
  [ERROR_CODES.GOAL_INVALID_PERIOD]: {
    code: ERROR_CODES.GOAL_INVALID_PERIOD,
    domain: 'GOAL',
    severity: 'blocking',
    message: '目标周期无效',
    suggestedFix: '选择合法的周期：无、每天、每周、每月、每年、本周、本月',
  },
  [ERROR_CODES.GOAL_CONFIRM_ONLY_DRAFT]: {
    code: ERROR_CODES.GOAL_CONFIRM_ONLY_DRAFT,
    domain: 'GOAL',
    severity: 'blocking',
    message: '只有草稿状态的目标才能确认',
    suggestedFix: '检查目标当前状态是否已变更',
  },

  // ── Auth 域 ──
  [ERROR_CODES.AUTH_UNAUTHENTICATED]: {
    code: ERROR_CODES.AUTH_UNAUTHENTICATED,
    domain: 'AUTH',
    severity: 'blocking',
    message: '未认证',
    suggestedFix: '确认用户已登录',
  },
  [ERROR_CODES.AUTH_FORBIDDEN]: {
    code: ERROR_CODES.AUTH_FORBIDDEN,
    domain: 'AUTH',
    severity: 'blocking',
    message: '无权限',
    suggestedFix: '确认用户对该资源有访问权限',
  },

  // ── Classification 域 ──
  [ERROR_CODES.CLASSIFY_LOW_CONFIDENCE]: {
    code: ERROR_CODES.CLASSIFY_LOW_CONFIDENCE,
    domain: 'CLASSIFY',
    severity: 'warning',
    message: '低置信度归类',
    suggestedFix: '该记录归类置信度低于阈值，建议用户确认或修正事项归属',
  },

  // ── Tag 域 ──
  [ERROR_CODES.TAG_NOT_FOUND]: {
    code: ERROR_CODES.TAG_NOT_FOUND,
    domain: 'TAG',
    severity: 'blocking',
    message: '标签不存在',
    suggestedFix: '确认 tag ID 是否正确',
  },

  // ── Insight 域 ──
  [ERROR_CODES.INSIGHT_QUERY_INVALID]: {
    code: ERROR_CODES.INSIGHT_QUERY_INVALID,
    domain: 'INSIGHT',
    severity: 'blocking',
    message: '洞察查询参数无效',
    suggestedFix: '检查 date_from 和 date_to 参数格式',
  },

  // ── Phase 域 ──
  [ERROR_CODES.PHASE_NOT_FOUND]: {
    code: ERROR_CODES.PHASE_NOT_FOUND,
    domain: 'PHASE',
    severity: 'blocking',
    message: '阶段不存在',
    suggestedFix: '确认 phase ID 是否正确',
  },

  // ── Sub-item 域 ──
  [ERROR_CODES.SUB_ITEM_NOT_FOUND]: {
    code: ERROR_CODES.SUB_ITEM_NOT_FOUND,
    domain: 'SUB_ITEM',
    severity: 'blocking',
    message: '子事项不存在',
    suggestedFix: '确认 sub_item ID 是否正确',
  },
  [ERROR_CODES.SUB_ITEM_TITLE_REQUIRED]: {
    code: ERROR_CODES.SUB_ITEM_TITLE_REQUIRED,
    domain: 'SUB_ITEM',
    severity: 'blocking',
    message: '子事项标题不能为空',
    suggestedFix: '提供子事项标题',
  },
  [ERROR_CODES.SUB_ITEM_ITEM_REQUIRED]: {
    code: ERROR_CODES.SUB_ITEM_ITEM_REQUIRED,
    domain: 'SUB_ITEM',
    severity: 'blocking',
    message: '子事项必须关联事项',
    suggestedFix: '提供 item_id',
  },

  // ── Export 域 ──
  [ERROR_CODES.EXPORT_NO_DATA]: {
    code: ERROR_CODES.EXPORT_NO_DATA,
    domain: 'EXPORT',
    severity: 'warning',
    message: '导出无数据',
    suggestedFix: '检查查询条件是否过严或数据为空',
  },

  // ── Server 域 ──
  [ERROR_CODES.SERVER_INTERNAL_ERROR]: {
    code: ERROR_CODES.SERVER_INTERNAL_ERROR,
    domain: 'SERVER',
    severity: 'blocking',
    message: '服务器内部错误',
    suggestedFix: '检查服务器日志获取详细错误信息',
  },
};

/** 按 error_code 查找注册信息 */
export function getErrorInfo(code: string): ErrorCodeInfo | undefined {
  return ERROR_CODE_REGISTRY[code];
}

/** 按域查找所有 error_code */
export function getErrorsByDomain(domain: string): ErrorCodeInfo[] {
  return Object.values(ERROR_CODE_REGISTRY).filter((e) => e.domain === domain);
}
