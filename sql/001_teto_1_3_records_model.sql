-- ============================================================
-- TETO 1.3 三页重构 · 核心记录模型建表脚本
-- 文件：009_teto_1_3_records_model.sql
-- 说明：TETO 1.3 三页重构（今日 / 事项 / 复盘）的核心数据表
--       包含 6 张表、2 个触发器、RLS 策略、索引
-- 创建顺序（按外键依赖）：
--   1. record_days  2. items  3. chains  4. records
--   5. tags  6. record_tags
-- ============================================================

-- ============================================================
-- 第一段：建表
-- ============================================================

-- -----------------------------------------------------------
-- 1. record_days —— 按天容器
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS record_days (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id),
  date       DATE        NOT NULL,
  summary    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

-- -----------------------------------------------------------
-- 2. items —— 事项（主题容器）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT '活跃'
                          CHECK(status IN ('活跃','推进中','放缓','停滞','已完成','已搁置')),
  color       TEXT,
  icon        TEXT,
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- 3. chains —— 事件链（事项内部）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS chains (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  item_id     UUID        NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  status      TEXT        NOT NULL DEFAULT '进行中'
                          CHECK(status IN ('进行中','已完成','已搁置')),
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- 4. records —— 记录项（最小单位）
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS records (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  record_day_id UUID       NOT NULL REFERENCES record_days(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  type         TEXT        DEFAULT '发生'
                           CHECK(type IN ('发生','计划','情绪','想法','花费','总结','结果')),
  occurred_at  TIMESTAMPTZ,
  status       TEXT,
  mood         TEXT,
  energy       TEXT,
  result       TEXT,
  note         TEXT,
  item_id      UUID        REFERENCES items(id) ON DELETE SET NULL,
  chain_id     UUID        REFERENCES chains(id) ON DELETE SET NULL,
  sort_order   INTEGER     DEFAULT 0,
  is_starred   BOOLEAN     DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- 5. tags —— 标签
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id),
  name       TEXT        NOT NULL,
  color      TEXT,
  type       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------
-- 6. record_tags —— 记录-标签多对多
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS record_tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id),
  record_id  UUID        NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  tag_id     UUID        NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(record_id, tag_id)
);

-- ============================================================
-- 第二段：触发器
-- ============================================================

-- -----------------------------------------------------------
-- chain/item 一致性触发器
-- 确保 records 的 chain_id 和 item_id 保持一致：
--   - 若 chain_id 非空且 item_id 为空，自动填充 chain 所属的 item_id
--   - 若 chain_id 非空且 item_id 非空但不匹配，抛出异常
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION check_record_chain_item_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_chain_item_id UUID;
BEGIN
  IF NEW.chain_id IS NOT NULL THEN
    SELECT item_id INTO v_chain_item_id FROM chains WHERE id = NEW.chain_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'chain_id % 不存在', NEW.chain_id;
    END IF;

    IF NEW.item_id IS NULL THEN
      NEW.item_id := v_chain_item_id;
    ELSIF NEW.item_id != v_chain_item_id THEN
      RAISE EXCEPTION 'record 的 item_id(%) 与 chain 所属的 item_id(%) 不一致',
        NEW.item_id, v_chain_item_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_record_chain_item_consistency ON records;
CREATE TRIGGER trg_record_chain_item_consistency
  BEFORE INSERT OR UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION check_record_chain_item_consistency();

-- -----------------------------------------------------------
-- updated_at 自动更新触发器
-- -----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- record_days
DROP TRIGGER IF EXISTS trg_record_days_updated_at ON record_days;
CREATE TRIGGER trg_record_days_updated_at
  BEFORE UPDATE ON record_days
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- records
DROP TRIGGER IF EXISTS trg_records_updated_at ON records;
CREATE TRIGGER trg_records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- items
DROP TRIGGER IF EXISTS trg_items_updated_at ON items;
CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- chains
DROP TRIGGER IF EXISTS trg_chains_updated_at ON chains;
CREATE TRIGGER trg_chains_updated_at
  BEFORE UPDATE ON chains
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 第三段：RLS（行级安全策略）
-- ============================================================

-- -----------------------------------------------------------
-- record_days RLS
-- -----------------------------------------------------------
ALTER TABLE record_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_days_select ON record_days
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY record_days_insert ON record_days
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY record_days_update ON record_days
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY record_days_delete ON record_days
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- items RLS
-- -----------------------------------------------------------
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

CREATE POLICY items_select ON items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY items_insert ON items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY items_update ON items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY items_delete ON items
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- chains RLS
-- -----------------------------------------------------------
ALTER TABLE chains ENABLE ROW LEVEL SECURITY;

CREATE POLICY chains_select ON chains
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY chains_insert ON chains
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY chains_update ON chains
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY chains_delete ON chains
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- records RLS
-- -----------------------------------------------------------
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

CREATE POLICY records_select ON records
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY records_insert ON records
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY records_update ON records
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY records_delete ON records
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- tags RLS
-- -----------------------------------------------------------
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY tags_select ON tags
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY tags_insert ON tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY tags_update ON tags
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY tags_delete ON tags
  FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------
-- record_tags RLS
-- -----------------------------------------------------------
ALTER TABLE record_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_tags_select ON record_tags
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY record_tags_insert ON record_tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY record_tags_update ON record_tags
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY record_tags_delete ON record_tags
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 第四段：索引
-- ============================================================

-- record_days
CREATE INDEX IF NOT EXISTS idx_record_days_user_date ON record_days(user_id, date);

-- records
CREATE INDEX IF NOT EXISTS idx_records_user_day     ON records(user_id, record_day_id);
CREATE INDEX IF NOT EXISTS idx_records_user_occurred ON records(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_records_item          ON records(item_id);
CREATE INDEX IF NOT EXISTS idx_records_chain         ON records(chain_id);

-- items
CREATE INDEX IF NOT EXISTS idx_items_user_status     ON items(user_id, status);

-- chains
CREATE INDEX IF NOT EXISTS idx_chains_user_item      ON chains(user_id, item_id);

-- record_tags
CREATE INDEX IF NOT EXISTS idx_record_tags_record    ON record_tags(record_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_tag       ON record_tags(tag_id);
