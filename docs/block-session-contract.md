# 块时间状态契约（ActivitySessionContext）

版本：`BLOCK_SESSION_CONTRACT_VERSION = 1`

## 冻结主路径

| ID | 场景 | 期望 |
|----|------|------|
| P1 | 进入块时间 → 5 秒内取消（未改标签） | 完全退出，无记录、无报错 |
| P2 | 块内 >5 秒 → 切换事项/动作 → 5 秒内取消 | 回到切换前标签 + 块内段 + DB 一致 |
| P3 | 块内正常记录 → 今日时间线 | 立即显示进行中；停止后刷新仍可见 |
| P4 | 时间线全选批量删除 | 含/不含进行中均可删，刷新不复活 |

契约外行为视为 enhancement，不阻塞发布。

## 单一真相源

- `ActivitySessionContext.state.activity` — 进行中活动唯一权威（含 optimistic → server id）
- `RecordsClient.records` — 已完成/计划/想法列表；进行中由 `selectTimelineRecords` 投影
- `segments` + `lockedCategoryId` — 在 context 内，不经 Card ref 桥接

## 禁止规则

1. **pending switch 期间禁止 `activity = null`**（除非用户显式 stop/cancel 成功）
2. **tombstone 仅在 DELETE 成功或 404 后清除**；bootstrap fetch 不得因记录仍在服务端就清除 tombstone
3. **块内 PATCH 必须带完整 `item_id + sub_item_id`**（`ensureBlockAttributionPutBody`）
4. **所有 async 响应带 generation**；`gen !== sessionGen` 时静默丢弃
5. **撤销快照必须含段 meta**（`buildBlockUndoSnapshotActivity`）

## 代次（sessionGen）

每次 start / switch / patch / cancel / undo 递增 `sessionGen`。in-flight 操作捕获起始 gen，响应到达时校验。

## 实现映射

| 模块 | 路径 |
|------|------|
| 契约常量 | `src/lib/activity/block-session-contract.ts` |
| Reducer | `src/lib/activity/block-session-reducer.ts` |
| 副作用 | `src/lib/activity/block-session-effects.ts` |
| Provider | `src/contexts/ActivitySessionContext.tsx` |
| 时间线投影 | `src/lib/activity/select-timeline-records.ts` |
