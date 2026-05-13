# 《TETO 1.0 数据表设计（正式版）》

# 一、文档定位

本文件用于定义 TETO 1.0 的核心数据结构，服务于后续：

- Supabase 建表
- 前后端字段对齐
- 表单开发
- 查询与统计逻辑
- 给 Trae 的数据库开发任务拆解

这份设计遵循一个原则：

> **先保证 1.0 可用、清晰、稳定，不追求一开始就做成终极完美数据模型。**

---

# 二、1.0 数据设计总原则

## 2.1 先少表、少关系、少魔法

你现在最需要的是：

- 好理解
- 好开发
- 好维护
- 好改

不是数据库炫技。

---

## 2.2 围绕 4 个核心业务对象建模

TETO 1.0 只围绕以下核心对象展开：

1. 用户 User
2. 每日记录 Daily Record
3. 日记复盘 Diary Review
4. 项目 Project

外加少量辅助表。

---

## 2.3 允许“先固定字段，后动态扩展”

1.0 不强求极度灵活的数据结构。  
像“每日记录项”这种内容，可以先做成半固定模式，后续再增强成动态配置。

---

## 2.4 先支持核心闭环，后支持高级分析

先服务：

- 录入
- 保存
- 回显
- 趋势
- 基础预测

后面再服务：

- 自动结构化
- 高级规则引擎
- 多层分析

---

# 三、1.0 核心表总览

建议 1.0 至少建立以下 6 张主表：

1. profiles
2. daily\_records
3. daily\_record\_items
4. diary\_reviews
5. projects
6. project\_logs

如果你想更轻一点，甚至可以先不单独建 profiles，直接用 Supabase Auth 的用户表。  
但从产品角度，我仍建议保留一个 profile 扩展表。

---

# 四、表结构详细设计

---

# 4.1 profiles

## 作用

存储用户扩展信息。  
认证可以用 Supabase Auth，这张表用于补充产品侧资料。

---

## 建议字段

|字段名|类型|必填|说明|
| ----------------| -------------| ------| -----------------------|
|id|uuid|是|与 auth.users.id 对应|
|name|text|否|用户名|
|avatar\_url|text|否|头像地址|
|timezone|text|否|时区|
|created\_at|timestamptz|是|创建时间|
|updated\_at|timestamptz|是|更新时间|

---

## 说明

- ​`id` 建议直接作为主键，并引用 Supabase Auth 用户 ID。
- 1.0 不必加太多个性化字段。

---

# 4.2 daily\_records

## 作用

每日主记录表。  
表示“某个用户在某一天的一份总记录”。

它是每天记录的主表头。

---

## 建议字段

|字段名|类型|必填|说明|
| ---------------------| ---------------| ------| -----------------------|
|id|uuid|是|主键|
|user\_id|uuid|是|用户 ID|
|record\_date|date|是|记录日期|
|note|text|否|当天简短备注|
|total\_score|numeric(10,2)|否|当日总分|
|completion\_rate|numeric(5,2)|否|当日完成度，0\~100|
|created\_at|timestamptz|是|创建时间|
|updated\_at|timestamptz|是|更新时间|

---

## 关键约束建议

- ​`user_id + record_date` 应唯一

也就是：

> 一个用户一天只能有一条 daily\_records 主记录

---

## 为什么要有这张表

因为你不能把每天所有行为项直接散着存。  
需要一个“日期主对象”去承接：

- 当天所有行为项
- 当天统计汇总
- 当天备注
- 后续仪表盘聚合

---

# 4.3 daily\_record\_items

## 作用

存储某一天的具体行为项明细。

比如：

- 新学单词 30
- 读书 40 分钟
- 运动 20 分钟
- 起床时间 07:10

这张表是 `daily_records` 的子表。

---

## 建议字段

|字段名|类型|必填|说明|
| -------------------------| ---------------| ------| --------------------------------|
|id|uuid|是|主键|
|daily\_record\_id|uuid|是|关联 daily\_records.id|
|item\_key|text|是|行为项唯一键，如 vocab\_new|
|item\_name|text|是|行为项名称，如 新学单词|
|value\_number|numeric(10,2)|否|数值型输入|
|value\_duration|integer|否|时长型输入，建议统一存分钟|
|value\_time|time|否|时间型输入，如起床时间|
|value\_text|text|否|文本型补充值|
|unit|text|否|单位，如 个、分钟|
|sort\_order|integer|否|前端展示顺序|
|created\_at|timestamptz|是|创建时间|
|updated\_at|timestamptz|是|更新时间|

---

## 字段设计解释

### item\_key

这是最重要的字段之一。  
建议固定一套 key，后续前后端都靠它识别。

例如：

- ​`vocab_new`
- ​`vocab_review`
- ​`study_practice`
- ​`reading`
- ​`listening`
- ​`speaking`
- ​`exercise`
- ​`meditation`
- ​`entertainment`
- ​`method_task`
- ​`wake_time`
- ​`sleep_time`

---

### value\_number / value\_duration / value\_time / value\_text

这是典型的“多值字段”做法。  
因为不同记录项类型不同：

- 单词数 → `value_number`
- 读书 30 分钟 → `value_duration`
- 起床时间 → `value_time`
- 特殊补充 → `value_text`

1.0 这样已经足够了。

---

## 关键约束建议

- ​`daily_record_id + item_key` 唯一

也就是：

> 某一天某个行为项只能有一条记录

---

## 为什么不用单表塞所有字段

比如不建议直接这样建一张超宽表：

- vocab\_new
- vocab\_review
- reading\_minutes
- exercise\_minutes
- ...

原因是：

- 后续扩字段很麻烦
- 趋势统计会越来越丑
- 不利于后续可配置化

所以 1.0 用 `daily_records + daily_record_items` 是比较稳的。

---

# 4.4 diary\_reviews

## 作用

存储某一天的日记 / 复盘内容。  
这是自然语言输入和结构化复盘字段的承载表。

---

## 建议字段

|字段名|类型|必填|说明|
| ----------------------| --------------| ------| -----------------------|
|id|uuid|是|主键|
|user\_id|uuid|是|用户 ID|
|review\_date|date|是|复盘日期|
|did\_what|text|否|今天做了什么|
|planned\_what|text|否|原本想做什么|
|completion\_rate|numeric(5,2)|否|今日完成度，0\~100|
|status\_label|text|否|今日状态|
|emotion\_label|text|否|今日情绪|
|biggest\_progress|text|否|今天最重要推进|
|biggest\_problem|text|否|今天最大问题|
|tomorrow\_plan|text|否|明日计划|
|created\_at|timestamptz|是|创建时间|
|updated\_at|timestamptz|是|更新时间|

---

## 关键约束建议

- ​`user_id + review_date` 唯一

也就是：

> 一个用户一天只有一条复盘

---

## 说明

这张表先不要拆太复杂。  
1.0 的重点是：

- 有内容
- 有状态
- 有情绪
- 能回看
- 能展示

不要过早搞：

- 句子级解析结果
- 自动抽取任务表
- 自动情绪识别明细表

---

# 4.5 projects

## 作用

存储长期项目主体。

比如：

- 某门课程学习
- TETO 产品开发
- 某训练计划
- 某职业能力建设项目

---

## 建议字段

|字段名|类型|必填|说明|
| ----------------------------------| ---------------| ------| ---------------------------------|
|id|uuid|是|主键|
|user\_id|uuid|是|用户 ID|
|name|text|是|项目名称|
|category|text|否|项目分类|
|description|text|否|项目描述|
|unit|text|否|进度单位，如 节、页、次、功能点|
|target\_total|numeric(10,2)|否|总目标量|
|current\_progress|numeric(10,2)|否|当前进度|
|start\_date|date|否|开始日期|
|target\_date|date|否|目标完成日期|
|status|text|否|项目状态|
|predicted\_finish\_date|date|否|预测完成日期|
|predicted\_remaining\_days|integer|否|预测剩余天数|
|risk\_level|text|否|风险等级|
|is\_archived|boolean|是|是否归档，默认 false|
|created\_at|timestamptz|是|创建时间|
|updated\_at|timestamptz|是|更新时间|

---

## 状态建议值

1.0 可以先固定：

- active
- paused
- completed
- cancelled

---

## 风险等级建议值

1.0 可以先固定：

- normal
- delayed
- high\_risk

---

## 为什么把预测结果也放进项目表

因为 1.0 你需要快速展示项目卡片和仪表盘摘要。  
把计算结果回写到项目表，查询会更轻、更直接。

后续如果预测逻辑复杂了，再做独立预测表也不迟。

---

# 4.6 project\_logs

## 作用

存储项目推进日志。  
每次项目进度变动，都记一条日志。

这是项目预测的基础数据来源。

---

## 建议字段

|字段名|类型|必填|说明|
| --------------------| ---------------| ------| ------------------|
|id|uuid|是|主键|
|project\_id|uuid|是|关联 projects.id|
|log\_date|date|是|更新日期|
|progress\_added|numeric(10,2)|否|本次新增进度|
|progress\_after|numeric(10,2)|否|更新后总进度|
|note|text|否|更新备注|
|created\_at|timestamptz|是|创建时间|

---

## 说明

比如一个课程项目：

- 总共 100 节
- 今天学了 3 节

那这次日志就是：

- ​`progress_added = 3`
- ​`progress_after = 28`

---

## 为什么需要日志表

因为如果只有 projects.current\_progress，没有历史日志，就无法做：

- 速度分析
- 趋势分析
- 预测完成时间
- 最近是否停滞

所以这张表是必须的。

---

# 五、表关系总览

可以把关系理解成这样：

```
profiles
  └─ 1 对多 → daily_records
  └─ 1 对多 → diary_reviews
  └─ 1 对多 → projects

daily_records
  └─ 1 对多 → daily_record_items

projects
  └─ 1 对多 → project_logs
```

---

# 六、ER 关系说明

---

## 6.1 用户与每日记录

- 一个用户有很多天记录
- 每天最多一条主记录

关系：

- ​`profiles.id -> daily_records.user_id`

---

## 6.2 每日记录与记录项

- 一天记录里包含多个行为项
- 每个行为项只有一条对应值

关系：

- ​`daily_records.id -> daily_record_items.daily_record_id`

---

## 6.3 用户与日记复盘

- 一个用户有很多天复盘
- 每天最多一条复盘

关系：

- ​`profiles.id -> diary_reviews.user_id`

---

## 6.4 用户与项目

- 一个用户有多个项目

关系：

- ​`profiles.id -> projects.user_id`

---

## 6.5 项目与项目日志

- 一个项目有多条推进日志

关系：

- ​`projects.id -> project_logs.project_id`

---

# 七、建议索引设计

为了后面查询顺一点，建议加这些索引。

---

## daily\_records

- ​`(user_id, record_date)` 唯一索引
- ​`record_date` 普通索引

---

## daily\_record\_items

- ​`(daily_record_id, item_key)` 唯一索引
- ​`item_key` 普通索引

---

## diary\_reviews

- ​`(user_id, review_date)` 唯一索引

---

## projects

- ​`user_id` 索引
- ​`status` 索引
- ​`target_date` 索引

---

## project\_logs

- ​`project_id` 索引
- ​`log_date` 索引

---

# 八、1.0 固定行为项字典建议

虽然现在不一定单独建表，但你必须先定一个前后端一致的行为项字典。

建议先在代码常量里维护。

---

## 建议字典

|item\_key|item\_name|类型|单位|
| --------------------| ---------------| -----------------| ------|
|vocab\_new|新学单词|number|个|
|vocab\_review|复习单词|number|个|
|study\_practice|学习练习|duration|分钟|
|reading|读书|duration|分钟|
|listening|听读|duration|分钟|
|speaking|口播|duration|分钟|
|exercise|运动|duration|分钟|
|meditation|冥想|duration|分钟|
|entertainment|娱乐|duration|分钟|
|method\_task|方法任务|duration/number|分钟|
|wake\_time|起床时间|time|-|
|sleep\_time|睡觉时间|time|-|

---

## 为什么先不单独建 behavior\_items 表

因为 1.0 先固定就够了。  
后续如果你要做：

- 行为项自定义
- 不同用户不同模板
- 行为项权重配置

再单独做表。

现在先别多此一举。

---

# 九、1.0 的计算字段建议

有些数据适合实时算，有些适合落库。

---

## 9.1 建议落库的字段

这些字段建议直接存下来：

### daily\_records

- total\_score
- completion\_rate

### projects

- predicted\_finish\_date
- predicted\_remaining\_days
- risk\_level

原因：

- 仪表盘要快
- 查询简单
- 逻辑容易理解

---

## 9.2 建议动态计算的内容

这些可以前端或服务端查询时再算：

- 最近 7 日趋势
- 最近 30 日趋势
- 某行为项总时长
- 某项目最近 7 日推进速度

原因：

- 这些是聚合视图，不一定每次都要落库

---

# 十、字段类型建议说明

---

## 10.1 时间和时长分开存

### 时间点

如：

- 起床时间
- 睡觉时间

用 `time`

### 时长

如：

- 运动 30 分钟
- 读书 45 分钟

用 `integer`，统一按分钟存

这样最稳。

---

## 10.2 百分比统一用 0\~100

如：

- 完成度 completion\_rate

统一用：

- ​`numeric(5,2)`​  
  并采用 0\~100 的语义，不要一会儿 0\~1，一会儿 0\~100。

---

## 10.3 数量统一用 numeric

因为以后你可能出现：

- 2.5 小时
- 1.5 单位
- 半节

所以 `numeric(10,2)`​ 比 `integer` 更通用。

---

# 十一、1.0 最小可用建表方案

如果你想先极简上线，我建议最小可用就这 5\~6 张：

1. profiles
2. daily\_records
3. daily\_record\_items
4. diary\_reviews
5. projects
6. project\_logs

足够了。

---

# 十二、暂时不要建的表

为了防止你扩张过快，这些先不要建。

---

## 12.1 不要先建 behavior\_item\_configs

因为 1.0 行为项先固定。

---

## 12.2 不要先建 emotions 字典表

先用固定枚举或前端常量就行。

---

## 12.3 不要先建 statuses 字典表

状态标签也先固定。

---

## 12.4 不要先建 AI 解析结果表

日记自动结构化不是 1.0 主线。

---

## 12.5 不要先建财务表

明确后置。

---

## 12.6 不要先建第二大脑表

后面再说。

---

# 十三、建议的约束与规则

---

## 13.1 删除规则建议

### daily\_records 删除时

应级联删除：

- daily\_record\_items

---

## 13.2 projects 删除时

应级联删除：

- project\_logs

---

## 13.3 diary\_reviews 删除时

可直接删除，不涉及子表

---

## 13.4 用户删除时

1.0 阶段可先不开放真正删除用户功能  
避免误删所有历史数据。

---

# 十四、RLS 权限建议

如果你用 Supabase，建议一开始就开 RLS。

核心原则：

> 用户只能访问自己的数据

---

## 各表权限原则

- profiles：只能读写自己的
- daily\_records：只能读写自己的
- daily\_record\_items：只能操作自己记录下的明细
- diary\_reviews：只能读写自己的
- projects：只能读写自己的
- project\_logs：只能读写自己项目下的日志

---

# 十五、从页面反推的数据映射

这部分很实用，给你看页面和表怎么对应。

---

## Dashboard 对应数据

读取：

- daily\_records
- diary\_reviews
- projects
- project\_logs

用途：

- 今日摘要
- 趋势
- 项目概览

---

## Daily Record 页面对应数据

写入 / 读取：

- daily\_records
- daily\_record\_items

---

## Diary / Review 页面对应数据

写入 / 读取：

- diary\_reviews

---

## Projects 页面对应数据

写入 / 读取：

- projects
- project\_logs

---

## Stats 页面对应数据

聚合读取：

- daily\_records
- daily\_record\_items
- diary\_reviews
- projects
- project\_logs

---

# 十六、预测逻辑在数据层的最简承载方式

1.0 不要做很复杂模型，建议这样处理。

---

## 16.1 项目预测

通过 `project_logs` 计算最近平均推进速度，然后回写：

- ​`projects.predicted_remaining_days`
- ​`projects.predicted_finish_date`
- ​`projects.risk_level`

---

## 16.2 每日总分

根据 `daily_record_items` 规则计算后回写：

- ​`daily_records.total_score`

---

## 16.3 每日完成度

先手动或规则计算后回写：

- ​`daily_records.completion_rate`  
  或
- ​`diary_reviews.completion_rate`

注意：  
你后面需要决定“当日完成度主来源”放哪边。

我建议：

### 建议做法

- ​`daily_records.completion_rate`：系统总完成度
- ​`diary_reviews.completion_rate`：用户主观完成度

如果你想简单点，1.0 也可以先只保留 diary\_reviews 里的完成度。

---

# 十七、一个重要拍板：完成度字段放哪

这个你后面容易乱，所以我直接给建议。

## 推荐方案

### diary\_reviews.completion\_rate

表示：

> 用户主观填写的今日完成度

### daily\_records.completion\_rate

表示：

> 系统基于行为记录汇总出来的完成度

---

## 1.0 更简化方案

如果你不想复杂：

- 先只用 `diary_reviews.completion_rate`

这样开发更轻。

我个人建议你当前先走​**更简化方案**。

---

# 十八、后续可扩展接口预留

虽然 1.0 不做，但设计时知道口子在哪很重要。

---

## 18.1 日记自动解析

未来可新增：

- diary\_review\_parsed\_items
- diary\_review\_time\_segments

---

## 18.2 行为项配置化

未来可新增：

- behavior\_item\_configs

---

## 18.3 第二大脑

未来可新增：

- notes
- question\_logs
- observation\_logs

---

## 18.4 财务

未来可新增：

- transactions
- financial\_snapshots

---

# 十九、最推荐的 1.0 落地策略

如果你现在马上开始建库，我建议这样做：

---

## 第一阶段先建 4 张表

如果你想最短时间跑起来：

1. daily\_records
2. daily\_record\_items
3. diary\_reviews
4. projects

先把最核心页面跑起来。

---

## 第二阶段补上

5. project\_logs
6. profiles

不过如果你能一次性建好，还是建议直接建全 6 张。

---

# 二十、最终推荐版数据结构

我帮你拍板成最稳的 1.0 版：

### 用户

- profiles

### 每日记录

- daily\_records
- daily\_record\_items

### 日记复盘

- diary\_reviews

### 项目

- projects
- project\_logs

这就是 TETO 1.0 数据层主骨架。

---

# 二十一、你下一步该做什么

现在页面结构和数据表都定了，  
下一步最自然的就是：

# 《给 Trae 的开发任务清单（正式版）》

这个文档要把上面两份真正拆成：

- 第一步做什么
- 每一步生成什么代码
- 每一步验收什么
- AI 该怎么执行

---

# 二十二、补一个非常实用的建议

你后面让 Trae 开发时，不要只给一句：

> 帮我做 TETO

你要分批给，比如：

1. 初始化项目和 Supabase
2. 建 6 张表
3. 做 Daily Record 页
4. 做 Diary Review 页
5. 做 Projects 页
6. 做 Dashboard
7. 做 Stats

每次一个任务块，AI 才不会乱。

---

# 二十三、最终拍板结论

> **TETO 1.0 的数据层不需要大而全，只需要围绕“每日记录、复盘、项目、项目日志”建立稳定骨架。**

这套结构足够你：

- 输入
- 保存
- 回显
- 展示
- 基础预测

已经完全够做第一版了。
