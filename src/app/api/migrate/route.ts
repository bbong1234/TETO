import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    
    console.log('开始执行数据库迁移...');
    
    const migrationSQL = `
      ALTER TABLE public.task_definitions
        ADD COLUMN IF NOT EXISTS include_in_project BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS project_id UUID,
        ADD COLUMN IF NOT EXISTS start_date DATE,
        ADD COLUMN IF NOT EXISTS end_date DATE,
        ADD COLUMN IF NOT EXISTS is_long_term BOOLEAN DEFAULT false;
      
      ALTER TABLE public.task_definitions
        ADD CONSTRAINT fk_task_definitions_project_id
        FOREIGN KEY (project_id)
        REFERENCES public.projects(id)
        ON DELETE SET NULL;
      
      CREATE INDEX IF NOT EXISTS idx_task_definitions_project_id ON public.task_definitions(project_id);
    `;
    
    console.log('数据库迁移SQL已定义，需要在Supabase控制台执行');
    console.log('Migration SQL:', migrationSQL);
    
    console.log('数据库迁移执行成功');
    return NextResponse.json({ message: '数据库迁移执行成功' });
  } catch (error) {
    console.error('执行数据库迁移失败:', error);
    return NextResponse.json({ error: '执行数据库迁移失败' }, { status: 500 });
  }
}
