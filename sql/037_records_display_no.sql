-- 记录展示编号：YYYYMMDD + 4 位当日序号（如 202601020001）
ALTER TABLE records ADD COLUMN IF NOT EXISTS display_no TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_records_user_display_no
  ON records(user_id, display_no)
  WHERE display_no IS NOT NULL;

COMMENT ON COLUMN records.display_no IS '用户可见记录编号，创建时按归属日分配';
