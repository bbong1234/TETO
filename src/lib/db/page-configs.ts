import { createClient } from '@/lib/supabase/server';

export interface UserPageConfig {
  id: string;
  user_id: string;
  page_key: string;
  block_order?: string[];
  tab_order?: string[];
  created_at: string;
  updated_at: string;
}

export interface SavePageConfigParams {
  user_id: string;
  page_key: string;
  block_order?: string[];
  tab_order?: string[];
}

/**
 * 获取用户页面配置
 */
export async function getUserPageConfig(userId: string, pageKey: string): Promise<UserPageConfig | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('user_page_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('page_key', pageKey)
    .single();

  if (error) {
    console.error('获取页面配置失败:', error);
    return null;
  }

  return data;
}

/**
 * 保存用户页面配置（如果不存在则创建，存在则更新）
 */
export async function savePageConfig(params: SavePageConfigParams): Promise<UserPageConfig | null> {
  const { user_id, page_key, block_order, tab_order } = params;
  const supabase = await createClient();

  // 构建更新数据
  const updateData: any = {};
  if (block_order !== undefined) updateData.block_order = block_order;
  if (tab_order !== undefined) updateData.tab_order = tab_order;

  // 检查是否存在
  const existingConfig = await getUserPageConfig(user_id, page_key);

  if (existingConfig) {
    // 更新现有配置
    const { data, error } = await supabase
      .from('user_page_configs')
      .update(updateData)
      .eq('user_id', user_id)
      .eq('page_key', page_key)
      .select('*')
      .single();

    if (error) {
      console.error('更新页面配置失败:', error);
      return null;
    }

    return data;
  } else {
    // 创建新配置
    const { data, error } = await supabase
      .from('user_page_configs')
      .insert({ user_id, page_key, ...updateData })
      .select('*')
      .single();

    if (error) {
      console.error('创建页面配置失败:', error);
      return null;
    }

    return data;
  }
}
