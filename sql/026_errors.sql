-- 026_errors.sql
-- TETO 1.6 — 客户端 + 服务端运行时错误聚合表
-- 让前端 console.error / fetch 失败 / 组件崩溃都不再丢失，可追溯。

CREATE TABLE IF NOT EXISTS errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                                                                  -- 可空（未登录或匿名场景）
  error_code TEXT NOT NULL,                                                      -- 'AI_PARSE_FAILED'/'CLIENT_FETCH_ERROR'/...
  message TEXT NOT NULL,                                                         -- 简明错误描述
  stack TEXT,                                                                    -- 堆栈
  source TEXT NOT NULL DEFAULT 'server'
    CHECK (source IN ('server','client')),                                       -- 错误来源
  severity TEXT NOT NULL DEFAULT 'error'
    CHECK (severity IN ('warn','error','fatal')),
  trace_id TEXT,                                                                 -- 关联 trace
  record_id UUID,                                                                -- 关联 records（可空）
  input_id UUID,                                                                 -- 关联 inputs（可空）
  url TEXT,                                                                      -- 出错时的页面或接口路径
  user_agent TEXT,                                                               -- 客户端环境
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,                                   -- 自由扩展
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_errors_user_id ON errors(user_id);
CREATE INDEX IF NOT EXISTS idx_errors_error_code ON errors(error_code);
CREATE INDEX IF NOT EXISTS idx_errors_occurred_at ON errors(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_errors_severity ON errors(severity);
CREATE INDEX IF NOT EXISTS idx_errors_trace_id ON errors(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_errors_record_id ON errors(record_id) WHERE record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_errors_input_id ON errors(input_id) WHERE input_id IS NOT NULL;

-- RLS
ALTER TABLE errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS errors_user_select ON errors;
CREATE POLICY errors_user_select ON errors FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS errors_user_insert ON errors;
CREATE POLICY errors_user_insert ON errors FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- service_role 默认 bypass RLS，无需显式 policy

COMMENT ON TABLE errors IS 'TETO 1.6 错误聚合：所有运行时异常的统一记录';
COMMENT ON COLUMN errors.error_code IS '错误码（如 AI_PARSE_FAILED、CLIENT_FETCH_ERROR、CLIENT_BOUNDARY_CRASH）';
COMMENT ON COLUMN errors.source IS '来源：server=服务端, client=浏览器';
COMMENT ON COLUMN errors.severity IS '严重度：warn/error/fatal';
