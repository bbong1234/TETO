# TETO 1.0

个人效率追踪系统。记录每日行为数据、项目进度，支持结构化复盘。

## 当前 1.0 功能范围

- **每日记录** (`/daily-record`)：填写 13 项固定行为数据（学习、生活、时间记录）
- **日记复盘** (`/diary-review`)：结构化复盘（今日做了什么、完成度、情绪、问题、明日计划）
- **项目管理** (`/projects`)：创建长期项目、更新进度、查看日志
- **仪表盘** (`/dashboard`)：今日状态概览、快捷入口
- **统计分析** (`/stats`)：7天/30天填写趋势图表、项目统计

## 技术栈

- Next.js 16.2.0 (App Router)
- TypeScript
- Tailwind CSS
- Supabase (Auth + PostgreSQL)
- Recharts (图表)
- date-fns (日期处理)

## 本地开发启动方式

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置环境变量**
   - 创建 `.env.local` 文件
   - 填入 Supabase 项目信息：
     ```
     NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
     NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
     ```

3. **初始化数据库**
   - 登录 Supabase 控制台
   - 进入 SQL Editor
   - 执行 `sql/001_init_core_tables.sql` 创建表
   - 执行 `sql/002_enable_rls_core_tables.sql` 启用安全策略

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
| `NEXT_PUBLIC_DEV_MODE` | 否 | 设为 `true` 启用开发模式（跳过登录） |
| `NEXT_PUBLIC_DEV_USER_ID` | 否 | 开发模式使用的测试用户 ID |

## Supabase 配置说明

### 数据库初始化

执行以下 SQL 文件（按顺序）：

```
sql/
├── 001_init_core_tables.sql      # 创建 6 张核心表
└── 002_enable_rls_core_tables.sql # 启用行级安全策略
```

### 认证配置

1. 在 Supabase 控制台 → Authentication → URL Configuration
2. 配置 Site URL 和 Redirect URLs
3. 启用 Magic Link 登录方式

### 数据库表

- `profiles` - 用户扩展信息
- `daily_records` - 每日记录主表
- `daily_record_items` - 每日记录项明细
- `diary_reviews` - 日记复盘
- `projects` - 项目
- `project_logs` - 项目进度日志

所有表已配置 RLS（Row Level Security），用户只能访问自己的数据。

## Vercel 部署说明

### 部署前准备

1. 确保本地 `npm run build` 执行通过
2. 确保代码已推送到 GitHub
3. 确保 Supabase SQL 脚本已执行

### 部署步骤

1. 登录 [Vercel](https://vercel.com)，使用 GitHub 账号
2. 点击 "Add New Project" → "Import from Git"
3. 选择 TETO 1.0 仓库，点击 "Import"
4. 配置环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. 点击 "Deploy" 等待部署完成

### 部署后配置

1. 在 Supabase 控制台添加 Vercel 生产域名到 URL Configuration
2. 验证登录、数据保存等功能正常

## 当前 1.0 不包含的内容

- 用户资料编辑页面
- 数据导入/导出
- 多用户协作
- 移动端 App
- 邮件提醒功能
- 复杂的数据分析
- 财务追踪
- AI 自动解析
- 第二大脑功能
