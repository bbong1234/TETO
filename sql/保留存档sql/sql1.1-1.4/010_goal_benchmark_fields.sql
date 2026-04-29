-- ============================================================
-- TETO 1.4 目标量化引擎 Benchmark 字段
-- 文件：010_goal_benchmark_fields.sql
-- 说明：为 goals 表新增 5 个量化引擎所需的 benchmark 配置字段
--       支持"金融账本式"差额计算：日均期望 × 天数 = 应当量，与实际量对比
-- 安全原则：
--   - 所有字段 nullable，向后兼容 measure_type=boolean 的非量化目标
--   - 全部使用 IF NOT EXISTS 保证幂等
-- ============================================================

-- 1. metric_name —— 关联指标名（如 '单词', '听读', '俯卧撑'）
--    用于精准匹配 records.metric_name，防止同事项下不同维度的记录串库
--    例：英语学习事项下，"词汇量"目标只统计 metric_name='单词' 的记录
ALTER TABLE goals ADD COLUMN IF NOT EXISTS metric_name TEXT NULL;

-- 2. unit —— 计量单位（如 '个', '分', '次', '页', '公里'）
--    独立于 records.metric_unit，属于 Goal 层面的标尺定义
ALTER TABLE goals ADD COLUMN IF NOT EXISTS unit TEXT NULL;

-- 3. daily_target —— 日均期望值（如 110）
--    引擎核心：合计应当 = total_passed_days × daily_target
ALTER TABLE goals ADD COLUMN IF NOT EXISTS daily_target NUMERIC(12,2) NULL;

-- 4. start_date —— 起算日（如 2024-12-23）
--    引擎核心：total_passed_days = today - start_date
ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date DATE NULL;

-- 5. deadline_date —— 截止日（可选，如 2026-12-31）
--    配速器用：dynamic_daily_pacer = (target_value - total_actual) / remaining_days
ALTER TABLE goals ADD COLUMN IF NOT EXISTS deadline_date DATE NULL;

-- ============================================================
-- 完成
-- ============================================================
-- 验证要点：
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='goals'
--   AND column_name IN ('metric_name','unit','daily_target','start_date','deadline_date');
--   -- 应返回 5 行
