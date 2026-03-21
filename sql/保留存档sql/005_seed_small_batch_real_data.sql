-- =====================================================
-- TETO 1.0 小批量真实数据导入脚本
-- =====================================================
-- 执行前准备：
-- 1. 已将所有 {{USER_ID}} 替换为真实 UUID: 0a80d616-ac29-4151-b43f-fd8985c7c8d5
-- 2. 可以通过以下 SQL 查询验证用户 ID：
--    SELECT id, email FROM auth.users;
-- =====================================================

-- =====================================================
-- 1. 导入 daily_records（最近 7 天）
-- =====================================================
INSERT INTO public.daily_records (id, user_id, record_date, note, total_score, completion_rate, created_at, updated_at)
VALUES
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-15'::date, '今天学习了很多新单词', 85, 90, NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-16'::date, '专注学习，效率很高', 90, 95, NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-17'::date, '有点疲劳，学习时间较短', 75, 70, NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-18'::date, '状态良好，完成了所有计划', 95, 100, NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-19'::date, '周末休息，学习时间较少', 65, 60, NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-20'::date, '开始新的一周，充满动力', 88, 85, NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-21'::date, '持续学习中', 82, 80, NOW(), NOW());

-- =====================================================
-- 2. 导入 daily_record_items（对应上面的记录）
-- =====================================================
INSERT INTO public.daily_record_items (id, daily_record_id, item_key, item_name, value_number, value_duration, value_time, value_text, unit, sort_order, created_at, updated_at)
VALUES
  -- 2026-03-15 的记录项
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-15'::date), 'vocab_new', '新单词', 20::numeric, NULL::integer, NULL::time, NULL::text, '个', 1, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-15'::date), 'vocab_review', '复习单词', 50::numeric, NULL::integer, NULL::time, NULL::text, '个', 2, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-15'::date), 'study_practice', '学习练习', NULL::numeric, 120::integer, NULL::time, NULL::text, '分钟', 3, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-15'::date), 'reading', '阅读', NULL::numeric, 60::integer, NULL::time, NULL::text, '分钟', 4, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-15'::date), 'wake_time', '起床时间', NULL::numeric, NULL::integer, '07:00'::time, NULL::text, NULL::text, 5, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-15'::date), 'sleep_time', '睡觉时间', NULL::numeric, NULL::integer, '23:00'::time, NULL::text, NULL::text, 6, NOW(), NOW()),
  
  -- 2026-03-16 的记录项
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-16'::date), 'vocab_new', '新单词', 25::numeric, NULL::integer, NULL::time, NULL::text, '个', 1, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-16'::date), 'vocab_review', '复习单词', 60::numeric, NULL::integer, NULL::time, NULL::text, '个', 2, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-16'::date), 'study_practice', '学习练习', NULL::numeric, 180::integer, NULL::time, NULL::text, '分钟', 3, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-16'::date), 'reading', '阅读', NULL::numeric, 90::integer, NULL::time, NULL::text, '分钟', 4, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-16'::date), 'wake_time', '起床时间', NULL::numeric, NULL::integer, '06:30'::time, NULL::text, NULL::text, 5, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-16'::date), 'sleep_time', '睡觉时间', NULL::numeric, NULL::integer, '22:30'::time, NULL::text, NULL::text, 6, NOW(), NOW()),
  
  -- 2026-03-17 的记录项
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-17'::date), 'vocab_new', '新单词', 15::numeric, NULL::integer, NULL::time, NULL::text, '个', 1, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-17'::date), 'vocab_review', '复习单词', 40::numeric, NULL::integer, NULL::time, NULL::text, '个', 2, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-17'::date), 'study_practice', '学习练习', NULL::numeric, 90::integer, NULL::time, NULL::text, '分钟', 3, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-17'::date), 'wake_time', '起床时间', NULL::numeric, NULL::integer, '07:30'::time, NULL::text, NULL::text, 5, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-17'::date), 'sleep_time', '睡觉时间', NULL::numeric, NULL::integer, '23:30'::time, NULL::text, NULL::text, 6, NOW(), NOW()),
  
  -- 2026-03-18 的记录项
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-18'::date), 'vocab_new', '新单词', 30::numeric, NULL::integer, NULL::time, NULL::text, '个', 1, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-18'::date), 'vocab_review', '复习单词', 70::numeric, NULL::integer, NULL::time, NULL::text, '个', 2, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-18'::date), 'study_practice', '学习练习', NULL::numeric, 240::integer, NULL::time, NULL::text, '分钟', 3, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-18'::date), 'reading', '阅读', NULL::numeric, 120::integer, NULL::time, NULL::text, '分钟', 4, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-18'::date), 'wake_time', '起床时间', NULL::numeric, NULL::integer, '06:00'::time, NULL::text, NULL::text, 5, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-18'::date), 'sleep_time', '睡觉时间', NULL::numeric, NULL::integer, '22:00'::time, NULL::text, NULL::text, 6, NOW(), NOW()),
  
  -- 2026-03-19 的记录项
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-19'::date), 'vocab_new', '新单词', 10::numeric, NULL::integer, NULL::time, NULL::text, '个', 1, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-19'::date), 'vocab_review', '复习单词', 30::numeric, NULL::integer, NULL::time, NULL::text, '个', 2, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-19'::date), 'study_practice', '学习练习', NULL::numeric, 60::integer, NULL::time, NULL::text, '分钟', 3, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-19'::date), 'wake_time', '起床时间', NULL::numeric, NULL::integer, '08:00'::time, NULL::text, NULL::text, 5, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-19'::date), 'sleep_time', '睡觉时间', NULL::numeric, NULL::integer, '23:30'::time, NULL::text, NULL::text, 6, NOW(), NOW()),
  
  -- 2026-03-20 的记录项
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-20'::date), 'vocab_new', '新单词', 22::numeric, NULL::integer, NULL::time, NULL::text, '个', 1, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-20'::date), 'vocab_review', '复习单词', 55::numeric, NULL::integer, NULL::time, NULL::text, '个', 2, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-20'::date), 'study_practice', '学习练习', NULL::numeric, 150::integer, NULL::time, NULL::text, '分钟', 3, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-20'::date), 'reading', '阅读', NULL::numeric, 108::integer, NULL::time, NULL::text, '分钟', 4, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-20'::date), 'wake_time', '起床时间', NULL::numeric, NULL::integer, '06:45'::time, NULL::text, NULL::text, 5, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-20'::date), 'sleep_time', '睡觉时间', NULL::numeric, NULL::integer, '22:45'::time, NULL::text, NULL::text, 6, NOW(), NOW()),
  
  -- 2026-03-21 的记录项
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-21'::date), 'vocab_new', '新单词', 18::numeric, NULL::integer, NULL::time, NULL::text, '个', 1, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-21'::date), 'vocab_review', '复习单词', 45::numeric, NULL::integer, NULL::time, NULL::text, '个', 2, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-21'::date), 'study_practice', '学习练习', NULL::numeric, 132::integer, NULL::time, NULL::text, '分钟', 3, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-21'::date), 'reading', '阅读', NULL::numeric, 90::integer, NULL::time, NULL::text, '分钟', 4, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-21'::date), 'wake_time', '起床时间', NULL::numeric, NULL::integer, '06:50'::time, NULL::text, NULL::text, 5, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM public.daily_records WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND record_date = '2026-03-21'::date), 'sleep_time', '睡觉时间', NULL::numeric, NULL::integer, '22:50'::time, NULL::text, NULL::text, 6, NOW(), NOW());

-- =====================================================
-- 3. 导入 diary_reviews（最近 7 天）
-- =====================================================
INSERT INTO public.diary_reviews (id, user_id, review_date, did_what, planned_what, completion_rate, status_label, emotion_label, biggest_progress, biggest_problem, tomorrow_plan, created_at, updated_at)
VALUES
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-15'::date, '学习了新单词，做了练习', '完成单词学习和阅读', 90, '良好', '开心', '学习效率提高', '时间安排不够合理', '继续保持学习状态，优化时间安排', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-16'::date, '完成了所有学习任务，阅读了相关资料', '完成学习计划，准备复习', 100, '优秀', '兴奋', '完成了所有计划任务', '无明显问题', '开始复习，准备测试', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-17'::date, '学习时间较短，完成了部分任务', '完成所有学习计划', 70, '一般', '疲惫', '坚持学习', '状态不佳', '调整作息，恢复状态', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-18'::date, '状态良好，完成了所有计划', '完成学习任务，进行总结', 100, '优秀', '满足', '高效完成所有任务', '无', '总结本周学习成果', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-19'::date, '休息为主，少量学习', '休息调整，少量学习', 60, '一般', '放松', '适当休息', '学习时间不足', '开始新的一周，制定详细计划', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-20'::date, '开始新的学习计划，充满动力', '完成新计划的第一天任务', 85, '良好', '期待', '开始新计划', '需要适应新节奏', '继续执行新计划', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '2026-03-21'::date, '按计划学习，进度正常', '完成今日学习任务', 80, '良好', '平静', '保持学习节奏', '需要更多练习', '继续按计划学习', NOW(), NOW());

-- =====================================================
-- 4. 导入 projects（4 个项目，不包括财务规划）
-- =====================================================
INSERT INTO public.projects (id, user_id, name, category, description, unit, target_total, current_progress, start_date, target_date, status, created_at, updated_at)
VALUES
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '英语单词计划', '学习', '每天学习新单词，复习旧单词', '个', 1000, 350, '2026-01-01'::date, '2026-06-30'::date, 'active', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '健身计划', '健康', '每周进行有氧运动和力量训练', '次', 52, 12, '2026-02-01'::date, '2026-02-28'::date, 'active', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '读书计划', '学习', '每月阅读一本新书', '本', 12, 3, '2026-01-01'::date, '2026-12-31'::date, 'active', NOW(), NOW()),
  (gen_random_uuid(), '0a80d616-ac29-4151-b43f-fd8985c7c8d5', '产品开发', '产品', '开发一个个人管理应用', '功能点', 20, 8, '2026-01-15'::date, '2026-04-15'::date, 'active', NOW(), NOW());

-- =====================================================
-- 5. 导入 project_logs（少量日志）
-- =====================================================
INSERT INTO public.project_logs (
  id,
  project_id,
  log_date,
  progress_added,
  progress_before,
  progress_after,
  note,
  created_at
)
VALUES
  -- 英语单词计划
  (
    gen_random_uuid(),
    (SELECT id FROM public.projects WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND name = '英语单词计划'),
    '2026-03-15'::date,
    20::numeric,
    330::numeric,
    350::numeric,
    '学习了20个新单词',
    NOW()
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.projects WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND name = '英语单词计划'),
    '2026-03-16'::date,
    25::numeric,
    350::numeric,
    375::numeric,
    '复习并新增25个单词',
    NOW()
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.projects WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND name = '英语单词计划'),
    '2026-03-17'::date,
    15::numeric,
    375::numeric,
    390::numeric,
    '复习并新增15个单词',
    NOW()
  ),

  -- 健身计划
  (
    gen_random_uuid(),
    (SELECT id FROM public.projects WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND name = '健身计划'),
    '2026-03-15'::date,
    1::numeric,
    10::numeric,
    11::numeric,
    '进行了有氧运动',
    NOW()
  ),
  (
    gen_random_uuid(),
    (SELECT id FROM public.projects WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND name = '健身计划'),
    '2026-03-18'::date,
    1::numeric,
    11::numeric,
    12::numeric,
    '进行了力量训练',
    NOW()
  ),

  -- 读书计划
  (
    gen_random_uuid(),
    (SELECT id FROM public.projects WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND name = '读书计划'),
    '2026-03-10'::date,
    1::numeric,
    2::numeric,
    3::numeric,
    '完成了一本书的阅读',
    NOW()
  ),

  -- 产品开发
  (
    gen_random_uuid(),
    (SELECT id FROM public.projects WHERE user_id = '0a80d616-ac29-4151-b43f-fd8985c7c8d5' AND name = '产品开发'),
    '2026-03-15'::date,
    2::numeric,
    6::numeric,
    8::numeric,
    '完成了2个功能点的开发',
    NOW()
  );