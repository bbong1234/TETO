/**
 * TETO 1.6 Domain Registry — DDD 业务域注册中心
 *
 * 职责：
 *   - 集中注册所有 DDD 业务域（现有 + 预留）
 *   - 定义域间通信契约（只能通过 ID 引用 + 事件/编排器协调）
 *   - 为 1.7+ 域拆分提供注册入口
 *
 * 约束（原则3）：
 *   - 域 A 引用域 B 只能用 ID（如 item_id），不能直接访问 B 的内部状态
 *   - 跨域操作必须通过 Orchestrator，不得一个 API handler 同时操作多域表
 *   - 域间数据模型不兼容时，通过 Anti-corruption Layer 隔离翻译
 */

// ═══════════════════════════════════════════════════════════
// Domain 注册类型
// ═══════════════════════════════════════════════════════════

/** 域生命周期状态 */
export type DomainStatus = 'active' | 'reserved' | 'deprecated';

/** 单个 DDD 业务域的注册信息 */
export interface DomainRegistration {
  /** 域编号，如 D-RECORD */
  domainId: string;

  /** 域英文名 */
  name: string;

  /** 域中文描述 */
  description: string;

  /** 核心职责说明 */
  responsibility: string;

  /** 核心数据表 */
  coreTables: string[];

  /** 1.6 状态 */
  status: DomainStatus;

  /** 预留原因（仅 reserved 状态需要） */
  reservedReason?: string;

  /** 计划激活版本 */
  targetVersion?: string;
}

// ═══════════════════════════════════════════════════════════
// 域注册表
// ═══════════════════════════════════════════════════════════

export const DOMAIN_REGISTRY: DomainRegistration[] = [
  // ── 已有域（6 个）──
  {
    domainId: 'D-RECORD',
    name: 'Record Domain',
    description: '记录域',
    responsibility: '记录的创建/更新/删除/字段所有权/生命周期/可信标记',
    coreTables: ['records', 'record_days', 'record_links'],
    status: 'active',
  },
  {
    domainId: 'D-ITEM',
    name: 'Item Domain',
    description: '事项域',
    responsibility: '事项的分类/状态流转/目标关联',
    coreTables: ['items', 'item_folders', 'sub_items'],
    status: 'active',
  },
  {
    domainId: 'D-GOAL',
    name: 'Goal Domain',
    description: '目标域',
    responsibility: '目标的创建/更新/规则引擎计算',
    coreTables: ['goals'],
    status: 'active',
  },
  {
    domainId: 'D-PHASE',
    name: 'Phase Domain',
    description: '阶段域',
    responsibility: '阶段（Sprint）时间盒管理',
    coreTables: ['phases'],
    status: 'active',
  },
  {
    domainId: 'D-INSIGHT',
    name: 'Insight Domain',
    description: '洞察域',
    responsibility: '洞察生成/统计查询/对比分析',
    coreTables: [],
    status: 'active',
  },
  {
    domainId: 'D-TAG',
    name: 'Tag Domain',
    description: '标签域',
    responsibility: '标签管理',
    coreTables: ['tags'],
    status: 'active',
  },

  // ── 预留域（6 个）──
  {
    domainId: 'D-FINANCE',
    name: 'Finance Domain',
    description: '财务域',
    responsibility: '财务（金额/货币/收支）',
    coreTables: [],
    status: 'reserved',
    reservedReason: '当前由 records.cost 承载，待财务需求明确后拆分',
    targetVersion: '1.8+',
  },
  {
    domainId: 'D-SCHEDULE',
    name: 'Schedule Domain',
    description: '日程域',
    responsibility: '日程/时间规划',
    coreTables: [],
    status: 'reserved',
    reservedReason: '当前由 records.time_anchor_date 承载，待日历功能明确后拆分',
    targetVersion: '2.0+',
  },
  {
    domainId: 'D-LOCATION',
    name: 'Location Domain',
    description: '位置域',
    responsibility: '地理信息存储与查询',
    coreTables: [],
    status: 'reserved',
    reservedReason: '当前由 records.location 承载，1.6 仅注册不拆分',
    targetVersion: '1.8+',
  },
  {
    domainId: 'D-SCORING',
    name: 'Scoring Domain',
    description: '评分域',
    responsibility: 'AI 评分/多维打分',
    coreTables: [],
    status: 'reserved',
    reservedReason: '远期 AI 自动评分能力，1.6 不实装',
    targetVersion: '2.0+',
  },
  {
    domainId: 'D-REVIEW',
    name: 'Review Domain',
    description: '复盘域',
    responsibility: '复盘/核查/确认',
    coreTables: [],
    status: 'reserved',
    reservedReason: '复盘流程独立建模，1.6 不实装',
    targetVersion: '1.8+',
  },
  {
    domainId: 'D-MAP',
    name: 'Map/LBS Domain',
    description: '地图/LBS 域',
    responsibility: '地图/位置服务/地理编码',
    coreTables: [],
    status: 'reserved',
    reservedReason: '远期地图 API 接入，1.6 仅注册预留',
    targetVersion: '2.0+',
  },
];

// ═══════════════════════════════════════════════════════════
// 查询辅助
// ═══════════════════════════════════════════════════════════

/** 获取所有域注册信息 */
export function listDomains(): DomainRegistration[] {
  return DOMAIN_REGISTRY;
}

/** 按状态筛选 */
export function listDomainsByStatus(status: DomainStatus): DomainRegistration[] {
  return DOMAIN_REGISTRY.filter((d) => d.status === status);
}

/** 按 domainId 查找 */
export function getDomain(domainId: string): DomainRegistration | undefined {
  return DOMAIN_REGISTRY.find((d) => d.domainId === domainId);
}

/** 获取所有活跃域 */
export function listActiveDomains(): DomainRegistration[] {
  return listDomainsByStatus('active');
}

/** 获取所有预留域 */
export function listReservedDomains(): DomainRegistration[] {
  return listDomainsByStatus('reserved');
}
