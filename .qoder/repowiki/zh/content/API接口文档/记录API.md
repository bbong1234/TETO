# 记录API

<cite>
**本文引用的文件**
- [src/app/api/v2/records/route.ts](file://src/app/api/v2/records/route.ts)
- [src/app/api/v2/records/[id]/route.ts](file://src/app/api/v2/records/[id]/route.ts)
- [src/app/api/v2/records/[id]/cancel/route.ts](file://src/app/api/v2/records/[id]/cancel/route.ts)
- [src/app/api/v2/records/[id]/complete/route.ts](file://src/app/api/v2/records/[id]/complete/route.ts)
- [src/app/api/v2/records/[id]/postpone/route.ts](file://src/app/api/v2/records/[id]/postpone/route.ts)
- [src/app/api/v2/records/batch-delete/route.ts](file://src/app/api/v2/records/batch-delete/route.ts)
- [src/app/api/v2/records/link/route.ts](file://src/app/api/v2/records/link/route.ts)
- [src/app/api/v2/record-links/route.ts](file://src/app/api/v2/record-links/route.ts)
- [src/lib/db/records.ts](file://src/lib/db/records.ts)
- [src/lib/db/record-links.ts](file://src/lib/db/record-links.ts)
- [src/types/teto.ts](file://src/types/teto.ts)
- [src/lib/auth/server/get-current-user-id.ts](file://src/lib/auth/server/get-current-user-id.ts)
- [src/app/auth/callback/route.ts](file://src/app/auth/callback/route.ts)
</cite>

## 更新摘要
**所做更改**
- 新增记录取消API端点：/api/v2/records/[id]/cancel
- 更新记录状态管理功能说明
- 完善生命周期状态管理文档
- 增加状态转换对比表格

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构总览](#架构总览)
5. [详细组件分析](#详细组件分析)
6. [依赖分析](#依赖分析)
7. [性能考虑](#性能考虑)
8. [故障排查指南](#故障排查指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介
本文件为 TETO 的"记录"RESTful API 文档，覆盖个人日常记录的增删改查、批量删除、记录链接（两种关联模型）、记录状态管理等能力。API 采用 Next.js App Router 的 server-side 路由，基于 Supabase 进行认证与数据访问，并通过行级安全策略保障数据隔离。

- 支持的功能
  - 列表查询：日期范围、单日、类型过滤、标签过滤、收藏标记、关键词搜索、限制数量
  - 创建记录：内容校验、所属项目归属检查、标签关联
  - 更新记录：部分字段更新、标签替换、所属项目归属检查
  - 删除记录：单条删除
  - 批量删除：仅删除当前用户拥有的记录，自动清理关联
  - 记录链接：微关联（一对一/多对多）与强关联（来源/目标记录）
  - 状态管理：激活、完成、推迟、取消四种生命周期状态

- 认证与授权
  - 基于 Supabase 的会话认证；开发模式下可通过环境变量绕过登录
  - 所有操作均强制校验用户身份并确保数据归属

- 错误处理
  - 统一返回 { data } 或 { error } 结构
  - 明确区分 401 未认证、404 资源不存在或非本人、400 参数错误、500 服务器错误

## 项目结构
记录 API 的路由组织如下：
- 基础资源：/api/v2/records
  - GET /api/v2/records（列表查询）
  - POST /api/v2/records（创建）
  - /api/v2/records/[id]
    - GET /api/v2/records/{id}（详情）
    - PUT /api/v2/records/{id}（更新）
    - DELETE /api/v2/records/{id}（删除）
    - /api/v2/records/[id]/cancel（取消）
    - /api/v2/records/[id]/complete（完成）
    - /api/v2/records/[id]/postpone（推迟）
  - /api/v2/records/batch-delete（批量删除）
  - /api/v2/records/link（微关联：设置 linked_record_id）
- 关联资源：/api/v2/record-links
  - POST /api/v2/record-links（创建强关联）
  - GET /api/v2/record-links（查询某记录的所有强关联）
  - DELETE /api/v2/record-links?id=...（删除强关联）

```mermaid
graph TB
subgraph "客户端"
C["应用/SDK"]
end
subgraph "Next.js 路由层"
R1["GET /api/v2/records"]
R2["POST /api/v2/records"]
RID["GET/PUT/DELETE /api/v2/records/[id]"]
RC["POST /api/v2/records/[id]/cancel"]
RCO["POST /api/v2/records/[id]/complete"]
RPO["POST /api/v2/records/[id]/postpone"]
RB["POST /api/v2/records/batch-delete"]
RL["POST /api/v2/records/link"]
RL2["GET/POST/DELETE /api/v2/record-links"]
end
subgraph "认证中间件"
AU["getCurrentUserId()"]
end
subgraph "数据库层"
DB["Supabase Postgres"]
Q["RLS 行级安全策略"]
end
C --> R1
C --> R2
C --> RID
C --> RC
C --> RCO
C --> RPO
C --> RB
C --> RL
C --> RL2
R1 --> AU
R2 --> AU
RID --> AU
RC --> AU
RCO --> AU
RPO --> AU
RB --> AU
RL --> AU
RL2 --> AU
AU --> DB
DB --> Q
```

**图示来源**
- [src/app/api/v2/records/route.ts:1-154](file://src/app/api/v2/records/route.ts#L1-L154)
- [src/app/api/v2/records/[id]/route.ts:1-131](file://src/app/api/v2/records/[id]/route.ts#L1-L131)
- [src/app/api/v2/records/[id]/cancel/route.ts:1-53](file://src/app/api/v2/records/[id]/cancel/route.ts#L1-L53)
- [src/app/api/v2/records/[id]/complete/route.ts:1-81](file://src/app/api/v2/records/[id]/complete/route.ts#L1-L81)
- [src/app/api/v2/records/[id]/postpone/route.ts:1-79](file://src/app/api/v2/records/[id]/postpone/route.ts#L1-L79)
- [src/app/api/v2/records/batch-delete/route.ts:1-69](file://src/app/api/v2/records/batch-delete/route.ts#L1-L69)
- [src/app/api/v2/records/link/route.ts:1-78](file://src/app/api/v2/records/link/route.ts#L1-L78)
- [src/app/api/v2/record-links/route.ts:1-100](file://src/app/api/v2/record-links/route.ts#L1-L100)
- [src/lib/auth/server/get-current-user-id.ts:1-85](file://src/lib/auth/server/get-current-user-id.ts#L1-L85)

**章节来源**
- [src/app/api/v2/records/route.ts:1-154](file://src/app/api/v2/records/route.ts#L1-L154)
- [src/app/api/v2/records/[id]/route.ts:1-131](file://src/app/api/v2/records/[id]/route.ts#L1-L131)
- [src/app/api/v2/records/[id]/cancel/route.ts:1-53](file://src/app/api/v2/records/[id]/cancel/route.ts#L1-L53)
- [src/app/api/v2/records/[id]/complete/route.ts:1-81](file://src/app/api/v2/records/[id]/complete/route.ts#L1-L81)
- [src/app/api/v2/records/[id]/postpone/route.ts:1-79](file://src/app/api/v2/records/[id]/postpone/route.ts#L1-L79)
- [src/app/api/v2/records/batch-delete/route.ts:1-69](file://src/app/api/v2/records/batch-delete/route.ts#L1-L69)
- [src/app/api/v2/records/link/route.ts:1-78](file://src/app/api/v2/records/link/route.ts#L1-L78)
- [src/app/api/v2/record-links/route.ts:1-100](file://src/app/api/v2/record-links/route.ts#L1-L100)

## 核心组件
- 认证与用户标识
  - 通过 getCurrentUserId 获取当前用户 ID，开发模式下可直接返回固定用户 ID
  - 未登录或获取用户失败时统一返回 401
- 记录服务
  - 列表查询：支持日期/范围/类型/标签/收藏/搜索/限制
  - 创建：自动创建记录日、默认字段填充、标签关联
  - 更新：部分字段更新、标签替换、归属检查
  - 删除：单条删除
- 批量删除
  - 校验参数、限制最大数量、验证所有权、清理 record_links 与 record_tags、再删除 records
- 记录链接
  - 微关联：设置 linked_record_id（一对一/多对多），支持取消
  - 强关联：record_links 表，支持来源/目标与多种 link_type
- 状态管理
  - 生命周期状态：active、completed、postponed、cancelled
  - 支持取消、完成、推迟三种状态转换操作

**章节来源**
- [src/lib/auth/server/get-current-user-id.ts:1-85](file://src/lib/auth/server/get-current-user-id.ts#L1-L85)
- [src/lib/db/records.ts:1-372](file://src/lib/db/records.ts#L1-L372)
- [src/lib/db/record-links.ts:1-101](file://src/lib/db/record-links.ts#L1-L101)
- [src/types/teto.ts:18-83](file://src/types/teto.ts#L18-L83)

## 架构总览
记录 API 的调用链路如下：

```mermaid
sequenceDiagram
participant Client as "客户端"
participant Route as "路由处理器"
participant Auth as "认证中间件"
participant DB as "数据库层"
Client->>Route : 发起请求
Route->>Auth : 获取当前用户ID
Auth-->>Route : 返回用户ID或错误
alt 未认证
Route-->>Client : 401 错误
else 已认证
Route->>DB : 执行查询/插入/更新/删除
DB-->>Route : 返回结果或错误
Route-->>Client : 2xx 成功 或 4xx/5xx 错误
end
```

**图示来源**
- [src/app/api/v2/records/route.ts:72-109](file://src/app/api/v2/records/route.ts#L72-L109)
- [src/app/api/v2/records/[id]/route.ts:8-29](file://src/app/api/v2/records/[id]/route.ts#L8-L29)
- [src/lib/auth/server/get-current-user-id.ts:12-37](file://src/lib/auth/server/get-current-user-id.ts#L12-L37)

## 详细组件分析

### 记录列表查询（GET /api/v2/records）
- 功能要点
  - 支持按单日、日期范围、类型、标签、收藏、关键词搜索、限制数量
  - 计划类记录支持"时间锚点投影"到指定日期范围
  - 返回记录附带标签与所属项目信息
- 查询参数
  - date: 单日过滤（含计划投影）
  - date_from/date_to: 日期范围过滤（含计划投影）
  - item_id: 所属项目过滤
  - type: 记录类型过滤
  - tag_id: 标签过滤
  - is_starred: 收藏标记过滤
  - search: 内容模糊搜索
  - limit: 结果数量限制，默认 500
- 响应
  - { data: Record[] }
  - Record 附带 tags、item、date 等字段
- 错误
  - 401 未认证
  - 500 服务器错误

```mermaid
flowchart TD
Start(["进入 GET /api/v2/records"]) --> Parse["解析查询参数"]
Parse --> BuildQ["构建查询条件<br/>日期/范围/类型/标签/收藏/搜索"]
BuildQ --> Exec["执行查询含计划投影"]
Exec --> Enrich["后处理：补全 tags/item/date"]
Enrich --> Return["返回 { data: records }"]
Return --> End(["结束"])
```

**图示来源**
- [src/app/api/v2/records/route.ts:72-109](file://src/app/api/v2/records/route.ts#L72-L109)
- [src/lib/db/records.ts:176-300](file://src/lib/db/records.ts#L176-L300)

**章节来源**
- [src/app/api/v2/records/route.ts:72-109](file://src/app/api/v2/records/route.ts#L72-L109)
- [src/lib/db/records.ts:176-300](file://src/lib/db/records.ts#L176-L300)
- [src/types/teto.ts:235-245](file://src/types/teto.ts#L235-L245)

### 创建记录（POST /api/v2/records）
- 请求体
  - 必填：content、date
  - 可选：type、occurred_at、status、mood、energy、result、note、item_id、phase_id、goal_id、sort_order、is_starred、cost、metric_*、duration_minutes、raw_input、parsed_semantic、time_anchor_date、linked_record_id、location、people、batch_id、lifecycle_status、tag_ids
- 校验逻辑
  - 校验 content 与 date 必填
  - 若提供 item_id，需校验该项目属于当前用户
- 响应
  - 201 Created，返回 { data: Record }
- 错误
  - 400 参数缺失/非法
  - 404 项目不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

```mermaid
sequenceDiagram
participant Client as "客户端"
participant Route as "POST /records"
participant Auth as "认证"
participant DB as "数据库"
Client->>Route : 提交创建请求
Route->>Auth : 校验用户
Route->>Route : 校验必填字段
Route->>DB : 校验 item_id 归属
DB-->>Route : 校验结果
alt 校验失败
Route-->>Client : 404 或 400
else 校验通过
Route->>DB : 插入记录自动创建记录日
DB-->>Route : 新记录
Route-->>Client : 201 + { data }
end
```

**图示来源**
- [src/app/api/v2/records/route.ts:111-153](file://src/app/api/v2/records/route.ts#L111-L153)
- [src/lib/db/records.ts:11-59](file://src/lib/db/records.ts#L11-L59)

**章节来源**
- [src/app/api/v2/records/route.ts:111-153](file://src/app/api/v2/records/route.ts#L111-L153)
- [src/lib/db/records.ts:11-59](file://src/lib/db/records.ts#L11-L59)
- [src/types/teto.ts:148-186](file://src/types/teto.ts#L148-L186)

### 更新记录（PUT /api/v2/records/{id}）
- 请求体
  - 支持部分字段更新（content、type、occurred_at、status、mood、energy、result、note、item_id、phase_id、goal_id、sort_order、is_starred、cost、metric_*、duration_minutes、raw_input、parsed_semantic、time_anchor_date、linked_record_id、location、people、batch_id、lifecycle_status、tag_ids）
- 校验逻辑
  - 若提供 item_id，需校验该项目属于当前用户
  - 更新后若提供 tag_ids，则替换标签关联
- 响应
  - 200 OK，返回 { data: Record }
- 错误
  - 404 记录不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

**章节来源**
- [src/app/api/v2/records/[id]/route.ts:31-111](file://src/app/api/v2/records/[id]/route.ts#L31-L111)
- [src/lib/db/records.ts:66-144](file://src/lib/db/records.ts#L66-L144)

### 删除记录（DELETE /api/v2/records/{id}）
- 行为
  - 仅删除当前用户拥有的记录
- 响应
  - 200 OK，返回 { data: { id } }
- 错误
  - 404 记录不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

**章节来源**
- [src/app/api/v2/records/[id]/route.ts:113-131](file://src/app/api/v2/records/[id]/route.ts#L113-L131)
- [src/lib/db/records.ts:149-161](file://src/lib/db/records.ts#L149-L161)

### 记录状态管理

#### 取消记录（POST /api/v2/records/{id}/cancel）
- 功能说明
  - 取消一条计划记录，将其生命周期状态标记为 cancelled
  - 仅适用于类型为"计划"的记录
  - 仅当记录状态为 active 或空时允许取消
  - 不生成新记录，不创建关联关系
- 请求参数
  - 路径参数：id（记录ID）
- 校验逻辑
  - 验证记录存在且属于当前用户
  - 验证记录类型必须为"计划"
  - 验证当前生命周期状态为 active 或空
  - 更新记录 lifecycle_status = 'cancelled'
- 响应
  - 200 OK，返回 { data: Record }
- 错误
  - 400 仅计划类型记录可取消、状态不允许取消
  - 404 记录不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

**章节来源**
- [src/app/api/v2/records/[id]/cancel/route.ts:5-53](file://src/app/api/v2/records/[id]/cancel/route.ts#L5-L53)
- [src/lib/db/records.ts:66-144](file://src/lib/db/records.ts#L66-L144)

#### 完成记录（POST /api/v2/records/{id}/complete）
- 功能说明
  - 完成一条计划记录，生成对应的"发生"记录
  - 创建 record_link：新记录 → 原记录，link_type = 'completes'
  - 原记录生命周期状态标记为 'completed'
- 请求参数
  - 路径参数：id（记录ID）
- 行为流程
  - 验证原记录类型为"计划"
  - 新建一条"发生"记录（content 相同，occurred_at = now）
  - 创建 record_link: 新记录 → 原记录，link_type = 'completes'
  - 原记录 lifecycle_status 标记为 'completed'
- 响应
  - 201 Created，返回 { data: Record }
- 错误
  - 400 仅计划类型记录可完成
  - 404 记录不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

**章节来源**
- [src/app/api/v2/records/[id]/complete/route.ts:6-81](file://src/app/api/v2/records/[id]/complete/route.ts#L6-L81)
- [src/lib/db/records.ts:13-59](file://src/lib/db/records.ts#L13-L59)

#### 推迟记录（POST /api/v2/records/{id}/postpone）
- 功能说明
  - 推迟一条计划记录到新日期
  - 新建一条"计划"记录，投影到新日期
  - 创建 record_link：新记录 → 原记录，link_type = 'postponed_from'
  - 原记录生命周期状态标记为 'postponed'
- 请求参数
  - 路径参数：id（记录ID）
  - 请求体：{ new_date: string }（新日期）
- 行为流程
  - 验证原记录类型为"计划"
  - 验证 new_date 参数存在
  - 新建一条"计划"记录，time_anchor_date = new_date
  - 创建 record_link: 新记录 postponed_from 原记录
  - 原记录 lifecycle_status 标记为 'postponed'
- 响应
  - 201 Created，返回 { data: Record }
- 错误
  - 400 new_date 为必填字段、仅计划类型记录可推迟
  - 404 记录不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

**章节来源**
- [src/app/api/v2/records/[id]/postpone/route.ts:17-79](file://src/app/api/v2/records/[id]/postpone/route.ts#L17-L79)
- [src/lib/db/records.ts:13-59](file://src/lib/db/records.ts#L13-L59)

### 生命周期状态对比

| 状态 | 描述 | 允许的操作 | 生成新记录 | 创建关联 |
|------|------|------------|------------|----------|
| active | 激活状态 | 取消、完成、推迟 | 否 | 否 |
| completed | 已完成 | 无限制 | 是（发生记录） | 是（completes） |
| postponed | 已推迟 | 无限制 | 是（新计划记录） | 是（postponed_from） |
| cancelled | 已取消 | 无限制 | 否 | 否 |

**章节来源**
- [src/types/teto.ts:18-19](file://src/types/teto.ts#L18-L19)
- [src/app/api/v2/records/[id]/complete/route.ts:8-13](file://src/app/api/v2/records/[id]/complete/route.ts#L8-L13)
- [src/app/api/v2/records/[id]/postpone/route.ts:7-13](file://src/app/api/v2/records/[id]/postpone/route.ts#L7-L13)
- [src/app/api/v2/records/[id]/cancel/route.ts:7-16](file://src/app/api/v2/records/[id]/cancel/route.ts#L7-L16)

### 批量删除（POST /api/v2/records/batch-delete）
- 请求体
  - { ids: string[] }（最多 200 条）
- 行为
  - 校验参数与数量
  - 先验证所有权（仅操作当前用户记录）
  - 清理 record_links（避免 RLS 阻止 CASCADE）
  - 清理 record_tags
  - 删除 records
- 响应
  - 200 OK，返回 { data: { deleted: number } }
- 错误
  - 400 参数缺失/非法/超限
  - 401 未认证
  - 500 服务器错误

```mermaid
flowchart TD
S(["POST /records/batch-delete"]) --> V1["校验 ids 参数与长度"]
V1 --> V2["查询 ownedIds仅当前用户"]
V2 --> Empty{"ownedIds 为空？"}
Empty -- 是 --> Done["返回 { data: { deleted: 0 } }"]
Empty -- 否 --> Clean1["删除 record_links"]
Clean1 --> Clean2["删除 record_tags"]
Clean2 --> Del["删除 records仅 ownedIds"]
Del --> Ret["返回 { data: { deleted: count } }"]
```

**图示来源**
- [src/app/api/v2/records/batch-delete/route.ts:10-68](file://src/app/api/v2/records/batch-delete/route.ts#L10-L68)

**章节来源**
- [src/app/api/v2/records/batch-delete/route.ts:10-68](file://src/app/api/v2/records/batch-delete/route.ts#L10-L68)

### 微关联（设置 linked_record_id）（POST /api/v2/records/link）
- 请求体
  - { record_id: string; linked_record_id: string | null }
  - linked_record_id 为 null 表示取消关联
- 校验逻辑
  - 校验 record_id 存在且属于当前用户
  - 若 linked_record_id 非空，校验其存在且属于当前用户，且不能自关联
  - 更新 record 的 linked_record_id
- 响应
  - 200 OK，返回 { data: { record_id, linked_record_id } }
- 错误
  - 400 缺少参数/自关联
  - 404 记录不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

**章节来源**
- [src/app/api/v2/records/link/route.ts:12-77](file://src/app/api/v2/records/link/route.ts#L12-L77)

### 强关联（record_links）（POST/GET/DELETE /api/v2/record-links）
- POST 创建强关联
  - 请求体：{ source_id, target_id, link_type }
  - link_type 必须为：completes、derived_from、postponed_from、related_to
  - 不能自关联
  - 返回新建关联
- GET 查询某记录的所有强关联
  - 查询参数：record_id（必填）
  - 返回包含"对方记录摘要"的关联列表
- DELETE 删除强关联
  - 查询参数：id（必填）
- 错误
  - 400 缺少参数/非法 link_type/自关联
  - 404 关联不存在或不属于当前用户
  - 401 未认证
  - 500 服务器错误

**章节来源**
- [src/app/api/v2/record-links/route.ts:13-99](file://src/app/api/v2/record-links/route.ts#L13-L99)
- [src/lib/db/record-links.ts:7-101](file://src/lib/db/record-links.ts#L7-L101)
- [src/types/teto.ts:15-16](file://src/types/teto.ts#L15-L16)

## 依赖分析
- 路由层依赖认证中间件获取用户 ID
- 数据访问层依赖 Supabase 客户端与 RLS
- 类型定义集中于 types/teto.ts，保证前后端一致性

```mermaid
graph LR
RT["路由层"] --> AU["认证中间件"]
RT --> DB["数据库层"]
DB --> TP["类型定义"]
AU --> TP
```

**图示来源**
- [src/app/api/v2/records/route.ts:1-7](file://src/app/api/v2/records/route.ts#L1-L7)
- [src/lib/auth/server/get-current-user-id.ts:1-10](file://src/lib/auth/server/get-current-user-id.ts#L1-L10)
- [src/types/teto.ts:1-10](file://src/types/teto.ts#L1-L10)

**章节来源**
- [src/app/api/v2/records/route.ts:1-7](file://src/app/api/v2/records/route.ts#L1-L7)
- [src/lib/auth/server/get-current-user-id.ts:1-10](file://src/lib/auth/server/get-current-user-id.ts#L1-L10)
- [src/types/teto.ts:1-10](file://src/types/teto.ts#L1-L10)

## 性能考虑
- 列表查询
  - 使用批量预加载项目信息，避免 N+1 查询
  - 对日期范围与标签过滤使用组合条件与 in 查询
  - 默认 limit 为 500，避免一次性返回过多数据
- 批量删除
  - 先验证所有权，再清理关联，最后删除记录，减少无效写入
  - 限制单次删除数量上限，防止大事务阻塞
- 认证
  - 仅在必要时进行用户校验，避免重复调用
- 状态管理
  - 状态转换操作仅涉及单条记录更新，性能开销较小
  - 生命周期状态字段独立存储，查询效率高

**章节来源**
- [src/lib/db/records.ts:286-300](file://src/lib/db/records.ts#L286-L300)
- [src/app/api/v2/records/batch-delete/route.ts:19-21](file://src/app/api/v2/records/batch-delete/route.ts#L19-L21)

## 故障排查指南
- 401 未认证
  - 确认已登录或开启开发模式
  - 开发模式需设置 NEXT_PUBLIC_DEV_MODE=true 与 NEXT_PUBLIC_DEV_USER_ID
- 404 资源不存在或不属于当前用户
  - 检查记录/项目/关联是否存在且归属正确
- 400 参数错误
  - 检查必填字段、参数类型与取值范围
  - 状态管理操作需满足特定条件（如仅计划类型记录可操作）
- 500 服务器错误
  - 查看服务端日志，确认 Supabase 连接与 RLS 配置

**章节来源**
- [src/lib/auth/server/get-current-user-id.ts:12-37](file://src/lib/auth/server/get-current-user-id.ts#L12-L37)
- [src/app/api/v2/records/route.ts:102-108](file://src/app/api/v2/records/route.ts#L102-L108)
- [src/app/api/v2/records/[id]/route.ts:22-28](file://src/app/api/v2/records/[id]/route.ts#L22-L28)

## 结论
本记录 API 提供了完整的 CRUD、批量删除、两类记录关联以及完整的生命周期状态管理能力，具备完善的参数校验、归属检查与错误处理机制。通过类型定义与数据库层的协同，确保了数据一致性与安全性。新增的记录取消功能完善了状态管理体系，与完成、推迟操作形成完整的状态转换矩阵。建议在生产环境中合理设置 limit 与批量上限，并结合缓存与索引进一步优化查询性能。

## 附录

### 认证与登录流程
- 开发模式
  - 设置 NEXT_PUBLIC_DEV_MODE=true 与 NEXT_PUBLIC_DEV_USER_ID
  - 跳过登录，直接使用固定用户 ID
- 正式模式
  - 通过 Supabase 登录，回调路由将交换临时授权码为会话

```mermaid
sequenceDiagram
participant U as "用户"
participant S as "Supabase"
participant CB as "回调路由"
participant APP as "应用"
U->>S : 登录Magic Link
S-->>CB : 回调携带授权码
CB->>S : 交换授权码为会话
S-->>APP : 重定向至 /records
```

**图示来源**
- [src/app/auth/callback/route.ts:4-17](file://src/app/auth/callback/route.ts#L4-L17)
- [src/lib/auth/server/get-current-user-id.ts:12-37](file://src/lib/auth/server/get-current-user-id.ts#L12-L37)