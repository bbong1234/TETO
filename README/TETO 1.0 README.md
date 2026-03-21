# TETO 1.0

个人效率追踪系统。记录每日行为数据、项目进度，支持结构化复盘。

## 1.0 当前功能范围

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

## 本地启动步骤

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置环境变量**
   - 复制 `.env.local.example` 为 `.env.local`（如果没有 example，手动创建）
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

## sql/ 目录用途

```
sql/
├── 001_init_core_tables.sql      # 创建 6 张核心表
├── 002_enable_rls_core_tables.sql # 启用行级安全策略
└── 003_add_profiles_table.sql     # 用户扩展信息表（可选）
```

**执行顺序**：按文件名数字顺序执行。

## 当前暂不做的内容

- 用户资料编辑页面
- 数据导入/导出
- 多用户协作
- 移动端 App
- 邮件提醒功能
- 复杂的数据分析

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # 需要登录的页面组
│   │   ├── daily-record/   # 每日记录
│   │   ├── diary-review/   # 日记复盘
│   │   ├── projects/       # 项目管理
│   │   ├── dashboard/      # 仪表盘
│   │   └── stats/          # 统计分析
│   ├── login/              # 登录页
│   └── auth/callback/      # 认证回调
├── components/             # React 组件
├── lib/                    # 工具函数
│   ├── auth/              # 认证相关
│   ├── db/                # 数据库操作
│   └── supabase/          # Supabase 客户端
├── types/                  # TypeScript 类型
└── constants/              # 常量配置
```

## 认证说明

使用 Supabase Auth Magic Link（邮箱验证码）登录：
1. 访问 `/login` 输入邮箱
2. 查收邮件获取 6 位验证码
3. 输入验证码完成登录
4. 登录后自动跳转到 `/dashboard`

开发模式下设置 `NEXT_PUBLIC_DEV_MODE=true` 可跳过登录。

## 数据库表结构

- `profiles` - 用户扩展信息
- `daily_records` - 每日记录主表
- `daily_record_items` - 每日记录项明细
- `diary_reviews` - 日记复盘
- `projects` - 项目
- `project_logs` - 项目进度日志

所有表已配置 RLS（Row Level Security），用户只能访问自己的数据。

## Vercel 部署说明

### 部署前准备

1. **确保本地构建通过**
   ```bash
   npm run build
   ```

2. **确保 GitHub 仓库已更新**
   - 提交所有代码变更
   - 推送到远程仓库

3. **确保 Supabase 配置完成**
   - 已执行 `sql/001_init_core_tables.sql`
   - 已执行 `sql/002_enable_rls_core_tables.sql`
   - 已在 Supabase 控制台配置好 Auth 提供商

4. **准备环境变量**
   - 从 Supabase 控制台获取：
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Vercel 部署步骤

1. **登录 Vercel 控制台**
   - 访问 https://vercel.com
   - 使用 GitHub 账号登录

2. **导入项目**
   - 点击 "Add New Project"
   - 选择 "Import from Git"
   - 选择你的 GitHub 仓库
   - 点击 "Import"

3. **配置项目**
   - 项目名称：保持默认或自定义
   - 框架预设：选择 "Next.js"
   - 根目录：保持默认
   - 环境变量：点击 "Environment Variables"

4. **添加环境变量**
   | 变量名 | 值 |
   |--------|-----|
   | `NEXT_PUBLIC_SUPABASE_URL` | 你的 Supabase 项目 URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 Supabase 匿名密钥 |

5. **部署项目**
   - 点击 "Deploy"
   - 等待部署完成（约 1-3 分钟）

### Supabase 相关注意事项

1. **Auth 配置**
   - 在 Supabase 控制台 → Authentication → URL Configuration
   - 添加 Vercel 生成的生产 URL 到 "Site URL"
   - 添加 `https://your-vercel-url.vercel.app/auth/callback` 到 "Additional Redirect URLs"

2. **邮件模板**
   - 确保 Supabase Auth 的 Magic Link 邮件模板正确配置
   - 验证邮件链接指向正确的域名

3. **数据库连接**
   - 生产环境会自动使用 Supabase 的连接池
   - 无需额外配置数据库连接字符串

### 部署后验证步骤

1. **访问生产 URL**
   - 点击 Vercel 控制台中的 "Visit" 按钮
   - 确认页面正常加载

2. **验证登录流程**
   - 点击 "登录"
   - 输入邮箱获取验证码
   - 验证验证码登录成功
   - 确认跳转到 `/dashboard`

3. **验证数据功能**
   - 测试每日记录保存
   - 测试日记复盘保存
   - 测试项目创建和更新
   - 验证数据在 Supabase 中正确存储

4. **验证统计功能**
   - 访问 `/stats` 页面
   - 确认图表正常显示
   - 测试 7天/30天 数据切换

### 部署完成验收清单

- [ ] GitHub 仓库已更新到最新版本
- [ ] 本地 `npm run build` 执行通过
- [ ] Supabase SQL 脚本已执行完成
- [ ] Vercel 环境变量已正确配置
- [ ] Supabase Auth URL 配置已更新
- [ ] 生产 URL 可正常访问
- [ ] 登录流程验证通过
- [ ] 数据保存功能验证通过
- [ ] 统计图表功能验证通过
- [ ] 所有核心页面加载正常
