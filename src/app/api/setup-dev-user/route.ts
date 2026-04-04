// ============================================================================
// 🛠️ 开发辅助模块
// 功能：开发用户初始化
// 描述：为开发环境创建测试用户
// 模块类型：API路由
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    
    const devUserId = '0a80d616-ac29-4151-b43f-fd8985c7c8d5';
    
    console.log('检查开发用户是否存在...');
    const { data: existingUser, error: checkError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', devUserId)
      .single();
    
    if (existingUser) {
      console.log('开发用户已存在');
      return NextResponse.json({ message: '开发用户已存在', userId: devUserId });
    }
    
    console.log('插入开发用户记录...');
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: devUserId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();
    
    if (error) {
      console.error('插入开发用户失败:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    console.log('开发用户插入成功:', data);
    return NextResponse.json({ message: '开发用户创建成功', userId: devUserId, data });
  } catch (error) {
    console.error('创建开发用户失败:', error);
    return NextResponse.json({ error: '创建开发用户失败' }, { status: 500 });
  }
}
