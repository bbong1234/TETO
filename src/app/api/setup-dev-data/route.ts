// ============================================================================
// 🛠️ 开发辅助模块
// 功能：开发数据初始化
// 描述：为开发环境创建测试用户和示例任务数据
// 模块类型：API路由
// ============================================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    
    const devUserId = '0a80d616-ac29-4151-b43f-fd8985c7c8d5';
    
    console.log('1. 检查开发用户是否存在...');
    const { data: existingUser, error: checkUserError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', devUserId)
      .single();
    
    if (!existingUser) {
      console.log('2. 创建开发用户...');
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .insert({
          id: devUserId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select();
      
      if (userError) {
        console.error('创建开发用户失败:', userError);
        return NextResponse.json({ error: userError.message }, { status: 500 });
      }
      console.log('开发用户创建成功:', userData);
    } else {
      console.log('开发用户已存在');
    }
    
    console.log('3. 检查任务定义是否存在...');
    const { data: existingTasks, error: checkTasksError } = await supabase
      .from('task_definitions')
      .select('id')
      .eq('user_id', devUserId);
    
    if (existingTasks && existingTasks.length > 0) {
      console.log('任务定义已存在，跳过创建');
      return NextResponse.json({ 
        message: '开发数据已存在', 
        userId: devUserId,
        taskCount: existingTasks.length 
      });
    }
    
    console.log('4. 创建示例任务定义...');
    const sampleTasks = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        user_id: devUserId,
        name: '每日阅读',
        task_type: 'boolean',
        unit_name: '次',
        include_in_stats: true,
        include_in_completion: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        user_id: devUserId,
        name: '运动',
        task_type: 'number',
        unit_name: '分钟',
        include_in_stats: true,
        include_in_completion: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        user_id: devUserId,
        name: '喝水',
        task_type: 'count',
        unit_name: '杯',
        include_in_stats: true,
        include_in_completion: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
    
    const { data: tasksData, error: tasksError } = await supabase
      .from('task_definitions')
      .insert(sampleTasks)
      .select();
    
    if (tasksError) {
      console.error('创建任务定义失败:', tasksError);
      return NextResponse.json({ error: tasksError.message }, { status: 500 });
    }
    
    console.log('任务定义创建成功:', tasksData);
    return NextResponse.json({ 
      message: '开发数据初始化成功', 
      userId: devUserId,
      tasksCreated: tasksData?.length || 0 
    });
  } catch (error) {
    console.error('初始化开发数据失败:', error);
    return NextResponse.json({ error: '初始化开发数据失败' }, { status: 500 });
  }
}
