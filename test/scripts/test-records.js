// 测试脚本：比较两个API端点返回的记录数据
import fetch from 'node-fetch';

async function testRecords() {
  console.log('开始测试记录数据...');
  
  try {
    // 测试 /api/task-records?all=true
    console.log('\n1. 测试 /api/task-records?all=true:');
    const taskRecordsResponse = await fetch('http://localhost:3000/api/task-records?all=true');
    const taskRecordsData = await taskRecordsResponse.json();
    console.log(`返回记录数: ${taskRecordsData.length}`);
    console.log('前5条记录:', taskRecordsData.slice(0, 5));
    
    // 测试 /api/stats
    console.log('\n2. 测试 /api/stats:');
    const statsResponse = await fetch('http://localhost:3000/api/stats');
    const statsData = await statsResponse.json();
    console.log(`返回记录数: ${statsData.taskRecords.length}`);
    console.log('前5条记录:', statsData.taskRecords.slice(0, 5));
    
    // 比较记录数
    console.log('\n3. 比较记录数:');
    console.log(`/api/task-records: ${taskRecordsData.length}`);
    console.log(`/api/stats: ${statsData.taskRecords.length}`);
    console.log(`记录数是否一致: ${taskRecordsData.length === statsData.taskRecords.length}`);
    
    // 比较英语单词测试任务的记录
    console.log('\n4. 比较英语单词测试任务的记录:');
    const englishTaskId = taskRecordsData.find(r => r.task_id && r.task_id.includes('english'))?.task_id || 
                         statsData.taskRecords.find(r => r.task_id && r.task_id.includes('english'))?.task_id;
    
    if (englishTaskId) {
      const taskRecordsEnglish = taskRecordsData.filter(r => r.task_id === englishTaskId);
      const statsRecordsEnglish = statsData.taskRecords.filter(r => r.task_id === englishTaskId);
      
      console.log(`英语单词测试任务ID: ${englishTaskId}`);
      console.log(`/api/task-records 中的记录数: ${taskRecordsEnglish.length}`);
      console.log(`/api/stats 中的记录数: ${statsRecordsEnglish.length}`);
      
      // 计算总和
      const taskRecordsSum = taskRecordsEnglish.reduce((sum, r) => sum + (r.value_number || 0), 0);
      const statsRecordsSum = statsRecordsEnglish.reduce((sum, r) => sum + (r.value_number || 0), 0);
      
      console.log(`/api/task-records 中的总和: ${taskRecordsSum}`);
      console.log(`/api/stats 中的总和: ${statsRecordsSum}`);
      console.log(`总和是否一致: ${taskRecordsSum === statsRecordsSum}`);
    } else {
      console.log('未找到英语单词测试任务');
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testRecords();