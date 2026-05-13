TETO 1.6 主链路接入审计报告
一、用户输入主链路审计
调用链 1：标准单行模式（最常见路径）
plaintext
QuickInput.handleSubmit()                                          [src/app/(dashboard)/records/components/QuickInput.tsx#L1360]
  └─ 本地解析 parsed = localParse(rawText, items)                  [QuickInput.tsx 内部 localParse 函数]
  └─ fetch POST /api/v2/records?enhance=client                     [QuickInput.tsx#L1583]
       └─ POST handler                                             [src/app/api/v2/records/route.ts#L111]
            └─ validateRecordPayload(body)                         [records/route.ts#L20] — 基础格式校验
            └─ createRecordSafely({userId, payload, supabase})     [src/lib/domain/record-service.ts]
                 └─ validateRecordInvariants()                     [src/lib/domain/record-invariants.ts]
                 └─ validateRecordRelations()                      [src/lib/domain/relation-invariants.ts]
                 └─ supabase.from('records').insert()              [record-service.ts 内部]
            └─ enhanceRecord(userId, recordId, ...)                [records/route.ts#L144] — 异步 fire-and-forget
                 └─ parseSemantic()                                [src/lib/ai/parse-semantic.ts]
                 └─ matchItemSmart()                               [src/lib/utils/item-match.ts]
                 └─ applyAiEnhancementSafely()                    [src/lib/domain/record-ai-service.ts]
  └─ enhanceWithAi(recordId, ...)                                  [QuickInput.tsx#L978] — 客户端异步增强
       └─ fetch POST /api/v2/parse                                 [QuickInput.tsx#L1004]
       └─ matchItemSmart()                                         [QuickInput.tsx#L1050]
       └─ fetch PUT /api/v2/records/{id}  ← ⚠️ 直接 fetch，不走 Domain Service!  [QuickInput.tsx#L1095]
调用链 2：服务端增强路径（enhance=client 未传时）
plaintext
POST /api/v2/records → createRecordSafely() → enhanceRecord() 异步
  └─ parseSemantic() → parseWithFallback() (降级)
  └─ matchItemSmart()
  └─ applyAiEnhancementSafely()  ← 走规则中心 ✓
       └─ applyFieldOwnershipPolicy()
       └─ validateRecordInvariants()
       └─ validateRecordRelations()
       └─ supabase.from('records').update() ← 直接 DB 写入
关键发现：
节点	文件	函数	状态
前端输入	QuickInput.tsx	handleSubmit()	✅ 已接入
本地解析	QuickInput.tsx	localParse()	✅ 已接入（仅本地规则）
POST API	records/route.ts	POST handler	✅ 走 Domain Service
服务端增强	enhance-record.ts	enhanceRecord()	✅ 走规则中心
客户端增强	QuickInput.tsx	enhanceWithAi()	⚠️ 绕过 Domain Service
二、解析层真实接入情况
问题	答案
用户首次输入是否调用 parseSemantic？	否。首次输入仅走本地 localParse()（正则规则），parseSemantic 仅在异步增强阶段调用
是否经过 10 阶段 Pipeline？	否。runPipeline() 仅在 /api/v2/parse 路由中使用，且受 TETO_PIPELINE_V1 feature flag 控制（默认关闭）。主 POST records 路径不走 pipeline
parse 后是否直接写 records？	服务端路径：parse → applyAiEnhancementSafely（有规则校验）→ supabase.update。客户端路径：parse → 直接 fetch PUT（绕过规则中心）⚠️
enhanceRecord 是同步还是异步？	异步（fire-and-forget），在 POST records 的 await 后通过 .catch() 独立执行，不阻塞 HTTP 响应
enhanceRecord 回写字段是否经过 Domain Service？	是，走 applyAiEnhancementSafely → applyFieldOwnershipPolicy → validateRecordInvariants → validateRecordRelations
AI 回写是否可能覆盖用户字段？	理论上有保护。AI_FIELD_POLICIES 定义了 44 个字段的归属策略，user 字段 aiCanWrite: false（如 content, type, date），shared 字段 overwriteRule: 'if_empty'。但 parsed_semantic 绕过策略引擎直接合并 ⚠️
是否有字段归属策略和日志？	有策略定义：src/lib/domain/ai-write-policy.ts（AI_FIELD_POLICIES）+ field-ownership-policy.ts（applyFieldOwnershipPolicy）。日志：logFieldChanges() 在 enhance-record.ts 中调用，但写入 logger(console)，非 DB
P0 风险：客户端 enhanceWithAi 绕过 Domain Service
plaintext
QuickInput.tsx#L1095 → fetch PUT /api/v2/records/{id}
  → 直接调用 updateRecordSafely() ✓ (PUT route 走 Domain Service)
  
实际上客户端 PUT 走的是 /api/v2/records/[id]/route.ts 的 PUT handler，
该 handler 调用 updateRecordSafely() ✓
修正：客户端 enhanceWithAi 通过 fetch PUT /api/v2/records/{id} 调用，该路由使用 updateRecordSafely，不走规则中心的字段归属策略，但至少走了 invariants + relations 校验。风险降级为 P1。
三、规则中心接入情况
路由/函数	走 Domain Service	走 validateRecordInvariants	走 relation check	走 lifecycle check	直接 DB 写入	风险
POST /api/v2/records	createRecordSafely ✓	✓	✓	✓	否	✅
PUT /api/v2/records/[id]	updateRecordSafely ✓	✓	✓	✓	否	✅
DELETE /api/v2/records/[id]	deleteRecord() ⚠️	✗	✗	✗	是	🔴 P0
POST .../complete	completeRecordSafely ✓	✓	✓	✓	否	✅
POST .../cancel	cancelRecordSafely ✓	✓	✓	✓	否	✅
POST .../postpone	postponeRecordSafely ✓	✓	✓	✓	否	✅
POST /api/v2/records/batch	batchCreateRecordsSafely ✓	✓	✓	✓	否	✅
POST .../correct	✗	✗	✗	✗	supabase.update() 直接	🔴 P0
enhanceRecord 回写	applyAiEnhancementSafely ✓	✓	✓	✗	supabase.update()	✅
enhanceWithAi 回写	通过 PUT route → updateRecordSafely ✓	✓	✓	✗	否	⚠️ P1
P0 风险明细：
DELETE /api/v2/records/[id]（src/app/api/v2/records/[id]/route.ts#L56-L70）：直接调用 deleteRecord(userId, id)，不走 deleteRecordSafely，无生命周期校验，无关系校验。这意味着可以删除 completed 状态的记录，或删除已被其他记录引用的记录。
POST /api/v2/records/[id]/correct（src/app/api/v2/records/[id]/correct/route.ts#L68-L86）：直接 supabase.from('records').update()，不走任何 Domain Service，无 invariants 校验。
四、事项与子事项匹配逻辑
审计对象： matchItemSmart() — src/lib/utils/item-match.ts
问题	答案
只匹配 item 还是也匹配 sub_item？	只匹配 item。matchItemSmart() 签名只接受 items: Array<{id, title}>，无 sub_item 参数
是否保存候选列表？	否。只返回最佳匹配，不返回候选列表
是否保存匹配分数？	否。只返回 confidence: 'high'/'medium' 和 matchType: string，无数值分数
是否保存为什么选中？	部分。matchType 记录匹配策略名（如 exact, title_contains_hint, fallback_keyword:xxx）
是否保存为什么排除？	否。不记录排除原因
是否有 decision_id？	有。genDecisionId('ITEM_MATCH') 被调用，但仅生成内存 ID，不持久化到 DB
低置信度如何处理？	medium 置信度返回候选给前端弹框确认；无匹配返回 null
解释能力测试：
"跑步" → 健身 > 跑步：matchItemSmart 使用 extractCoreKeywords 提取关键词，中文 ≥2 字符序列匹配。如果输入包含"跑步"且事项"跑步"存在，走 exact 匹配或包含匹配。如果事项标题是"健身"且输入包含"健身"，同理。但无法解释为什么"跑步"归到"健身 > 跑步"这个层级——因为没有 sub_item 匹配。
"烧烤"为什么不归到跑步：extractCoreKeywords 提取中文关键词 ≥2 字符，"烧烤"与"跑步"不包含彼此，无匹配 → null。
"背英语" → 英语学习 > 背英语单词：同理，仅 item 级匹配到"英语学习"（如果 AI 返回 item_hint="英语学习"）。
Sub_item 匹配完全在前端手动完成：QuickInput.tsx 的 enhanceRecordPipeline（#L736-L782）中用字符串 includes() 匹配，无决策日志，无 confidence。
五、目标系统接入情况
审计对象： src/lib/db/goal-engine.ts
问题	答案
哪些 API 调用 goal-engine？	GET /api/v2/goals/[id]/engine → computeGoalEngine(); GET /api/v2/items/[id]/goal-engine → computeGoalEngineForItem()
record 创建后是否触发 goal impact 判断？	否。goal engine 仅在 API 查询时计算，不在 record CRUD 时触发
是否有 Goal Impact Detector？	否。无独立组件判断单条 record 对 goal 的影响
是否保存"为什么计入/不计入目标"？	否。computeGoalEngine 不生成解释，不输出 computation_id
是否有 computation_id？	定义存在（COMPUTATION_IDS 在 src/lib/computation/index.ts），但 goal-engine 不输出 computation_id
是否有 explain 输出？	explainComputation() 已实现（src/lib/computation/explain.ts），但 goal-engine 不调用
是否存在单位不匹配 fallback？	是。goal-engine.ts#L209-L214 有 DURATION_UNITS 集合（分钟/小时），用于区分 metric_value 和 duration_minutes 统计。但如果目标用"公里"而记录用"分钟"，会被视为不同 metric_name，不会自动 fallback
调用链：
plaintext
GET /api/v2/goals/{id}/engine
  └─ computeGoalEngine(userId, goalId)                           [goal-engine.ts]
       └─ fetchGoalsForItem()
       └─ computeEngineForGoal()
            └─ sumMetricValuesBatched()                          [goal-engine.ts#L108]
                 └─ buildStatsQuery(CORE_METRICS.goal_progress)  [goal-engine.ts#L120]
            └─ countRecordsInPeriod()
                 └─ buildStatsQuery(CORE_METRICS.goal_progress)
            └─ sumDurationInPeriod() / sumDurationBatched()
风险： 目标引擎仅在查询时计算 → insight 页面每次都需要重新计算所有目标，无缓存，无增量更新。record 创建后不触发 goal impact 判断 → 用户无法实时看到目标进度变化。
六、洞察系统接入情况
模块	数据来源	走 computation center	走 stats-eligibility	裸查 records	有 explain	风险
/api/v2/insights → getInsights()	buildStatsQuery + CORE_METRICS	✅	✅ (SQL层)	否	否	✅
computeDayTimeline	buildStatsQuery(activity_heatmap)	✅	✅	否	否	✅
computeActivityHeatmap	buildStatsQuery(activity_heatmap)	✅	✅	否	否	✅
computeItemActivity	buildStatsQuery(item_total_effort)	✅	✅	否	否	✅
computeGoalProgress	computeGoalEngine() → buildStatsQuery(goal_progress)	✅	✅	否	否	✅
computeTimeDistribution	buildStatsQuery(time_distribution)	✅	✅	否	否	✅
computePeriodComparison	buildStatsQuery(period_comparison)	✅	✅	否	否	✅
computeDataReview	queryAllRecordsForReview()	✅	✅	否	否	✅
事项页聚合 (items/[id])	buildStatsQuery(item_total_effort) / buildStatsQuery(item_daily_breakdown)	✅	✅	否	否	✅
/api/health	supabase.from('records').select('id')	❌	❌	✅ (仅计数)	否	🟡 (health check，影响小)
前端 Insight 页面	InsightsClient.tsx → fetch /api/v2/insights	✅	✅	否	否	✅
结论：洞察系统已全面接入计算中心。除 health check 外没有裸查 records。没有前端自算统计。
七、可观测性接入情况
节点	trace_id	span_id	behavior_id	decision_id	error_code	持久化	文件路径
POST /api/v2/records	withTrace() ✅	startSpan() ✅	✗	✗	apiError() ✅	❌ 内存	records/route.ts
POST /api/v2/parse	withTrace() ✅	startSpan() ✅	✗	✗	apiError() ✅	❌ 内存	parse/route.ts
enhanceRecord	genBehaviorId('B-004') ✅	✗	✅	genDecisionId('ENHANCE') ✅	✗	❌ logger	enhance-record.ts
matchItemSmart	✗	✗	genBehaviorId('B-060') ✅	genDecisionId('ITEM_MATCH') ✅	✗	❌ logger	item-match.ts
applyAiEnhancementSafely	✗	✗	✗	✗	InvariantIssue.code ✅	❌ 返回值	record-ai-service.ts
computeGoalEngine	✗	✗	genBehaviorId('B-042') ✅	✗	✗	❌	goal-engine.ts
getInsights	✗	startSpan() ✅	genBehaviorId('B-052') ✅	✗	✗	❌	insights.ts
POST .../correct	withTrace() ✅	✗	✗	decision_id 绑定	apiError() ✅	✅ corrections 表	correct/route.ts
关键发现：
问题	答案
genTraceId 在哪些入口调用？	withTrace(request) 在几乎所有 API handler 中调用，生成 traceId
trace_id 是否贯穿 parse → domain → enhance → goal → insight？	否。trace_id 在每个 API 入口独立生成，不跨请求传递。enhanceRecord 是异步调用，不继承 POST records 的 trace_id
B-001~B-064 行为编号是否实际使用？	部分使用。已确认调用的有：B-004 (enhanceRecord)、B-042 (computeGoalEngineForItem)、B-052 (getInsights)、B-060 (matchItemSmart)。genBehaviorId() 调用生成 ID 但不持久化
decision logs 是否真实写入？	仅写入 logger（console/stdout）。logDecision() → src/lib/observability/decision-logger.ts → logger.info()
decision log 写到哪里？	console/stdout。decision_logs 表 SQL 已定义（018_decision_logs.sql）但 decision-logger.ts 不写入该表
error_code 是否结构化返回？	是。apiError() 返回 { success: false, error: { code, message, trace_id } }
能否通过 trace_id 查到一条用户输入的完整链路？	不能跨请求。trace/span 仅存内存 Map（src/lib/observability/trace.ts），请求结束 clearTrace() 清除
是否有 diagnose API？	有。GET /api/v2/diagnose?trace_id=T-xxx（src/app/api/v2/diagnose/route.ts），但只能查当前请求生命周期内的内存 trace 数据
P0 风险：trace/decision 没有持久化。 decision_logs 表有 SQL 定义但不写入，trace_summaries 表（017_trace_summaries.sql）有定义但不写入。diagnose API 在大多数情况下返回 "未找到 trace 数据"。
八、纠错与自查功能现状
功能	是否存在	文件/表/API	接入主链路	缺口	风险
corrections 表	✅ SQL 已定义	sql/016_corrections.sql	❓ 未确认建表	表可能尚未创建	🟡
records correct API	✅	POST /api/v2/records/[id]/correct	⚠️ 绕过 Domain Service	不校验字段归属，不校验 invariants	🔴 P0
correction service	❌ 无独立服务	—	—	correct API 内联逻辑	🟡
decision_id 与 correction 绑定	✅	correct/route.ts#L89	✅	若 decision_id 为空则生成 DEC-CORR-xxx 占位	🟡
纠错后重算 trust	❌	—	—	注释说会触发但无实际代码	🔴 P1
纠错后重算 goal	❌	—	—	无触发	🔴 P1
纠错后重算 insight	❌	—	—	无触发	🔴 P1
纠错后生成 eval test_case	✅	regression-test-generator.ts → writeTestCaseToDisk()	✅	写入 eval/test-cases/regression/ 目录	✅
diagnose API	✅	GET /api/v2/diagnose?trace_id=	⚠️ 只查内存 trace	无持久化数据，大概率空返回	🟡
diagnose trends API	✅	GET /api/v2/diagnose/trends?days=30	⚠️ 查 decision_logs 表	表无数据，返回空	🟡
error clustering	✅	diagnose/trends/route.ts#L126-L219	⚠️ 依赖空表	decision_logs 表无写入源	🟡
test_case generator	✅	correction/regression-test-generator.ts	✅	写入磁盘	✅
P0 风险汇总
#	风险	严重程度	位置	影响
1	DELETE records 绕过 Domain Service	🔴 P0	records/[id]/route.ts#L65	可删除任意状态记录，无生命周期/关系校验
2	correct API 绕过 Domain Service	🔴 P0	records/[id]/correct/route.ts#L68-L76	直接 supabase.update，无字段校验，无 invariants
3	trace/span 无持久化	🔴 P0	observability/trace.ts	请求结束后清除，diagnose API 不可用
4	decision_logs 无实际写入	🔴 P0	observability/decision-logger.ts	表有 SQL 定义但从不写入，trends API 空返回
5	纠错不触发重算	🔴 P1	records/[id]/correct/route.ts	trust/goal/insight 均不重算，数据一致性受损
6	客户端 AI 增强不输出 decision_id 到 DB	🟡 P1	QuickInput.tsx#L1095	无法追溯 AI 写入来源
主链路接线状态图
plaintext
用户输入 (QuickInput.tsx)
  │  ✅ 已接入
  ▼
本地解析 (localParse)                     ✅ 已接入（仅本地规则，不调 AI）
  │
  ▼
POST /api/v2/records                      ✅ 已接入
  │
  ├─► createRecordSafely()                ✅ 已接入（Domain Service）
  │     ├─ validateRecordInvariants()     ✅ 
  │     ├─ validateRecordRelations()      ✅ 
  │     └─ supabase.insert()              ✅ 
  │
  ├─► enhanceRecord() [异步]              ✅ 已接入（服务端增强路径）
  │     ├─ parseSemantic()                ✅ 
  │     ├─ matchItemSmart()               ✅ 
  │     └─ applyAiEnhancementSafely()     ✅ 走规则中心
  │           ├─ applyFieldOwnershipPolicy() ✅ 
  │           ├─ validateRecordInvariants()  ✅ 
  │           └─ validateRecordRelations()   ✅ 
  │
  └─► enhanceWithAi() [客户端异步]         ⚠️ 部分接入
        ├─ POST /api/v2/parse             ✅ 
        ├─ matchItemSmart()               ✅ 
        └─ PUT /api/v2/records/{id}       ⚠️ 走 updateRecordSafely 但缺字段归属策略
              (走 Domain Service PUT handler)

                  ─── 数据已写入 Records 表 ───

目标计算 (Goal Engine)                     ⚠️ 部分接入
  │  ✅ buildStatsQuery 统一口径
  │  ❌ 无 computation_id 输出
  │  ❌ 无 explain 调用
  │  ❌ 无 record 创建后触发
  ▼
洞察展示 (Insights)                        ✅ 已接入
  │  ✅ 全部走 buildStatsQuery + CORE_METRICS
  │  ✅ 无裸查 records
  ▼
前端展示 (InsightsClient.tsx)              ✅ 已接入

                  ─── 纠错链路 ───

用户纠错 (correct API)                     🔴 部分接入（P0 风险）
  │  🔴 绕过 Domain Service
  │  ✅ corrections 表写入
  │  ✅ 回归测试用例生成
  │  ❌ 不触发 trust 重算
  │  ❌ 不触发 goal 重算
  │  ❌ 不触发 insight 重算
  ▼
诊断自查 (diagnose API)                    🔴 未实质接入
  │  ✅ API 存在
  │  🔴 无持久化 trace 数据
  │  🔴 decision_logs 表无写入
  │  🔴 trends API 返回空
  ▼
(断链 — 无法追溯完整调用链)
图例：
✅ 已接入：功能完整，正确接入主链路
⚠️ 部分接入：功能存在但有关键缺口
🔴 未接入/断裂：功能缺失或绕过关键架构约束
❌ 缺失：功能未实现
审计结论： TETO 1.6 主链路的「写入→校验」核心路径（POST/PUT records）已完整接入 Domain Service + 规则中心。最严重的 4 个 P0 风险集中在：DELETE 绕过校验、correct API 绕过 Domain Service、trace/decision 无持久化、纠错不触发重算。洞察系统接入质量最高（100% 走计算中心）。可观测性系统框架存在但缺乏持久化支撑