// 测试脚本：比较两个页面的累计值计算结果
import fetch from 'node-fetch';

async function testAccumulatedValues() {
  console.log('开始测试累计值计算...');
  
  try {
    // 获取所有任务
    const tasksResponse = await fetch('http://localhost:3000/api/tasks');
    const tasksData = await tasksResponse.json();
    const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks || tasksData.data || []);
    console.log(`获取到 ${tasks.length} 个任务`);
    
    // 测试每个任务的累计值
    for (const task of tasks) {
      console.log(`\n测试任务: ${task.name} (${task.id})`);
      console.log(`任务类型: ${task.task_type}`);
      
      // 测试 /api/stats 中的累计值
      const statsResponse = await fetch('http://localhost:3000/api/stats');
      const statsData = await statsResponse.json();
      const taskStat = statsData.taskStats.find(ts => ts.task.id === task.id);
      const statsAccumulated = taskStat?.累计?.完成 || 0;
      console.log(`统计分析页面累计值: ${statsAccumulated}`);
      
      // 测试 /api/task-records/accumulated 中的累计值
      const goalResponse = await fetch(`http://localhost:3000/api/task-goals?task_id=${task.id}`);
      const goal = await goalResponse.json();
      console.log(`目标值状态: ${goal ? (goal.is_enabled ? '已启用' : '未启用') : '无目标'}`);
      
      if (goal && goal.is_enabled) {
        console.log(`目标值: ${goal.goal_value} (${goal.period})`);
        
        const accumulatedResponse = await fetch('http://localhost:3000/api/task-records/accumulated', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task_id: task.id,
            period: goal.period,
            custom_period_days: goal.custom_period_days,
            base_date: new Date().toISOString().split('T')[0],
          }),
        });
        const accumulatedData = await accumulatedResponse.json();
        const todayAccumulated = accumulatedData.numberValue || 0;
        console.log(`今日记录页面累计值: ${todayAccumulated}`);
        
        // 比较两个值
        console.log(`值是否一致: ${statsAccumulated === todayAccumulated}`);
        if (statsAccumulated !== todayAccumulated) {
          console.log(`差异: ${Math.abs(statsAccumulated - todayAccumulated)}`);
        }
      } else {
        console.log('任务无目标值或未启用，跳过累计值比较');
      }
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testAccumulatedValues();