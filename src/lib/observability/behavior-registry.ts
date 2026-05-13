/**
 * TETO 1.6 行为模式编号注册表
 *
 * 每个关键函数一个稳定编号（B-xxx），永不修改只能新增。
 * 出问题时通过 B-xxx 直接追溯到函数级，配合 trace_id 定位具体调用。
 *
 * 约束：
 *   - 编号一旦分配不得修改或删除，只能新增
 *   - 编号区间：
 *       B-001 ~ B-009   AI 解析层
 *       B-010 ~ B-019   领域服务层（records）
 *       B-020 ~ B-029   领域服务层（items/goals/tags/phases）
 *       B-030 ~ B-039   统计计算层
 *       B-040 ~ B-049   目标差额层
 *       B-050 ~ B-059   洞察层
 *       B-060 ~ B-069   匹配/分类层
 */

export const BEHAVIOR_REGISTRY: Record<string, string> = {
  // ═══════════════════════════════════════
  // AI 解析层（B-001 ~ B-009）
  // ═══════════════════════════════════════
  'B-001': 'parseSemantic() — LLM 语义解析主入口',
  'B-002': 'callDeepSeek() — 调用 DeepSeek API',
  'B-003': 'validateAndFixSemantic() — 校验修复 LLM 输出',
  'B-004': 'enhanceRecord() — AI 增强记录',
  'B-005': 'parseWithFallback() — 降级规则解析',

  // ═══════════════════════════════════════
  // 领域服务层 — Records（B-010 ~ B-019）
  // ═══════════════════════════════════════
  'B-010': 'createRecordSafely() — 安全创建记录',
  'B-011': 'updateRecordSafely() — 安全更新记录',
  'B-012': 'completeRecordSafely() — 完成记录',
  'B-013': 'postponeRecordSafely() — 推迟记录',
  'B-014': 'cancelRecordSafely() — 取消记录',
  'B-015': 'batchCreateRecordsSafely() — 批量创建记录',

  // ═══════════════════════════════════════
  // 领域服务层 — Items/Goals/Tags/Phases（B-020 ~ B-029）
  // ═══════════════════════════════════════
  'B-020': 'createItemSafely() — 安全创建事项',
  'B-021': 'updateItemSafely() — 安全更新事项',
  'B-022': 'createGoal() — 创建目标',
  'B-023': 'updateGoal() — 更新目标',
  'B-024': 'createTag() — 创建标签',
  'B-025': 'updateTag() — 更新标签',

  // ═══════════════════════════════════════
  // 统计计算层（B-030 ~ B-039）
  // ═══════════════════════════════════════
  'B-030': 'computeActivity() — 活跃度计算',
  'B-031': 'computeEffort() — 投入计算',
  'B-032': 'computeStagnation() — 停滞计算',
  'B-033': 'computePlanAchievement() — 计划达成率计算',
  'B-034': 'computeEffectiveness() — 效果比率计算',
  'B-035': 'computeAllMetrics() — 全量指标计算',

  // ═══════════════════════════════════════
  // 目标差额层（B-040 ~ B-049）
  // ═══════════════════════════════════════
  'B-040': 'sumDurationInRange() — 时间段时长汇总',
  'B-041': 'sumDurationBatched() — 批量时长汇总',
  'B-042': 'computeGoalProgress() — 目标进度计算',

  // ═══════════════════════════════════════
  // 洞察层（B-050 ~ B-059）
  // ═══════════════════════════════════════
  'B-050': 'computeItemActivity() — 事项活跃度洞察',
  'B-051': 'computeTimeRanking() — 时间投入排名',
  'B-052': 'aggregateInsights() — 洞察聚合',

  // ═══════════════════════════════════════
  // 匹配/分类层（B-060 ~ B-069）
  // ═══════════════════════════════════════
  'B-060': 'matchItemSmart() — 智能事项匹配',
  'B-061': 'matchExact() — 精确标题匹配',
  'B-062': 'matchContains() — 包含匹配',
  'B-063': 'matchFuzzy() — 模糊/关键词匹配',
  'B-064': 'matchKeywordScan() — 关键词扫描匹配',
} as const;

/** 根据行为编号获取描述 */
export function getBehaviorDescription(id: string): string {
  return BEHAVIOR_REGISTRY[id] ?? `未知行为: ${id}`;
}

/** 所有已注册的行为编号 */
export function getBehaviorIds(): string[] {
  return Object.keys(BEHAVIOR_REGISTRY);
}
