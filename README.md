# TETO

以记录为入口、以事项为长期主题容器、以洞察为分析层的个人现实管理系统。

> TETO 先接住现实，再组织现实，最后帮助理解现实。

## 项目定位

TETO 不是传统待办工具的增强版，也不是单纯日记软件。它解决的核心问题是：**把个人每天真实发生的内容持续接住，再逐步组织起来，形成可回看、可理解、可辅助下一步行动的现实结构。**

三条核心主线：

1. **录入主线** — 让输入低阻力、能接住、清分稳定
2. **归类主线** — 让记录落到正确的事项结构里
3. **统计总结主线** — 让数据可算、结果可看懂

## 当前功能

### 记录页 (`/records`)
- 自然语言输入，AI 语义解析自动识别类型、事项、子项、时长、花费等
- 复合句自动拆分（按可独立统计的行为单元拆）
- 语义卡片展示解析结果，支持编辑修正
- 按日分组、筛选过滤、记录详情编辑
- 规则兜底：AI 不可用时仍可基础录入

### 事项页 (`/items`)
- 四维事项结构：事项 → 子项/行动线 → 阶段 → 量化目标
- 事项详情：记录时间线、目标仪表盘、阶段管理
- 子项支持拖拽排序、升级为独立事项
- 目标引擎：支持单次目标、重复目标、基准值与达成追踪
- 阶段管理：支持历史阶段标记
- 事项文件夹分组
- 历史数据导入（CSV）

### 洞察页 (`/insights`)
- 四主轴统计：行动vs目标、时间vs计划、投入vs效果、近期时间分布
- 固定时间对比（本周vs上周、本月vs上月、近30天vs前30天）
- 规则化事实总结 + LLM 自然语言润色（两层分离）
- 事项画像、时间分布、跨事项对比、目标洞察、阶段洞察
- 非事项数据统计
- 规则管理面板
- 洞察可追溯：每条洞察附带时间范围、对比对象、统计依据

### AI 语义解析
- 自然语言 → 结构化记录（类型、事项、子项、时长、花费、情绪等）
- 模糊输入三级区分（无法理解/信息不足/不合理）
- AI 判断理由回显
- 用户修正后被动规则学习（写入 user_rules）
- AI 降级韧性：不可用时切换基础模式，本地规则仍生效

## 技术栈

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase (Auth + PostgreSQL + RLS)
- Recharts（图表）
- date-fns（日期处理）
- xlsx（数据导出）
- @dnd-kit（拖拽排序）

## 本地开发启动方式

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置环境变量**
   - 复制 `.env.example` 为 `.env.local`
   - 填入 Supabase 项目信息

3. **初始化数据库**
   - 登录 Supabase 控制台 → SQL Editor
   - 按 `sql/` 目录下的编号顺序执行迁移脚本

4. **启动开发服务器**
   ```bash
   npm run dev
   ```
   访问 http://localhost:3000

5. **构建检查**（发布前）
   ```bash
   npm run build
   ```

## 环境变量说明

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | 是 | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是 | Supabase 匿名密钥 |
| `SUPABASE_SERVICE_ROLE_KEY` | 是 | Supabase Service Role Key（服务端操作） |
| `NEXT_PUBLIC_DEV_MODE` | 否 | 设为 `true` 启用开发模式（跳过登录） |
| `NEXT_PUBLIC_DEV_USER_ID` | 否 | 开发模式使用的测试用户 ID |
| `DEV_MODE` | 否 | 服务端开发模式（控制 service_role key 使用） |

## 数据库表

核心表（均配置 RLS）：

| 表名 | 说明 |
|------|------|
| `profiles` | 用户扩展信息 |
| `record_days` | 记录日（按天分组） |
| `records` | 记录（发生/计划/想法/总结，含语义字段、量化字段、规律字段） |
| `items` | 事项（长期持续主题） |
| `sub_items` | 子项/行动线（事项内推进方向） |
| `item_folders` | 事项文件夹 |
| `phases` | 阶段（时间切片，支持历史阶段） |
| `goals` | 量化目标（单次/重复，含基准值与达成追踪） |
| `tags` | 标签 |
| `record_links` | 记录关联（完成/衍生/推迟/相关） |
| `user_rules` | 用户个性化归类规则（被动学习沉淀） |

## 项目结构

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── records/       # 记录页
│   │   ├── items/         # 事项页
│   │   └── insights/      # 洞察页
│   ├── api/v2/            # API 路由
│   │   ├── records/       # 记录 CRUD
│   │   ├── items/         # 事项 CRUD
│   │   ├── sub-items/     # 子项 CRUD
│   │   ├── goals/         # 目标 CRUD + 引擎
│   │   ├── phases/        # 阶段 CRUD
│   │   ├── insights/      # 洞察统计
│   │   ├── parse/         # AI 语义解析
│   │   ├── user-rules/    # 个性化规则
│   │   ├── export/        # 数据导出
│   │   └── ...
│   ├── auth/callback/     # 认证回调
│   └── login/             # 登录页
├── components/
│   ├── layout/            # 布局组件（侧边栏、顶栏）
│   └── ui/                # 通用 UI 组件
├── lib/
│   ├── ai/               # AI 语义解析、增强、规则兜底
│   ├── auth/              # 认证工具
│   ├── db/                # 数据库操作层
│   ├── hooks/             # 自定义 Hooks
│   ├── stats/             # 统计口径定义
│   ├── supabase/          # Supabase 客户端
│   └── utils/             # 工具函数
├── constants/             # 常量定义
└── types/                 # TypeScript 类型定义
```

## 设计原则

- **记录优先于整理**：低阻力录入，不把整理变成使用门槛
- **AI 可以增强，但不能成为单点依赖**：AI 不可用时系统可以变笨，但不能瘫
- **统计与洞察优先依赖结构化数据**：不以自由文本推断直接作为核心统计依据
- **洞察先做事实性总结，不做建议型教练**：可以说"你最近英语投入下降30%"，不说"你应该这样做"
- **洞察必须有对比视角**：没有对比的洞察是平的
- **历史数据不能伪装成精确事实**：概括性历史展开后标记为推断数据，与原始事实区分

## Vercel 部署说明

1. 确保本地 `npm run build` 执行通过
2. 确保代码已推送到 GitHub
3. 确保 Supabase SQL 脚本已执行
4. 登录 [Vercel](https://vercel.com) → Import Git 仓库
5. 配置环境变量：`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`
6. 部署后在 Supabase 控制台添加 Vercel 生产域名到 URL Configuration

## 当前不包含的内容

- 多人协作/排名
- 移动端 App
- 复杂评分模型
- 重 AI 自动决策（不可撤销的自动操作）
- 第二大脑式扩张
- 事项间复杂关系图谱
- 深度因果推理
- 笔记系统正式化
- 建议型洞察/教练模式
- 多人/家庭/企业联动
