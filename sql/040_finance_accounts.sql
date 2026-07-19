-- 财务账户主数据 + records 关联字段
-- Phase 1: 账户实体化
-- Phase 3: 转账字段

CREATE TABLE IF NOT EXISTS finance_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  account_type text NOT NULL CHECK (
    account_type IN ('wechat', 'alipay', 'bank_card', 'cash', 'credit_card', 'other')
  ),
  icon text,
  opening_balance numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CNY',
  is_archived boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_finance_accounts_user_id
  ON finance_accounts(user_id, sort_order);

ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_accounts_select ON finance_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY finance_accounts_insert ON finance_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY finance_accounts_update ON finance_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY finance_accounts_delete ON finance_accounts
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE finance_accounts IS '用户财务账户：微信/支付宝/银行卡等';

-- records 关联财务账户
ALTER TABLE records ADD COLUMN IF NOT EXISTS finance_account_id uuid
  REFERENCES finance_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_records_finance_account_id
  ON records(finance_account_id) WHERE finance_account_id IS NOT NULL;

COMMENT ON COLUMN records.finance_account_id IS '收支归属账户；优先于 tool_label 用于财务聚合';

-- Phase 3: 转账目标账户
ALTER TABLE records ADD COLUMN IF NOT EXISTS transfer_to_account_id uuid
  REFERENCES finance_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN records.transfer_to_account_id IS '转账转入账户；仅 money_direction=transfer 时使用';

-- 扩展 money_direction 支持 transfer
ALTER TABLE records DROP CONSTRAINT IF EXISTS records_money_direction_check;
ALTER TABLE records ADD CONSTRAINT records_money_direction_check
  CHECK (money_direction IS NULL OR money_direction IN ('expense', 'income', 'none', 'transfer'));
