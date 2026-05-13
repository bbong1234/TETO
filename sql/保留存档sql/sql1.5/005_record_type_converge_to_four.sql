-- 005: 记录类型收敛 — 情绪/花费/结果 归并为 发生
-- RECORD_TYPES 从 7 种收敛为 4 种：发生、计划、想法、总结
-- 情绪/花费/结果 不再作为主类型，降级为附属属性

-- 1. 将旧类型记录归并为'发生'
UPDATE records SET type = '发生' WHERE type IN ('情绪', '花费', '结果');

-- 2. 添加 CHECK 约束（可选，防止未来再写入旧类型）
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_type_check;
ALTER TABLE records ADD CONSTRAINT records_type_check
  CHECK (type IN ('发生', '计划', '想法', '总结'));
