# TETO 1.5 开发清单

## 一、文档定位

本文件管理 **TETO 1.5 阶段**的具体开发任务与顺序。

本文件负责：
- 定义 1.5 做什么、不做什么
- 定义 1.5 的固定开发顺序
- 定义 1.5 的验收链路
- 给 AI / Trae / Cursor 等工具提供可执行开发入口

本文件不负责：
- 定义产品边界与设计哲学（由《TETO 1.5 蓝图方案》负责）
- 定义 AI 协作总则（由《TETO AI 协作总则（总控版）》负责）
- 替代页面设计稿、数据表设计稿、SQL 文件或具体实现代码

来源依据：《TETO 1.5 蓝图方案》

---

## 二、1.5 阶段总定位

> **1.5 先解决"怎么把真实内容正确录进来并能稳定统计"，不先追求复杂历史建模，也不先追求会思考的高级洞察。**

1.5 的本质不是重构骨架，而是围绕真实使用问题，对 1.4 的录入、归类、统计与洞察链路做稳定化深化。

### 三条主线

1. **录入主线** — 让输入低阻力、能接住、清分稳定
2. **归类主线** — 让记录落到正确的事项结构里
3. **统计总结主线** — 让数据可算、结果可看懂

历史记录降为录入主线下的一个特殊子问题，不单独升为主线。

### 最小可用闭环

以下 5 条一成立，1.5 就已经"有用了"：

1. 普通输入更顺手
2. 复合句可基本稳定拆分
3. 归类支持理由回显和修正学习
4. AI 不可用时仍可降级录入
5. 洞察支持固定时间对比 + 可追溯依据

---

## 三、1.5 核心原则

1. **先手动明确，而非自动脑补** — 语义不稳定、统计影响大、归类不确定时，优先允许用户手动明确
2. **统计与洞察优先依赖结构化数据** — 不以自由文本推断直接作为核心统计底座
3. **AI 可以增强，但不能成为单点依赖** — AI 不可用时系统可以变笨，但不能瘫
4. **先做可靠，不做高级** — 洞察先做事实性总结，不做建议型教练
5. **历史导入不拖偏主线** — 历史记录是录入主线下的子问题，不升成主轴

---

## 四、1.5 固定开发顺序

按分期推进，每期内按 P0→P1→P2→… 顺序执行，不跳序。

---

## 第一期：1.4 收尾 + 录入主线基础

### P0：SQL 迁移与旧结构清理

#### 1. 确认执行 011/013/014 SQL 迁移

做什么：
- 在 Supabase 中执行 `011_add_time_anchor_date.sql`、`013_record_semantic_fields.sql`、`014_sub_items_and_repeat_goals.sql`
- 验证 records 表新增字段（time_anchor_date、semantic_*）、sub_items 表、repeat_goals 表存在且 RLS 正确

涉及文件：
- `sql/保留存档sql/sql1.1-1.4/011_add_time_anchor_date.sql`
- `sql/保留存档sql/sql1.1-1.4/013_record_semantic_fields.sql`
- `sql/保留存档sql/sql1.1-1.4/014_sub_items_and_repeat_goals.sql`
- `sql/保留存档sql/sql1.1-1.4/015_backfill_goals_item_id.sql`

验证：
- Supabase 表结构确认新增字段存在
- 现有页面功能不受影响

#### 2. 清理 chains 表 + 移除 items.goal_id

做什么：
- 删除 chains 相关的 DB 操作函数、API 路由、类型定义
- 移除 items 表的 goal_id 字段（若仍存在）
- 清理前端中对 chains 和 items.goal_id 的引用

涉及文件：
- `src/lib/db/` 中 chains 相关（如有）
- `src/types/teto.ts` 中 chains 相关类型
- `src/app/api/v2/` 中 chains 相关路由（如有）
- 前端组件中对 chains 和 items.goal_id 的引用

验证：
- `grep -r "chains\|goal_id"` 在 src/ 下无残留业务引用
- 事项页、记录页功能正常

---

### P1：规则兜底层

#### 3. 规则兜底层实现

做什么：
- 新建 `src/lib/ai/parse-rules-fallback.ts`
- 当 AI 解析不可用时，提供本地基础解析能力：
  - 基础时间识别（昨天、今天、上周X）
  - 基础关键词→事项映射（使用已有 user_rules 或 items 关键词）
  - 不复杂的复合句不自动拆，整条录入

涉及文件：
- 新建 `src/lib/ai/parse-rules-fallback.ts`
- 修改 `src/lib/ai/enhance-record.ts`（降级判断 + 兜底调用）
- 修改 `src/app/(dashboard)/records/components/QuickInput.tsx`（降级提示展示）

验证：
- 模拟 AI 不可用（API 超时/报错）→ 录入不断 → 事项可手选 → 轻提示用户当前模式

---

### P2：QuickInput 语义卡片 UI 升级

#### 4. 语义卡片 UI 升级

做什么：
- 将芯片区（chips）升级为更丰富的语义展示结构：
  - **主体行**：核心行为/事件摘要
  - **上下文行**：事项归属、子项归属
  - **修饰行**：情绪、地点、关系人等附加信息
  - **数据行**：时长、数量、金额等量化字段
  - **关联行**：关联记录、关联目标等

涉及文件：
- `src/app/(dashboard)/records/components/QuickInput.tsx`

验证：
- 输入"背了30个单词，感觉不错" → 卡片展示：主体"背单词" + 数据"30个" + 修饰"感觉不错"
- 输入"学了2小时英语" → 卡片展示：主体"学英语" + 数据"2小时" + 上下文"英语"

---

### P3：记录卡片展示增强

#### 5. 记录卡片展示增强

做什么：
- RecordItem 组件增加展示：
  - 时间锚点标记（time_anchor_date 可视化）
  - 关联链接（record_links 可视化，可点击跳转）
  - 关系人/地点标签（semantic 关系人和地点字段）
- RecordEditDrawer 增加编辑入口

涉及文件：
- `src/app/(dashboard)/records/components/RecordItem.tsx`
- `src/app/(dashboard)/records/components/RecordEditDrawer.tsx`

验证：
- 有关联链接的记录 → 在卡片中可见链接、可点击跳转
- 有关系人/地点的记录 → 在卡片中可见标签
- 有时间锚点的记录 → 可视化标记

---

### P4：user_rules 表 + AI 判断理由回显

#### 6. 新增 user_rules 表

做什么：
- 创建 user_rules 表（SQL 迁移）
- 实现对应 DB 操作函数（CRUD）
- 实现对应 API 路由

涉及文件：
- 新建 SQL 迁移文件
- 新建 `src/lib/db/user-rules.ts`
- 新建 `src/app/api/v2/user-rules/route.ts`
- `src/types/teto.ts` 新增类型

方向参考（字段）：
```sql
CREATE TABLE user_rules (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  rule_type TEXT NOT NULL,        -- 'item_mapping' | 'sub_item_mapping' | 'type_routing' | 'fuzzy_resolution'
  trigger_pattern TEXT NOT NULL,  -- 触发模式（关键词/表达式）
  target_id UUID,                 -- 目标对象ID（事项/子项）
  target_type TEXT,               -- 'item' | 'sub_item'
  confidence TEXT DEFAULT 'high', -- 'high' | 'medium' | 'low'
  source TEXT DEFAULT 'ai_learned', -- 'ai_learned' | 'user_set' | 'system_default'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

验证：
- user_rules 表存在且 RLS 生效
- API 可正常 CRUD

#### 7. AI 判断理由回显

做什么：
- 在 `enhance-record.ts` 的 AI 回写结果中增加 `reasoning` 字段
- 前端在记录详情/编辑抽屉中展示 AI 判断理由

涉及文件：
- `src/lib/ai/enhance-record.ts`
- `src/app/(dashboard)/records/components/RecordEditDrawer.tsx`
- `src/app/(dashboard)/records/components/RecordItem.tsx`

验证：
- AI 归到某事项 → 记录详情中可看到"判断理由"和"置信度"

---

### P5：计划类记录日期提醒

#### 8. 计划类记录日期提醒

做什么：
- 支持 time_anchor.direction='future' 的计划类记录
- 新增提醒机制：计划日期到达时给出提醒
- 具体提醒方式（页面内通知/弹窗/标记）待实施时定

涉及文件：
- `src/lib/db/records.ts`
- `src/app/(dashboard)/records/components/QuickInput.tsx` 或布局组件
- SQL: 可能需要新增字段或索引

验证：
- 创建一条计划类记录，时间锚点设为未来 → 到达时可见提醒

---

### P6：复合句拆分逻辑升级

#### 9. 复合句拆分逻辑升级

做什么：
- 升级 `parse-semantic.ts` 中的复合句拆分逻辑
- 按"可独立统计的行为单元"拆分，而非单纯语法拆分
- 拆分标准：
  - 不同动作 → 拆
  - 不同事项 → 拆
  - 不同时间段 → 拆
  - 不同统计对象 → 拆
  - 同一行为的补充说明/情绪/评价 → 不拆

涉及文件：
- `src/lib/ai/parse-semantic.ts`
- `src/lib/ai/enhance-record.ts`

验证：
- 输入"学了英语还健身了" → 拆为 2 条记录，分别归类
- 输入"背了30个单词，感觉状态不错" → 不拆，1 条记录

---

## 第二期：录入主线完善 + 归类主线启动

### P7：概括性历史识别与保存

#### 10. 概括性历史识别和保存

做什么：
- 在解析模块中识别概括性历史输入（"那段时间基本每天7:40起床"）
- 保存为"规律"标记的记录（is_period_rule=true）
- 先只做识别和保存，不做复杂自动展开
- 规律记录状态：未展开（一条规律记录 + 时间范围）

涉及文件：
- `src/lib/ai/parse-semantic.ts`（识别逻辑）
- `src/lib/ai/enhance-record.ts`（处理逻辑）
- SQL: records 表新增字段（见下方 #11 data_nature 字段一起做）

验证：
- 输入"那段时间基本每天7:40起床" → 被识别为规律型 → 保存为规律标记记录

---

### P8：data_nature 字段支持

#### 11. data_nature 字段与规律相关字段支持

做什么：
- records 表新增字段：
  - `data_nature TEXT DEFAULT 'fact'`（'fact' | 'inferred'）
  - `period_start_date DATE`
  - `period_end_date DATE`
  - `period_frequency TEXT`（'daily' | 'weekly' | 'monthly' | 'irregular'）
  - `is_period_rule BOOLEAN DEFAULT false`
  - `period_expanded BOOLEAN DEFAULT false`
  - `period_source_id UUID`（推断条目的来源规律记录 ID）
- 对应 DB 操作函数和 API 支持
- 前端类型定义更新

涉及文件：
- 新建 SQL 迁移文件
- `src/lib/db/records.ts`
- `src/app/api/v2/records/`
- `src/types/teto.ts`

验证：
- records 表新字段存在
- API 可读写新字段
- 规律记录保存后新字段正确

---

### P9：模糊输入 3 类区分

#### 12. 模糊输入 3 类区分

做什么：
- 在解析模块中将模糊输入分为 3 类：
  - **A. 无法理解**：表达太碎、缺主语缺动作 → 要求澄清
  - **B. 信息不足**：可理解但缺关键信息 → 优先补信息，可先收为低精度记录
  - **C. 不合理**：内容太多/时间冲突/计划结果混杂 → 提示拆分或改写
- 前端 QuickInput 中对应 3 种交互反馈

涉及文件：
- `src/lib/ai/parse-semantic.ts`
- `src/lib/ai/enhance-record.ts`
- `src/app/(dashboard)/records/components/QuickInput.tsx`

验证：
- 输入过于碎片化的内容 → 系统要求澄清，不直接落地
- 输入"搞了会儿那个" → 提示补信息或先收为低精度
- 输入一条塞了太多不相关内容的 → 提示拆分

---

### P10：确认分级逻辑

#### 13. 确认分级逻辑（低/中/高风险不同策略）

做什么：
- 实现蓝图中 3.4 节的确认分级：
  - **低风险**（"今天学了英语"）→ 先落地，后续可改
  - **中风险**（"最近状态不太好"）→ 候选确认，给出选项
  - **高风险**（"我去年基本都是8:30上班"）→ 禁止自动处理，必须用户确认
- 在解析结果中增加风险等级判定
- 前端对应不同交互策略

涉及文件：
- `src/lib/ai/parse-semantic.ts`（风险等级判定）
- `src/lib/ai/enhance-record.ts`
- `src/app/(dashboard)/records/components/QuickInput.tsx`

验证：
- 低风险输入 → 直接落地，无需额外确认
- 中风险输入 → 展示候选选项，用户选择后落地
- 高风险输入 → 不自动处理，弹确认框

---

### P11：AI 降级模式完善

#### 14. AI 降级模式完善

做什么：
- 完善降级模式的交互体验：
  - 基础模式提示"当前智能解析不可用，已切换基础模式"
  - 手选事项（下拉选择事项）
  - 交互层收口（降级时不展示需要 AI 的交互元素）
- 确保已学习的本地规则在降级模式下仍生效

涉及文件：
- `src/lib/ai/parse-rules-fallback.ts`（完善）
- `src/lib/ai/enhance-record.ts`（降级判断）
- `src/app/(dashboard)/records/components/QuickInput.tsx`（降级交互）

验证：
- AI 不可用 → 轻提示 → 手动选事项 → 录入成功
- AI 不可用 → 已学习规则仍生效（如"背单词"→英语 仍然映射正确）

---

## 第三期：归类主线 + 统计总结主线启动

### P12：事项页升级为执行+回看并存结构

#### 15. 事项页执行+回看并存结构

做什么：
- 事项页从"偏档案展示"升级为"执行+回看并存"：
  - **执行区**：帮助当前推进（当前活跃子项、最近推进、卡点提醒）
  - **档案区**：帮助回看积累（历史记录、阶段、目标回看）
- 具体形态待定，先实现基础分栏

涉及文件：
- `src/app/(dashboard)/items/ItemsClient.tsx`
- `src/app/(dashboard)/items/components/` 下相关组件
- `src/app/api/v2/items/`

验证：
- 进入事项 → 可见执行区（当前推进）和档案区（积累回看）

---

### P13：想法→计划/事项转化

#### 16. 想法记录转化能力

做什么：
- 想法类记录支持一键转化：
  - 转为计划类记录
  - 转为新事项
- 转化后原想法记录保留，标记为已转化

涉及文件：
- `src/app/(dashboard)/records/components/RecordItem.tsx`
- `src/app/(dashboard)/records/components/RecordEditDrawer.tsx`
- `src/lib/db/records.ts`
- `src/lib/db/items.ts`

验证：
- 一条想法记录 → 点击"转为计划" → 生成计划类记录 → 原想法标记已转化
- 一条想法记录 → 点击"转为事项" → 创建新事项 → 原想法标记已转化

---

### P14：非事项数据统计区

#### 17. 非事项数据统计区

做什么：
- 洞察页或事项页增加"非事项数据"统计区
- 允许未归类到事项的记录有独立的统计展示
- 不强制归入事项

涉及文件：
- `src/app/(dashboard)/insights/InsightsClient.tsx`
- 新增或修改 `src/app/(dashboard)/insights/components/` 下的组件
- `src/lib/db/insights.ts`

验证：
- 有未归入事项的记录 → 洞察页可见"非事项数据"统计

---

### P15：阶段与执行视图分离

#### 18. 阶段与执行视图分离

做什么：
- 阶段 = 时间切片（描述一段时间）
- 执行视图 = 当前推进面板（帮助现在推进）
- 两者不在同一个页面逻辑中混用

涉及文件：
- `src/app/(dashboard)/items/components/PhaseList.tsx`
- `src/app/(dashboard)/items/components/PhaseCard.tsx`
- 事项页相关组件

验证：
- 阶段展示为时间切片
- 执行视图展示为当前推进面板
- 两者不混淆

---

## 第四期：统计总结主线完善 + 个性化

### P16：统计口径定义层

#### 19. 统一口径定义层

做什么：
- 建立轻量统计口径定义层，至少统一 5 个核心指标：
  - **活跃度**（按最近更新时间 + 记录频率综合）
  - **投入**（按时长为主，记录条数为辅）
  - **停滞**（连续 N 天无记录）
  - **计划达成率**（按时完成比例）
  - **效果**（按结果记录 + 目标结果字段综合）
- 每个口径明确：计算方式、时间范围、数据纳入范围、是否包含推断数据、按记录数/时长/结果值计算
- 口径定义集中维护（可为配置文件或常量模块）

涉及文件：
- 新建 `src/lib/stats/metrics.ts`（口径定义）
- 修改 `src/lib/db/insights.ts`
- 修改洞察相关组件

验证：
- 统计页面使用的"活跃度""投入""停滞"等指标计算方式统一
- 同一指标在不同图表中口径一致

---

### P17：统计 4 主轴实现

#### 20. 统计 4 主轴实现

做什么：
- 实现 4 条统计主轴：
  - **行动 vs 目标**：做了什么 / 和目标是否一致 / 离目标多远
  - **时间 vs 计划**：指定时间内有没有推进 / 是否按预期节奏 / 是否延期
  - **投入 vs 效果**：花了多少时间精力 / 有没有产生结果
  - **近期时间分布**：最近花最多时间在哪 / 高频低效 / 长期占用

涉及文件：
- `src/lib/db/insights.ts`
- `src/lib/stats/`（新建目录）
- `src/app/(dashboard)/insights/` 下组件
- `src/app/api/v2/insights/`

验证：
- 洞察页可查询 4 条主轴的基本数据

---

### P18：洞察固定时间对比 + 可追溯依据

#### 21. 洞察固定时间对比

做什么：
- 实现固定对比：
  - 本周 vs 上周
  - 本月 vs 上月
  - 最近 30 天 vs 前 30 天
- 洞察默认展示层级：全局总览 → 事项下钻 → 目标/阶段/锚点视角
- 每条洞察自带：时间范围 + 对比对象 + 统计依据 + 数据来源链接

涉及文件：
- `src/lib/db/insights.ts`
- `src/app/(dashboard)/insights/InsightsClient.tsx`
- `src/app/(dashboard)/insights/components/` 下组件

验证：
- 洞察页可见"本周 vs 上周"对比
- 点击洞察可追溯数据来源

---

### P19：规则化事实总结（第一层）

#### 22. 规则化事实总结

做什么：
- 实现第一层洞察：规则化事实总结（不依赖 LLM）
- 示例："最近 30 天英语 12 小时，上期 17 小时，下降 29%"
- 示例："本周工作占比 48%，高于上周 12%"
- 基于结构化统计口径生成事实性总结

涉及文件：
- 新建 `src/lib/stats/fact-summary.ts`
- `src/app/(dashboard)/insights/` 下组件

验证：
- 洞察页下方有事实性总结
- 总结中的数据与图表一致
- 总结不包含"你应该..."式建议

---

### P20：自然语言润色（第二层）

#### 23. 自然语言润色

做什么：
- 新建 `src/lib/ai/generate-insights.ts`
- 基于第一层结构化事实总结做自然语言润色
- LLM 只负责表达，不直接从原始数据自由发挥
- 低频生成（按需或每日缓存一次）

涉及文件：
- 新建 `src/lib/ai/generate-insights.ts`
- `src/app/(dashboard)/insights/InsightsClient.tsx`
- `src/app/api/v2/insights/`

验证：
- 洞察页有自然语言总结
- 总结基于事实数据，不编造
- AI 不可用时第一层事实总结仍可见

---

### P21：被动规则学习

#### 24. 被动规则学习

做什么：
- 用户修正 AI 判断时，自动写入 user_rules
- 学习 3 类：
  - 事项归属偏好（"背单词"→英语）
  - 子项归属偏好（"听力"→英语.听读）
  - 常见词汇映射（"跑步"→健身）
- 下次类似输入自动应用修正后的规则

涉及文件：
- `src/lib/db/user-rules.ts`
- `src/lib/ai/enhance-record.ts`（修正时写入规则）
- `src/lib/ai/parse-semantic.ts`（解析时应用规则）

验证：
- AI 归到错误事项 → 用户修正 → 修正写入 user_rules
- 下次输入同类内容 → 自动应用修正后的规则

---

### P22：轻量规则管理面板

#### 25. 轻量规则管理面板

做什么：
- 在设置页增加"规则总览"面板：
  - 查看系统学到的归类偏好（事项映射、子项映射、词汇映射）
  - 删除明显学错的偏好
  - 重置个性化学习
- 展示 AI 判断规则：
  - 事项→关键词映射
  - 子项→关键词映射
  - 计划/发生分流规则
  - 常见模糊表达→默认解释

涉及文件：
- 新建设置页规则管理组件
- `src/lib/db/user-rules.ts`
- `src/app/api/v2/user-rules/`

验证：
- 可看到系统学到的归类偏好列表
- 可删除某条偏好
- 可重置全部学习结果

---

### P23：手动数据导出

#### 26. 手动数据导出

做什么：
- 支持手动导出用户数据
- 导出格式优先可读、可迁移、可还原
- 至少支持 CSV/JSON 格式

涉及文件：
- 新建 `src/app/api/v2/export/route.ts`
- 新建导出功能 UI 入口
- `src/lib/db/` 相关查询

验证：
- 点击导出 → 下载文件 → 文件可读、数据完整

---

## 五、1.5 不做的事

1. 不做多人协作/排名
2. 不做企业/团体/家庭联动
3. 不做移动端优先
4. 不做复杂评分模型
5. 不做重 AI 自动决策（不可撤销的自动操作）
6. 不做第二大脑式扩张
7. 不做事项间复杂关系图谱
8. 不做深度因果推理
9. 不做笔记系统正式化
10. 不做死模板硬套用户
11. 不做"你应该..."式建议型洞察
12. 不做模糊历史数据直接进入核心精确统计
13. 不做把阶段和执行视图混成一个页面逻辑

### 最需要防的 3 个坑

1. **历史导入越做越重** — 必须压住
2. **记录类型越加越多** — 4 核心类型为主，不强扩
3. **洞察一上来就想变聪明** — 先做可靠，不做高级

---

## 六、验收链路

### A. 必验收主链

**链路 1：录入顺手且正确**

- 输入"背了30个单词" → 正确清分为发生类 → 归到英语→单词 → 显示判断理由 → 用户可修正
- 输入"学了英语还健身了" → 拆为 2 条 → 分别归类
- 概括性历史输入能被识别并以非事实方式承接
- 低风险输入直接落地、中风险候选确认、高风险必须用户确认
- AI 不可用时 → 系统切换基础模式 → 录入不断 → 本地规则仍生效 → 轻提示

**链路 2：归类稳定可修正**

- AI 归到某事项 → 显示判断理由 → 用户修正 → 修正后系统记住
- 非事项数据存在但不强制归类

**链路 3：统计可信**

- 统计默认基于原始事实记录
- 包含推断数据时标注"含 N 条推断数据"
- 4 条统计主轴可查询
- 核心指标口径统一（活跃度/投入/停滞/计划达成率/效果）

**链路 4：洞察可信**

- 打开洞察页 → 看到全局总览 → 可下钻到事项 → 可进入目标/阶段/锚点视角
- 图表 + 对比视角（本周 vs 上周、本月 vs 上月）
- 下方有事实性总结 → 每条洞察自带时间范围 + 对比对象 + 统计依据
- 可追溯数据来源
- 不做"你应该..."式建议

**链路 5：AI 降级有韧性**

- AI 不可用 → 系统切换基础模式 → 录入不断 → 本地规则仍生效 → 轻提示用户当前模式

### B. 增量验收

**链路 6：1.4 遗留全清**

- 语义卡片 UI、规则兜底、记录卡片增强、计划提醒全部可用
- chains 表已删除、items.goal_id 已移除

**链路 7：规则可管理**

- 可看到系统学到的归类偏好 → 能删除明显学错的 → 能重置个性化学习

**链路 8：数据可导出**

- 支持手动导出 → 导出格式可读、可迁移

---

## 七、当前唯一优先任务

> **先完成第一期 P0：确认执行 SQL 迁移 + 清理 chains 表与 items.goal_id。**

在这一步完成前，不先展开后续录入增强或归类增强。

原因：旧结构不先清干净，新增功能容易再次混进旧结构，最后返工。

---

## 八、分期总览

| 分期 | 核心任务 | 对应 P 编号 | 对应蓝图章节 |
|------|---------|------------|------------|
| 第一期 | 1.4 收尾 + 录入主线基础 | P0-P6 | 蓝图 §2 + §3 + §8 |
| 第二期 | 录入主线完善 + 归类主线启动 | P7-P11 | 蓝图 §3 + §4 |
| 第三期 | 归类主线 + 统计总结主线启动 | P12-P15 | 蓝图 §5 + §8 |
| 第四期 | 统计总结主线完善 + 个性化 | P16-P23 | 蓝图 §6 + §7 |

---

## 九、当前阶段定义

```
当前生效开发阶段
- 当前主阶段：TETO 1.5
- 当前任务类型：录入/归类/统计三条主线稳定化深化
- 当前生效蓝图文档：《TETO 1.5 蓝图方案》
- 当前生效清单文档：《TETO 1.5 开发清单》
- 当前禁止进入：移动端优先 / 复杂AI自动决策 / 多人协作 / 企业权限 / 平台化扩张 / 历史建模升为主轴 / 建议型洞察 / 记录类型随意扩张
```
