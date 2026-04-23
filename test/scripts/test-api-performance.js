// 测试脚本：测量各个页面的API耗时
import fetch from 'node-fetch';

// 基础URL
const BASE_URL = 'http://localhost:3000';

// 测试API耗时
async function testApiPerformance() {
  console.log('=== API性能测试开始 ===\n');
  
  // 1. 今日记录页面API
  console.log('1. 今日记录页面API:');
  console.log('   - /api/tasks');
  await testApi('/api/tasks');
  
  console.log('   - /api/task-records');
  await testApi('/api/task-records');
  
  console.log('   - /api/task-goals');
  await testApi('/api/task-goals');
  
  console.log('   - /api/task-accumulated-values');
  await testApi('/api/task-accumulated-values');
  
  // 2. 任务管理页面API
  console.log('\n2. 任务管理页面API:');
  console.log('   - /api/tasks');
  await testApi('/api/tasks');
  
  console.log('   - /api/projects');
  await testApi('/api/projects');
  
  // 3. 项目管理页面API
  console.log('\n3. 项目管理页面API:');
  console.log('   - /api/projects');
  await testApi('/api/projects');
  
  // 4. 统计分析页面API
  console.log('\n4. 统计分析页面API:');
  console.log('   - /api/stats');
  await testApi('/api/stats');
  
  console.log('\n=== API性能测试完成 ===');
}

// 测试单个API
async function testApi(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  const times = [];
  
  // 运行3次取平均值
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    try {
      const response = await fetch(url);
      const data = await response.json();
      const end = Date.now();
      const time = end - start;
      times.push(time);
      console.log(`     第${i+1}次: ${time}ms (状态: ${response.status})`);
    } catch (error) {
      console.log(`     第${i+1}次: 错误 - ${error.message}`);
    }
  }
  
  if (times.length > 0) {
    const avg = Math.round(times.reduce((sum, time) => sum + time, 0) / times.length);
    const max = Math.max(...times);
    console.log(`     平均耗时: ${avg}ms, 最慢耗时: ${max}ms`);
    
    if (max > 2000) {
      console.log(`     ⚠️  注意: 耗时超过2000ms`);
    } else if (max > 1000) {
      console.log(`     ⚠️  注意: 耗时超过1000ms`);
    }
  }
  
  console.log('');
}

// 运行测试
testApiPerformance().catch(console.error);