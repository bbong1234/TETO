# TETO 1.3 三页式重构执行单

## 核心原则
先接住现实（记录），再组织现实（事项），再分析现实（洞察）。

## 执行顺序（严格按序）

### Task 1：SQL 完全定死
- 编写 `sql/009_teto_1_3_records_model.sql`
- 6 张表完整字段、外键、UNIQUE(user_id,date)、CHECK、chain/item 一致性触发器、RLS（每表4策略）、索引、updated_at 触发器
- 验收：可真实插入纯记录、记录挂事项、记录挂链（一致性校验）、标签多对多、删除级联正确

### Task 2：类型定义 + DB 层
- 重写 `src/types/teto-1.3.ts`
- 重写 `src/lib/db/teto-1.3/`（record-days.ts, records.ts, items.ts, chains.ts, tags.ts, insights.ts）
- 验收：npm run build 零错误

### Task 3：新 API 层
- 删除旧 v2 API（events/time-blocks/goals/containers/outcomes/state-tags/review）
- 新建：record-days, records, items, chains, tags, insights
- records POST 实现 chain_id->item_id 自动填充 + record_day 自动 upsert
- 验收：npm run build 通过，PowerShell 测试 CRUD

### Task 4：记录页 /records（默认首页）
- 删除 today/, events/, outcomes/
- 新建 records/：QuickInput, RecordList, RecordItem, RecordEditDrawer, DaySummary, FilterBar
- 快速输入只需 content，其他后补
- 验收：可新增、查看、编辑、过滤

### Task 5：事项页 /items
- 删除 goals/, containers/
- 新建 items/：ItemList, ItemForm, ItemDetail, ChainList, ChainDetail
- 新建 items/[id]/ 详情页
- 验收：事项/链 CRUD，关联记录查看

### Task 6：洞察页 /insights（最小统计版）
- 删除 review/
- 新建 insights/：DateRangeSelector, RecordStats, ItemStats
- 只做 6 个固定指标
- 验收：数据准确，图表渲染

### Task 7：导航 + 路由
- sidebar 改为 3 项（记录/事项/洞察）
- mobile-topbar 同步
- / 重定向到 /records
- 验收：npm run build 零错误

### Task 8：全链路联调
- 执行 SQL 后跑 3 场景：A(纯记录) B(有主题) C(先记后整)
- 验收：全部跑通，chain/item 一致性生效

### Task 9：清理收尾
- 删除旧文件残留
- 移除无用依赖（@dnd-kit, xlsx）
- 最终 build 通过

## 关键约束
- docs 目录只读（不修改不删除，只可新增）
- 旧代码可直接删除
- 不做万能 include/group_by 平台
- 洞察暂不做情绪分析/NLP
