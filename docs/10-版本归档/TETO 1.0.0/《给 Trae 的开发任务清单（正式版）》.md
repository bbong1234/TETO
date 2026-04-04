# 《给 Trae 的开发任务清单（正式版）》

# 一、文档定位

本文件用于把 TETO 1.0 的产品规划、页面结构、数据表设计，拆解成：

- 可逐步执行的开发任务
- 可直接交给 Trae / AI 编程助手的任务块
- 可验收的里程碑清单

这份文档的核心原则是：

> **一次只让 AI 完成一个边界清晰的小任务。**

不要把整个 TETO 一次性丢给 AI。  
要像“分阶段施工”一样推进。

---

# 二、开发总目标

TETO 1.0 的目标是做出一个你自己可以稳定使用的产品，完成以下闭环：

```
每日记录
→ 日记复盘
→ 项目更新
→ 仪表盘查看结果
→ 基础统计与预测
```

---

# 三、开发总顺序

建议严格按这个顺序开发：

## 阶段 0：项目初始化

1. 初始化前端项目
2. 集成基础 UI 和工具链
3. 配置 Supabase
4. 配置登录认证
5. 搭建基础布局和导航

## 阶段 1：数据层与基础能力

6. 建数据库表
7. 配置 RLS
8. 封装数据库访问层
9. 建立行为项常量和基础类型

## 阶段 2：核心输入功能

10. 开发 Daily Record 页面
11. 开发 Diary / Review 页面
12. 开发 Projects 页面

## 阶段 3：展示与反馈

13. 开发 Dashboard 页面
14. 开发 Stats 页面

## 阶段 4：收尾与可用性增强

15. 基础计算逻辑
16. 基础预测逻辑
17. 错误处理和空状态
18. UI 调整与验收

---

# 四、给 Trae 下任务的通用规则

你后面每次给 Trae 发任务时，建议都遵循以下格式：

## 4.1 任务结构模板

每次都包含这 6 段：

1. 任务目标
2. 技术要求
3. 页面/模块范围
4. 输出内容
5. 验收标准
6. 注意事项

---

## 4.2 示例指令风格

你可以这样发：

> 现在请你帮我完成 TETO 1.0 的“每日记录页面”开发。  
> 技术栈：Next.js + TypeScript + Tailwind + shadcn/ui + Supabase。  
> 请只做该任务，不要扩展其他模块。  
> 需要实现页面表单、按日期读取、保存、编辑回显。  
> 完成后请给出：  
> 1）新增/修改了哪些文件  
> 2）核心实现逻辑  
> 3）还需要我补什么配置

这类指令会比“帮我做个系统”强很多。

---

# 五、正式任务拆解

下面开始按阶段写具体任务。

---

# 阶段 0：项目初始化

---

## 任务 0-1：初始化 Next.js 项目

### 任务目标

创建 TETO 1.0 的前端项目基础框架。

### 技术要求

- Next.js
- TypeScript
- App Router
- Tailwind CSS

### 输出内容

- 完整的 Next.js 项目初始化
- 基础目录结构
- 可运行的首页
- TypeScript 和 Tailwind 配置完成

### 建议目录结构

```
src/
  app/
  components/
  lib/
  types/
  constants/
```

### 验收标准

- 项目可以本地启动
- 首页可以正常访问
- Tailwind 样式生效
- TypeScript 无报错

### 发给 Trae 的指令模板

> 请帮我初始化一个 TETO 1.0 项目，技术栈使用 Next.js App Router + TypeScript + Tailwind CSS。请创建清晰的 src 目录结构，确保项目可直接运行。不要加入无关业务代码。

---

## 任务 0-2：集成 shadcn/ui 与基础 UI 结构

### 任务目标

集成 shadcn/ui，并建立基础页面布局能力。

### 技术要求

- shadcn/ui
- 基础 Layout
- 基础导航结构

### 输出内容

- 安装并配置 shadcn/ui
- 全局布局文件
- 基础导航栏或侧边栏
- 页面容器组件

### 验收标准

- 可以使用 shadcn/ui 组件
- 页面具备统一布局
- 导航中至少有以下入口：

  - Dashboard
  - Daily Record
  - Diary / Review
  - Projects
  - Stats

### 发给 Trae 的指令模板

> 请在当前 Next.js 项目中集成 shadcn/ui，并搭建一个基础后台布局。需要包含全局 layout 和主导航，导航项为 Dashboard、Daily Record、Diary / Review、Projects、Stats。先做静态页面入口，不接业务数据。

---

## 任务 0-3：集成 Supabase

### 任务目标

完成 Supabase 客户端接入。

### 技术要求

- Supabase JS SDK
- 环境变量配置
- 客户端工具封装

### 输出内容

- 安装 Supabase 依赖
- 创建 Supabase client 工具文件
- ​`.env.example`
- 连接测试逻辑

### 验收标准

- 可以从项目中成功访问 Supabase
- 环境变量结构清晰
- 不把密钥写死在代码里

### 发给 Trae 的指令模板

> 请在当前项目中集成 Supabase，完成客户端初始化、环境变量配置示例和基础工具封装。不要写业务表逻辑，只做好连接准备。

---

## 任务 0-4：实现登录认证

### 任务目标

完成基础登录能力，确保用户数据隔离。

### 技术要求

- Supabase Auth
- 邮箱登录或 Magic Link
- 路由保护

### 输出内容

- 登录页
- 登出按钮
- 登录态检测
- 未登录跳转逻辑

### 验收标准

- 用户可以登录
- 未登录不能访问主业务页
- 登录后进入 Dashboard

### 发给 Trae 的指令模板

> 请基于 Supabase Auth 实现 TETO 1.0 的基础登录能力。使用邮箱登录或 Magic Link 均可。要求：未登录用户不能访问 Dashboard、Daily Record、Diary / Review、Projects、Stats 页面，登录后进入 Dashboard。

---

# 阶段 1：数据层与基础能力

---

## 任务 1-1：创建数据库表结构

### 任务目标

根据 TETO 1.0 数据设计创建核心数据表。

### 需要创建的表

- profiles
- daily\_records
- daily\_record\_items
- diary\_reviews
- projects
- project\_logs

### 输出内容

- SQL 建表脚本
- 索引
- 唯一约束
- 外键关系

### 必须包含的关键约束

- ​`daily_records(user_id, record_date)` 唯一
- ​`daily_record_items(daily_record_id, item_key)` 唯一
- ​`diary_reviews(user_id, review_date)` 唯一

### 验收标准

- 表能成功创建
- 表关系正确
- 字段名与设计文档一致

### 发给 Trae 的指令模板

> 请根据以下表结构设计，为 TETO 1.0 生成 Supabase/PostgreSQL 建表 SQL，包括 profiles、daily\_records、daily\_record\_items、diary\_reviews、projects、project\_logs 六张表，要求带主键、外键、唯一约束、索引。不要自行增加与 1.0 无关的表。

---

## 任务 1-2：配置 RLS 权限

### 任务目标

确保用户只能访问自己的数据。

### 输出内容

- 每张表的 RLS 开启语句
- select / insert / update / delete 策略

### 权限原则

- 用户只能读写自己拥有的数据
- project\_logs 需要通过项目所有权间接校验

### 验收标准

- A 用户无法读取 B 用户数据
- 登录后用户可正常操作自己的数据

### 发给 Trae 的指令模板

> 请为 TETO 1.0 的六张核心表配置 Supabase RLS 策略，原则是用户只能访问自己的数据。请输出完整 SQL，并说明每条策略的作用。

---

## 任务 1-3：建立 TypeScript 类型与常量

### 任务目标

建立前后端一致的数据类型和行为项常量。

### 输出内容

- ​`types/` 下的核心类型定义
- ​`constants/recordItems.ts`
- 状态标签常量
- 情绪标签常量

### 固定行为项

- vocab\_new
- vocab\_review
- study\_practice
- reading
- listening
- speaking
- exercise
- meditation
- entertainment
- method\_task
- wake\_time
- sleep\_time

### 验收标准

- 页面表单和数据库字段有一致类型
- 常量集中管理，不散落页面里

### 发给 Trae 的指令模板

> 请为 TETO 1.0 建立核心 TypeScript 类型定义和常量文件，包括 Daily Record、Diary Review、Project、Project Log，以及每日固定行为项字典、状态标签、情绪标签。要求后续页面可以直接复用。

---

## 任务 1-4：封装基础数据访问层

### 任务目标

建立清晰的数据库访问函数，不要把 SQL/查询逻辑散在页面里。

### 输出内容

建议创建：

- ​`lib/db/dailyRecords.ts`
- ​`lib/db/diaryReviews.ts`
- ​`lib/db/projects.ts`

### 核心方法建议

#### dailyRecords

- getDailyRecordByDate
- upsertDailyRecord
- upsertDailyRecordItems

#### diaryReviews

- getDiaryReviewByDate
- upsertDiaryReview

#### projects

- getProjects
- getProjectById
- createProject
- updateProject
- addProjectLog

### 验收标准

- 页面可直接调用封装方法
- 查询逻辑不分散
- 命名清晰

### 发给 Trae 的指令模板

> 请为 TETO 1.0 封装基础数据访问层，把 daily records、diary reviews、projects 的 CRUD 逻辑抽到 lib/db 目录中。页面不要直接写复杂数据库操作。

---

# 阶段 2：核心输入功能

---

# 任务 2-1：开发 Daily Record 页面

### 任务目标

完成每日记录页的核心功能。

### 页面路径建议

​`/daily-record`

### 功能要求

- 日期选择
- 固定行为项表单
- 支持数量、时长、时间类型输入
- 加载某日期已有记录
- 保存和更新记录
- 简短备注
- 保存成功提示

### 页面字段

- 新学单词
- 复习单词
- 学习练习
- 读书
- 听读
- 口播
- 运动
- 冥想
- 娱乐
- 方法任务
- 起床时间
- 睡觉时间
- 备注

### 输出内容

- 页面 UI
- 表单逻辑
- 按日期读取和回显
- 保存逻辑

### 验收标准

- 可切换日期
- 可录入
- 可保存
- 可编辑
- 可回显
- 不同类型字段组件正确

### 注意事项

- 不要加动态自定义行为项
- 不要加 AI 解析
- 不要加复杂统计卡

### 发给 Trae 的指令模板

> 请开发 TETO 1.0 的 Daily Record 页面，路径为 /daily-record。  
> 技术栈：Next.js + TypeScript + Tailwind + shadcn/ui + Supabase。  
> 需求：
>
> 1. 支持日期选择
> 2. 固定行为项输入：vocab\_new、vocab\_review、study\_practice、reading、listening、speaking、exercise、meditation、entertainment、method\_task、wake\_time、sleep\_time
> 3. 支持按日期读取已有记录并回显
> 4. 支持保存和更新
> 5. 支持备注字段  
>    请不要扩展成动态行为项系统。完成后请列出修改文件和实现说明。

---

# 任务 2-2：开发 Diary / Review 页面

### 任务目标

完成日记复盘页的核心功能。

### 页面路径建议

​`/diary-review`

### 功能要求

- 日期选择
- 多行文本输入
- 完成度输入
- 状态选择
- 情绪选择
- 保存和更新
- 按日期读取和回显

### 页面字段

- 今天做了什么 did\_what
- 原本想做什么 planned\_what
- 完成度 completion\_rate
- 今日状态 status\_label
- 今日情绪 emotion\_label
- 最重要推进 biggest\_progress
- 最大问题 biggest\_problem
- 明日计划 tomorrow\_plan

### 输出内容

- 页面表单
- 保存逻辑
- 读取逻辑
- 回显逻辑

### 验收标准

- 可按日期填写复盘
- 可保存
- 可修改
- 可回显
- 字段完整

### 注意事项

- 不要做自动文本解析
- 不要做情绪识别
- 不要做项目自动提取

### 发给 Trae 的指令模板

> 请开发 TETO 1.0 的 Diary / Review 页面，路径为 /diary-review。  
> 要求：
>
> 1. 支持日期选择
> 2. 支持填写 did\_what、planned\_what、completion\_rate、status\_label、emotion\_label、biggest\_progress、biggest\_problem、tomorrow\_plan
> 3. 支持按日期读取、保存、更新、回显
> 4. 使用清晰的表单布局  
>    不要加入 AI 自动解析或额外复杂功能。

---

# 任务 2-3：开发 Projects 页面

### 任务目标

完成项目管理页核心功能。

### 页面路径建议

​`/projects`

### 功能要求

- 查看项目列表
- 创建项目
- 编辑项目基础信息
- 查看项目详情
- 更新项目进度
- 展示项目日志
- 显示基础预测字段

### 项目字段

- name
- category
- description
- unit
- target\_total
- current\_progress
- start\_date
- target\_date
- status

### 项目日志字段

- log\_date
- progress\_added
- note

### 输出内容

- 项目列表 UI
- 新建项目弹窗或表单
- 项目详情区
- 更新进度逻辑
- 项目日志显示

### 验收标准

- 能创建项目
- 能更新进度
- 能看到日志
- 当前进度能同步更新

### 注意事项

- 不做多级项目树
- 不做成员协作
- 不做任务子表

### 发给 Trae 的指令模板

> 请开发 TETO 1.0 的 Projects 页面，路径为 /projects。  
> 要求：
>
> 1. 展示当前用户的项目列表
> 2. 支持创建项目，字段包括 name、category、description、unit、target\_total、current\_progress、start\_date、target\_date、status
> 3. 支持查看项目详情
> 4. 支持新增项目进度日志，字段包括 log\_date、progress\_added、note
> 5. 新增日志后同步更新 current\_progress
> 6. 页面先以简单清晰为主，不做复杂项目层级  
>    完成后说明文件结构和实现逻辑。

---

# 阶段 3：展示与反馈

---

## 任务 3-1：开发 Dashboard 页面

### 任务目标

完成首页总览和快捷入口。

### 页面路径建议

​`/dashboard`

### 功能要求

- 显示今日记录是否完成
- 显示今日复盘是否完成
- 显示今日简要摘要
- 显示最近 7 日趋势
- 显示项目摘要
- 提供快捷跳转按钮

### 模块建议

- 顶部日期区
- 快捷入口区
- 今日摘要卡片
- 最近趋势图
- 项目概览卡片

### 输出内容

- 页面 UI
- 聚合查询逻辑
- 趋势图基础实现

### 验收标准

- 登录后默认进入该页
- 能看到今日状态
- 能一键进入输入页
- 能看到最近趋势和项目摘要

### 注意事项

- 不要做太复杂的首页分析
- 图表 1\~2 个即可
- 有空状态处理

### 发给 Trae 的指令模板

> 请开发 TETO 1.0 的 Dashboard 页面，路径为 /dashboard，并作为登录后的默认页。  
> 需求：
>
> 1. 显示今日 Daily Record 是否已填写
> 2. 显示今日 Diary Review 是否已填写
> 3. 显示今日摘要
> 4. 显示最近 7 日趋势图（至少一个）
> 5. 显示项目摘要
> 6. 提供跳转到 Daily Record、Diary / Review、Projects、Stats 的快捷按钮  
>    请以后台卡片式布局实现，先保证清晰和可用。

---

## 任务 3-2：开发 Stats 页面

### 任务目标

完成基础统计页面。

### 页面路径建议

​`/stats`

### 功能要求

- 时间范围切换：7 天 / 30 天
- 展示总分或完成度趋势
- 展示核心行为投入趋势
- 展示项目推进趋势
- 展示基础时间结构汇总

### 输出内容

- 图表页面
- 统计查询逻辑
- 时间范围切换逻辑

### 验收标准

- 能切换 7/30 天
- 至少 2\~3 个有效图表
- 数据来源正确

### 注意事项

- 不要做过多图表
- 不要做高级筛选器
- 不要做复杂导出功能

### 发给 Trae 的指令模板

> 请开发 TETO 1.0 的 Stats 页面，路径为 /stats。  
> 需求：
>
> 1. 支持最近 7 天和最近 30 天切换
> 2. 至少展示以下统计内容中的 2\~3 项：完成度趋势、核心行为投入趋势、项目推进趋势、基础时间结构汇总
> 3. 使用 Recharts  
>    请保持页面简洁，不要加入高级筛选和导出功能。

---

# 阶段 4：基础计算与预测

---

## 任务 4-1：实现每日记录基础计算

### 任务目标

对每日记录做基础汇总计算。

### 内容建议

- 计算总分 total\_score
- 可选：计算系统侧 completion\_rate

### 计算方式建议

先用固定规则常量。

例如：

- vocab\_new：每 1 个 \= x 分
- reading：每 10 分钟 \= x 分
- exercise：每 10 分钟 \= x 分

### 输出内容

- 规则常量文件
- 计算函数
- 保存记录时回写 total\_score

### 验收标准

- 保存 Daily Record 后能看到 total\_score
- 逻辑清晰可改

### 发给 Trae 的指令模板

> 请为 TETO 1.0 实现 Daily Record 的基础得分计算逻辑。请使用固定规则常量文件和独立计算函数，在保存每日记录时计算并回写 total\_score。要求逻辑清晰、便于后续调整，不要做复杂规则引擎。

---

## 任务 4-2：实现项目基础预测逻辑

### 任务目标

根据项目当前进度和日志计算基础预测结果。

### 计算内容

- predicted\_remaining\_days
- predicted\_finish\_date
- risk\_level

### 简化逻辑建议

基于最近若干次日志或整体平均速度估算。

### 输出内容

- 项目预测函数
- 更新日志后自动刷新项目预测字段

### 验收标准

- 更新项目日志后，预测字段有变化
- 预测规则可解释
- 页面能显示预测结果

### 发给 Trae 的指令模板

> 请为 TETO 1.0 实现项目基础预测逻辑。基于 projects 和 project\_logs，计算 predicted\_remaining\_days、predicted\_finish\_date、risk\_level。要求逻辑简洁、可解释，在新增项目日志后自动更新这些字段。不要做复杂机器学习模型。

---

# 阶段 5：收尾优化

---

## 任务 5-1：统一空状态、错误提示、加载状态

### 任务目标

提升产品可用性。

### 内容

- 表单保存 loading
- 请求失败 toast
- 空数据提示
- 图表无数据提示

### 验收标准

- 页面不会“白屏式失败”
- 无数据时有友好提示
- 保存时有反馈

### 发给 Trae 的指令模板

> 请为 TETO 1.0 的核心页面统一补充加载状态、保存成功提示、错误提示和空状态展示。页面包括 Dashboard、Daily Record、Diary / Review、Projects、Stats。请保持样式统一。

---

## 任务 5-2：基础样式整理与交互优化

### 任务目标

让页面更像可长期使用的产品。

### 内容

- 卡片间距统一
- 表单布局优化
- 按钮层级清晰
- 移动端基础适配
- 导航体验优化

### 验收标准

- 页面结构统一
- 输入体验顺畅
- 不显得像拼接 demo

### 发给 Trae 的指令模板

> 请对 TETO 1.0 当前页面做一次基础 UI/UX 整理，包括统一卡片样式、表单间距、按钮层级、页面留白和基础移动端适配。目标不是重做视觉，而是让产品更稳定可用。

---

# 六、建议的目录结构

为了让 Trae 不把代码写乱，建议你提前定目录。

```
src/
  app/
    (auth)/
      login/
    (dashboard)/
      dashboard/
      daily-record/
      diary-review/
      projects/
      stats/
    layout.tsx
    page.tsx

  components/
    layout/
    dashboard/
    daily-record/
    diary-review/
    projects/
    stats/
    ui/

  lib/
    supabase/
    db/
    calculations/
    utils/

  constants/
    record-items.ts
    review-options.ts
    scoring-rules.ts

  types/
    database.ts
    daily-record.ts
    diary-review.ts
    project.ts
```

---

# 七、每个阶段完成后的验收清单

---

## 阶段 0 验收

- [ ] 项目能运行
- [ ] 有基础导航
- [ ] Supabase 已接入
- [ ] 登录可用

---

## 阶段 1 验收

- [ ] 六张核心表已建
- [ ] RLS 已启用
- [ ] 类型和常量已建立
- [ ] DB 访问层已封装

---

## 阶段 2 验收

- [ ] Daily Record 可用
- [ ] Diary / Review 可用
- [ ] Projects 可用

---

## 阶段 3 验收

- [ ] Dashboard 可用
- [ ] Stats 可用

---

## 阶段 4 验收

- [ ] 每日总分可计算
- [ ] 项目预测可显示

---

## 阶段 5 验收

- [ ] 基本交互流畅
- [ ] 错误提示完整
- [ ] 页面统一度合格

---

# 八、你给 Trae 时要特别强调的“不要做什么”

这个非常关键，不然 AI 很容易乱扩。

每次都建议附上这一段：

> 请只完成本任务范围内的内容，不要自行扩展到以下方向：
>
> - 不要加入第二大脑模块
> - 不要加入财务模块
> - 不要加入 AI 自动日记解析
> - 不要加入多人协作
> - 不要加入复杂权限角色系统
> - 不要加入过度抽象的动态配置系统
> - 不要重构成庞大通用平台

---

# 九、你最适合的实际推进方式

我建议你不要一次性把所有任务发给 Trae，  
而是这样推进：

## 第 1 轮

- 任务 0-1
- 任务 0-2
- 任务 0-3
- 任务 0-4

## 第 2 轮

- 任务 1-1
- 任务 1-2
- 任务 1-3
- 任务 1-4

## 第 3 轮

- 任务 2-1
- 任务 2-2

## 第 4 轮

- 任务 2-3
- 任务 3-1

## 第 5 轮

- 任务 3-2
- 任务 4-1
- 任务 4-2

## 第 6 轮

- 任务 5-1
- 任务 5-2

---

# 十、最推荐的“现在立刻开工”顺序

如果你今天就开始，我建议你第一天只做这些：

## 今天先发给 Trae 的任务

1. 初始化 Next.js 项目
2. 集成 shadcn/ui
3. 集成 Supabase
4. 实现登录

也就是先把**开发地基**打好。

---

# 十一、第二天开始的任务

## 第二天做

1. 建表 SQL
2. RLS
3. 类型与常量
4. 数据访问层

---

# 十二、第三天开始的任务

## 第三天做

1. Daily Record
2. Diary / Review

这是最关键的两个输入页。

---

# 十三、如果你想更快，我帮你直接拍板 MVP 路线

如果你现在特别想快，最短 MVP 路线可以压缩成：

## MVP 必做

- 登录
- Daily Record
- Diary / Review
- Projects
- Dashboard

## MVP 暂缓

- Stats
- 完整得分系统
- 完整预测优化

也就是说：

> **先让你今晚能开始记录，优先级高于图表完整。**

---

# 十四、你和 Trae 协作时的最佳实践

## 14.1 一次只改一个模块

不要让它同时做 Daily Record + Diary + Dashboard。

## 14.2 每做完一步就让它总结

让它输出：

- 改了哪些文件
- 还缺什么环境变量
- 有哪些待确认点

## 14.3 每步都要本地跑一遍

不要连续堆 5 个任务再测试。

## 14.4 把新增想法放版本池

不要边做边改 1.0 边界。

---

# 十五、最终版任务总表

这里我给你压缩成一个总表，方便你自己盯进度。

|阶段|任务|优先级|
| ------| ---------------------| --------|
|0|初始化项目|P0|
|0|集成 UI|P0|
|0|集成 Supabase|P0|
|0|登录认证|P0|
|1|建数据库表|P0|
|1|配置 RLS|P0|
|1|类型与常量|P0|
|1|数据访问层|P0|
|2|Daily Record 页面|P0|
|2|Diary / Review 页面|P0|
|2|Projects 页面|P0|
|3|Dashboard 页面|P0|
|3|Stats 页面|P1|
|4|每日得分计算|P1|
|4|项目预测|P1|
|5|空状态/错误处理|P1|
|5|UI 优化|P1|

---

# 十六、最终结论

到这里，你的 1.0 执行链已经完整了：

1. **总纲**
2. **1.0 执行计划**
3. **页面结构详细稿**
4. **数据表设计**
5. **给 Trae 的开发任务清单**

这已经足够你正式进入开发。

---

# 十七、你现在最该做的下一步

我建议你现在别再继续扩新文档了，  
而是立刻进入：

## 下一动作

**让我帮你生成“第一条发给 Trae 的正式提示词”**

也就是我直接帮你写好第一轮可复制指令，比如：

- 初始化项目提示词
- 集成 Supabase 提示词
- 登录认证提示词

这样你可以直接复制去用。
