-- 动作标签可归属于一个一类事项；NULL 表示兼容历史的全局动作标签。
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS scope_item_id UUID REFERENCES public.items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tags_user_function_scope
  ON public.tags(user_id, type, scope_item_id);

COMMENT ON COLUMN public.tags.scope_item_id IS
  '动作标签所属的一类事项。NULL 为历史全局标签，非空时仅在该一类事项范围内可见和自动匹配。';
