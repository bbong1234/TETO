1.6 不应该从零重做规则中心和计算中心。
因为根据《TETO_1.5_完成报告》，1.5 已经实现了规则中心、计算中心、统计框架和目标规则引擎。
所以 1.6 的重点应该是：把 1.5 已经做好的规则中心和计算中心真正闭环化、解释化、可追踪化、可诊断化、可维护化。

也就是说，1.6 的定位不是“再建一套中心”，而是：

规则中心 / 计算中心从“已有声明层”
升级为“可解释、可追踪、可诊断、可被全系统稳定引用的工程底座”
TETO 1.6 阶段大致内容与简易规划
一、1.6 阶段定位
TETO 1.6 建议正式定位为：

规则计算闭环 + 工程可观测性 + 决策追踪 + 设计体系稳定化阶段。

它不是功能扩展阶段，也不是维度洞察大版本。
它是 TETO 从“主链稳定”进入“系统可解释、可诊断、可维护”的关键工程阶段。

二、1.6 的核心目标
规则中心闭环
让系统内部默认规则不仅存在，而且能被统一引用、解释、编号、追踪。
计算中心闭环
让所有统计口径都有统一来源、统一公式、统一过滤规则、统一解释出口。
故障可观测性与工程质量优化
解决现在调试时需要反复扫描全项目、全数据、全链路的问题，减少 token 浪费。
链路追踪机制
实现类似“击鼓传花”的流程追踪：每个环节接到什么、处理了什么、传给谁、在哪里断了，都能定位。
行为模式编号体系
给系统组件、业务行为、AI 决策、异常模式建立编号，方便 AI 和开发者快速查找问题。
决策 ID 追踪与日志系统
让每一次归类、字段回写、目标计入、状态判断、计算结果都可查来源。
令牌化设计体系
给后续维度面板、复盘面板、投入产出面板准备统一 UI 底座。
三、1.6 不应该做什么
当前 1.6 不应该进入太多上层业务功能。

明确不做：

不做完整维度分析面板
不做投入产出四象限
不做周期复盘
不做 Note 知识沉淀
不做移动端优先
不做多人协同
不做复杂 Agent
不做建议型 AI
不做复杂评分模型
不做大规模历史规律自动展开
如果要补一些用户可见能力，也应该只服务于 1.6 的底层目标，例如：

解释面板
调试面板
日志查看
规则口径说明
决策链路展示
而不是做新的洞察功能。

四、1.6 的主线结构
建议 1.6 分成 5 个任务块：

Block A：规则中心闭环
Block B：计算中心闭环
Block C：链路追踪与故障可观测性
Block D：决策 ID 与日志系统
Block E：令牌化设计体系
执行顺序建议：

A → B → C → D → E
其中 A/B 是业务口径底座，C/D 是工程可观测底座，E 是后续 UI 扩展底座。

五、Block A：规则中心闭环
目标
1.5 已经有 src/lib/rules/index.ts，1.6 要做的是让它真正成为全系统的规则入口。

不是简单存在一个 RULES 对象，而是做到：

规则有编号
规则有解释
规则有版本
规则有调用点
规则变更可追踪
规则结果可被 decision_id 记录
应该实现的内容
A1. 规则编号体系
给规则中心里的每类规则建立稳定编号。

例如：

R-RT-001：旧记录类型归一化规则
R-RT-002：四种主记录类型定义规则

R-PS-001：时间锚点解析规则
R-PS-002：情绪关键词解析规则
R-PS-003：金额模式解析规则
R-PS-004：时长模式解析规则

R-CL-001：事项自动归类置信度阈值
R-CL-002：低置信度待确认规则

R-LC-001：记录生命周期终态规则
R-LC-002：事项停滞阈值规则

R-FB-001：AI 超时降级规则
R-FB-002：AI 不可用降级规则
编号的作用不是给用户看，而是方便：

日志记录
AI 诊断
问题定位
文档索引
测试用例绑定
A2. 规则解释能力
每条规则应该能输出人类可读解释。

例如：

规则：R-CL-001
名称：事项自动归类阈值
内容：当事项匹配置信度 >= 0.85 时，系统允许自动归类
作用：减少用户确认成本
当前值：0.85
调用位置：matchItemSmart / enhance-record
这样用户或开发者看到“为什么自动归类到英语”时，可以展开：

使用规则：R-CL-001
匹配置信度：0.91
超过自动归类阈值：0.85
所以系统自动归类
A3. 规则调用统一化
检查现有代码中是否还有散落硬编码。

重点检查：

parseNaturalInput.ts
parse-semantic.ts
parse-rules-fallback.ts
enhance-record.ts
optimize-input route
goal-engine.ts
insights.ts
stats/*
record-service.ts
目标是：

规则判断不直接写死在业务函数里
业务函数只引用规则中心
A4. 规则版本标记
给规则中心增加版本号。

例如：

export const RULES_VERSION = '1.6.0'
后续每个 decision 可以记录：

rule_version = 1.6.0
rule_ids = ['R-CL-001', 'R-FB-002']
这样以后规则变更后，可以知道旧记录是按哪个规则版本判断的。

Block A 验收标准
规则中心有规则编号
关键规则有解释文本
规则中心有版本号
核心判断链路能记录 rule_id
无明显散落硬编码阈值
至少 10 条关键规则可被解释
六、Block B：计算中心闭环
目标
1.5 已经有 src/lib/computation/index.ts 和 src/lib/stats/，1.6 要让它真正闭环。

也就是：

每个统计数字都知道：
- 名称是什么
- 口径是什么
- 用了哪些记录
- 排除了哪些记录
- 时间范围是什么
- 公式是什么
- 来源于哪个 computation_id
应该实现的内容
B1. 计算指标编号体系
给每个核心指标编号。

例如：

C-ACT-001：事项活跃度
C-INV-001：事项投入时长
C-FRQ-001：记录频率
C-GOAL-001：目标完成率
C-GOAL-002：目标配速
C-GOAL-003：目标超限判断
C-TIME-001：时间分布
C-MONEY-001：支出总额
C-MOOD-001：平均情绪
C-OUT-001：正向产出率
B2. 计算解释能力
每一个统计值都要能展开解释。

例如：

本周英语投入：6 小时

解释：
- computation_id：C-INV-001
- 时间范围：2026-05-04 00:00 至 2026-05-10 23:59
- 计入记录：发生记录 8 条
- 排除记录：计划记录 2 条，取消记录 1 条
- 字段：duration_minutes
- 公式：SUM(duration_minutes)
- 结果：360 分钟 = 6 小时
B3. 计算来源追溯
洞察页、目标页、事项页中的关键数字都应支持追溯。

不一定 1.6 做完整 UI，但至少后端要能提供：

{
  metric_id: 'C-INV-001',
  value: 360,
  unit: 'minutes',
  range: {...},
  included_record_ids: [...],
  excluded_record_ids: [...],
  formula: 'SUM(duration_minutes)',
  computation_version: '1.6.0'
}
B4. 计算中心版本号
类似规则中心，增加：

export const COMPUTATION_VERSION = '1.6.0'
并让后续 decision/log 能记录：

computation_version
metric_id
time_window_id
data_scope_id
B5. 统一时间窗口与数据过滤
重点确认：

今天怎么算
本周怎么算
近 7 天怎么算
近 30 天怎么算
计划记录是否计入
取消记录是否排除
推断数据是否参与统计
fact / inferred 如何区分
Block B 验收标准
核心指标有 computation_id
计算中心有版本号
至少 7 个核心指标可解释
目标页和洞察页关键数字口径一致
关键统计结果能返回 included/excluded records
无明显重复计算口径
七、Block C：故障可观测性与链路追踪
目标
解决你提到的核心问题：

传统调试方式需要反复扫描全部数据，浪费 token。
现在要像“击鼓传花”一样，每一步都知道球传到哪里，哪里断了。

1.6 应建立一套链路追踪机制。

链路追踪的核心思想
每一次用户操作都生成一个：

trace_id
每个模块处理时，都追加一个 step。

类似：

trace_id: T-20260504-xxxx

Step 01 QuickInput 接收输入
Step 02 本地解析 parseNaturalInput
Step 03 API /records 接收请求
Step 04 record-service 校验不变量
Step 05 parse-semantic 调用 AI
Step 06 fallback 判断
Step 07 matchItemSmart 事项匹配
Step 08 field-fill 字段回写
Step 09 goal-engine 目标计算
Step 10 insights invalidation 洞察刷新
如果第 06 步断了，就不用扫描全部代码。

直接查：

trace_id + step_number = 06
就能知道：

输入是什么
输出是什么
错误是什么
用了哪个规则
用了哪个组件
耗时多少
C1. 链路步骤标准化
建议先定义固定的链路步骤枚举。

例如：

LNK-INPUT-001：QuickInput 接收用户输入
LNK-PARSE-001：本地初步解析
LNK-PARSE-002：AI 语义解析
LNK-PARSE-003：规则降级解析
LNK-SPLIT-001：复合句拆分
LNK-RECORD-001：记录创建请求
LNK-RECORD-002：Domain 不变量校验
LNK-CLASSIFY-001：事项匹配
LNK-CLASSIFY-002：子项归属
LNK-FIELD-001：字段回写
LNK-GOAL-001：目标计入计算
LNK-STATS-001：统计刷新
LNK-UI-001：前端展示
C2. 击鼓传花式链路记录
每一步记录：

trace_id
step_id
step_name
input_summary
output_summary
status
started_at
ended_at
duration_ms
next_step_id
error_code
related_decision_id
重点是 next_step_id。

这样流程可以形成链：

A → B → C → D → E
中间断了就知道断点。

C3. 故障定位面板
1.6 可以做一个开发用简易页面，不面向普通用户：

/debug/traces
/debug/traces/:trace_id
展示：

链路步骤列表
每一步状态
耗时
输入摘要
输出摘要
错误信息
关联 decision_id
关联 rule_id
关联 computation_id
C4. 减少 token 浪费的机制
当用户让 AI 诊断问题时，不再说：

你帮我看整个项目哪里错了
而是给 AI：

trace_id = xxx
失败 step = LNK-CLASSIFY-001
decision_id = xxx
rule_id = R-CL-001
error_code = ITEM_MATCH_LOW_CONFIDENCE
AI 就能直接定位问题，不需要扫描全部文件。

Block C 验收标准
一次完整录入链路能生成 trace_id
每个关键步骤有 step_id
链路断点可以定位到具体 step
trace 页面能查看链路
AI 诊断时可基于 trace_id 缩小范围
至少覆盖录入→解析→归类→写入主链
八、Block D：决策 ID 追踪与日志系统
目标
链路追踪回答：

流程走到哪里？
决策 ID 回答：

系统为什么这么判断？
日志系统回答：

运行过程中发生了什么？
三者不要混为一谈。

D1. 决策 ID 体系
每一次关键判断都生成：

decision_id
建议决策类型包括：

DEC-RT：记录类型判断
DEC-TIME：时间解析判断
DEC-MONEY：金额解析判断
DEC-MOOD：情绪解析判断
DEC-ITEM：事项匹配判断
DEC-SUBITEM：子项归属判断
DEC-FIELD：字段回写判断
DEC-GOAL：目标计入判断
DEC-STATUS：状态判断
DEC-FALLBACK：降级模式判断
DEC-CLARIFY：歧义澄清判断
DEC-COMPUTE：统计计算判断
D2. 决策记录内容
每条 decision 至少记录：

decision_id
trace_id
record_id
user_id
decision_type
input_snapshot
candidate_options
selected_output
confidence
rule_ids
computation_ids
model_name
model_version
rule_version
computation_version
was_corrected
corrected_to
created_at
D3. 用户纠错绑定 decision
用户改错时，不只是改数据库字段，还要找到对应 decision。

例如：

用户把 item_id 从“学习”改成“英语”
系统应记录：

decision_id = DEC-ITEM-xxxx
was_corrected = true
corrected_to = 英语
correction_type = item_reassignment
这为后续被动规则学习做准备。

D4. 结构化日志
日志建议分层：

app_log：普通运行日志
error_log：错误日志
ai_trace：AI 链路日志
decision_log：决策日志
audit_log：用户关键操作日志
1.6 可以不做很复杂，但至少要完成：

trace 日志
decision 日志
error 日志
D5. 行为模式编号体系
这是你提到的“组件行为模式编号体系”。

建议分 5 类编号：

1. 组件编号
CMP-QI：QuickInput
CMP-RC：RecordCard
CMP-RED：RecordEditDrawer
CMP-IP：InsightPanel
CMP-GP：GoalPanel
CMP-TE：TraceExplorer
2. 行为编号
BEH-QI-001：用户输入自然语言
BEH-QI-002：用户点击解析确认
BEH-QI-003：用户编辑语义芯片
BEH-RED-001：用户修改事项归属
BEH-GOAL-001：目标进度刷新
3. 异常编号
ERR-AI-001：AI 超时
ERR-AI-002：AI 返回结构不合法
ERR-DB-001：数据库写入失败
ERR-RLS-001：RLS 权限失败
ERR-CLASSIFY-001：事项匹配低置信度
ERR-COMPUTE-001：统计口径缺失
4. 决策编号
DEC-ITEM-xxx
DEC-GOAL-xxx
DEC-FIELD-xxx
5. 规则 / 计算编号
R-CL-001
C-GOAL-001
这样 AI 诊断时可以直接说：

问题出在 CMP-QI 执行 BEH-QI-002 后，
链路进入 LNK-PARSE-002，
触发 ERR-AI-002，
随后 DEC-FALLBACK 使用 R-FB-002 降级。
这比“看一下 QuickInput 为什么有问题”清晰很多。

Block D 验收标准
关键 AI / 规则判断都有 decision_id
用户纠错能绑定 decision_id
日志是结构化 JSON
错误有 error_code
组件和行为有编号
AI 可以根据编号快速定位问题
九、Block E：令牌化设计体系
目标
1.8 会做维度、投入产出、复盘等大量面板。
如果 1.6 不先建立设计体系，后面 UI 会继续碎片化。

1.6 的设计体系不是做大而全的组件平台，而是准备基础令牌和通用组件。

E1. Design Tokens
建议建立：

颜色
字体
字号
间距
圆角
阴影
边框
状态色
维度色
日志状态色
决策状态色
例如：

dimension.emotion
dimension.finance
dimension.time
dimension.output
dimension.social
dimension.space

status.success
status.warning
status.error
status.pending

trace.step.success
trace.step.failed
trace.step.skipped

decision.corrected
decision.confident
decision.low_confidence
E2. 基础组件
1.6 至少完成：

Card
Panel
StatBlock
Badge
Chip
EmptyState
TrendIndicator
ExplanationBlock
TraceStep
DecisionBadge
LogLine
其中 1.6 最重要的是后 4 个：

ExplanationBlock：解释规则/计算口径
TraceStep：展示链路步骤
DecisionBadge：展示决策状态
LogLine：展示结构化日志
因为它们直接服务于本阶段。

E3. 面板模板
可以准备两个模板：

DebugPanelTemplate
ExplanationPanelTemplate
后续 1.8 再扩展：

DimensionPanelTemplate
ReviewPanelTemplate
InvestmentOutputPanelTemplate
Block E 验收标准
tokens.json 存在
基础 UI tokens 接入
至少 6 个基础组件完成
Trace / Decision / Explanation 使用统一组件
后续面板不需要重新定义基础样式
十、1.6 推荐开发顺序
我建议 1.6 按下面顺序推进：

第 1 步：整理 1.6 生效规则文档和清单
先不要直接写代码。
先生成：

《TETO 1.6 开发规则》
《TETO 1.6 开发清单》
《TETO 1.6 验收清单》
因为 1.6 是工程底座阶段，如果没有清单，很容易发散。

第 2 步：规则中心闭环
先做：

规则编号
规则解释
规则版本
规则调用梳理
第 3 步：计算中心闭环
再做：

计算编号
计算解释
指标来源追溯
included/excluded records
计算版本
第 4 步：trace 链路追踪
建立：

trace_id
step_id
step log
链路中断定位
/debug/traces
第 5 步：decision_id 决策追踪
建立：

decision_id
decision_type
rule_ids
computation_ids
confidence
was_corrected
第 6 步：结构化日志与错误编号
建立：

error_code
component_id
behavior_id
log schema
第 7 步：令牌化设计体系
最后做：

tokens
基础组件
Trace/Decision/Explanation UI
十一、1.6 最小可用闭环
1.6 的最小闭环不是用户看到新功能，而是开发者和 AI 能快速诊断问题。

最小闭环可以定义为：

用户输入一条记录
→ 系统生成 trace_id
→ 每一步有 step_id
→ 关键判断有 decision_id
→ 决策绑定 rule_id / computation_id
→ 如果出错，有 error_code
→ 打开 debug 页面能看到断在哪一步
→ 关键统计数字可以展开解释口径
这就是 1.6 的核心闭环。

十二、1.6 验收标准
建议设置以下 12 条验收标准：

1. RULES_VERSION 已建立
2. COMPUTATION_VERSION 已建立
3. 至少 10 条关键规则有 rule_id 和解释文本
4. 至少 7 个核心指标有 computation_id 和解释能力
5. 录入主链能生成 trace_id
6. 录入主链关键步骤有 step_id
7. 事项匹配、字段回写、目标计入至少 3 类决策有 decision_id
8. 用户纠错能绑定原 decision_id
9. 错误日志有 error_code
10. 组件行为有 component_id / behavior_id
11. /debug/traces 或等价调试入口可查看链路
12. tokens.json + 至少 6 个基础 UI 组件完成
十三、1.6 阶段成果物建议
建议 1.6 最终交付这些东西：

src/lib/rules/
  index.ts
  registry.ts
  explain.ts
  version.ts

src/lib/computation/
  index.ts
  registry.ts
  explain.ts
  version.ts

src/lib/observability/
  trace.ts
  decision.ts
  logger.ts
  error-codes.ts
  behavior-codes.ts

src/components/debug/
  TraceExplorer.tsx
  DecisionDetail.tsx
  LogViewer.tsx

src/components/ui/
  Card.tsx
  Panel.tsx
  Badge.tsx
  Chip.tsx
  EmptyState.tsx
  ExplanationBlock.tsx
  TraceStep.tsx
  DecisionBadge.tsx

src/design/
  tokens.json
  theme.ts
如果涉及数据库，可能需要新增：

trace_logs
decision_logs
error_logs
或者沿用一个统一表：

system_traces
但这里要注意你的项目原则：
docs、sql 文件夹不能随意修改，只能查看和新增文件，不能修改已有文件。

十四、我建议当前最应该做的唯一动作
当前最应该做的唯一动作是：

先正式生成《TETO 1.6 开发规则》和《TETO 1.6 开发清单》，把 1.6 边界固定住。

不要先让编程软件直接开写。

原因是：

1.6 涉及规则中心、计算中心、trace、decision、日志、设计体系
如果没有清单，会非常容易改成大重构
而 1.6 的目标是“闭环和可观测”，不是推翻 1.5
十五、可直接给 ai 编程软件的简短提示词
如果你要先让编程软件做代码审计，可以复制下面这段：

你现在协助开发 TETO 1.6 阶段。

当前阶段目标不是新增业务功能，而是完成：
1. 规则中心闭环
2. 计算中心闭环
3. 故障可观测性与工程质量优化
4. 链路追踪机制
5. 决策 ID 追踪与日志系统
6. 行为模式编号体系
7. 令牌化设计体系

重要前提：
TETO 1.5 已经完成三层九组记录模型、规则中心、计算中心、统计框架、目标规则引擎、AI 降级模式、Domain 不变量体系。
因此 1.6 不允许重做这些已有系统，只能在现有基础上做闭环化、解释化、编号化、追踪化和可观测性增强。

请先只做代码审计，不要修改代码。
重点检查：
- src/lib/rules 是否已有统一入口、是否需要 rule_id / rule_version / explain 能力
- src/lib/computation 是否已有统一入口、是否需要 computation_id / computation_version / explain 能力
- AI 录入增强链路中哪些步骤适合加入 trace_id / step_id
- 哪些关键判断需要 decision_id
- 当前 console.log/error/warn 分布情况，如何替换为结构化日志
- 哪些组件和用户行为需要 component_id / behavior_id
- 当前 UI 是否已有设计 tokens 或通用组件基础
- 不要修改 docs 和 sql 目录已有文件；如需数据库迁移，只能新增迁移文件

输出一份审计报告，包含：
1. 当前已有基础
2. 缺口
3. 最小改动方案
4. 推荐文件结构
5. 第一批可执行任务
总结一句话：

TETO 1.6 应该是“系统底座闭环版本”：把 1.5 已经建立的规则中心、计算中心、目标引擎和录入主链，升级为可解释、可追踪、可诊断、可维护、可复用的工程系统，为 1.8 的维度、投入产出、复盘等上层业务能力打底。