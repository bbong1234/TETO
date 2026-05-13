# TETO API Changelog

> 记录每次 API 行为变更的日期和内容。采用 Stripe 式日期版版本化策略。
> 
> 客户端可通过请求头 `Stripe-Version: YYYY-MM-DD` 指定要使用的 API 版本。

---

## 2026-05-05

**TETO 1.6 工程底座重构 — 首次 API 版本化发布**

### 新增
- **所有 API 响应统一 envelope**：所有端点返回 `ApiSuccess<T>` / `ApiError` 格式，含 `ok`、`data`/`error`、`meta`（trace_id、apiVersion、serverTimestamp）
- **`meta.traceId`**：每个 API 响应均包含请求追踪 ID（格式 `T-YYYYMMDD-xxxxxx`）
- **`meta.apiVersion`**：响应 meta 中新增 `apiVersion` 字段（格式 `YYYY-MM-DD`）
- **`x-trace-id` 响应头**：每个 API 响应头包含 trace_id
- **`GET /api/health`**：新增健康检查端点
- **`GET /api/v2/diagnose?trace_id=xxx`**：新增诊断 API（返回断点定位、span 树、关联决策）
- **`POST /api/v2/records/[id]/correct`**：新增用户纠错端点
- **`GET /api/v2/goals/[id]/engine`**：响应 meta 新增 `computationVersion` 字段
- **`POST /api/v2/records`**：`review_status` 字段新增 `'disputed'` 枚举值
- **`POST /api/v2/parse`**：响应 meta 新增 `ruleVersion` 字段

### 变更
- 所有 API 从裸 `NextResponse.json()` 迁移到统一 `apiSuccess()` / `apiError()` envelope
- 结构化 Logger 替代 console.log：所有服务端日志含 trace_id、span_id、component_id

### 废弃
- 无（1.6 首次版本化，无旧版本废弃）

---

## 版本号规则

```
API Version = "YYYY-MM-DD"（日期格式）
```

- 客户端通过请求头 `Stripe-Version: 2026-05-05` 指定版本
- 不传版本号时使用当前最新稳定版本
- 废弃版本在响应 meta 中包含 `deprecationWarning`，含废弃日期和日落日期
- 最早支持版本：`2026-05-04`

---

## 参考

- [TETO 1.6 工程底座重构蓝图 V0.4](../01-生效版本/TETO%201.6/TETO%201.6%20工程底座重构蓝图%20V0.3.md)
- [TETO 1.6 总执行清单](../01-生效版本/TETO%201.6/TETO%201.6%20总执行清单.md)
