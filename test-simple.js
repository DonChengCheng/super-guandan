const { chromium } = require('@playwright/test');

async function simpleTest() {
  console.log('简单测试：打开一个浏览器并保持打开...');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--window-position=100,100'],
    slowMo: 1000
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const page = await context.newPage();
  
  // 监听所有控制台消息
  page.on('console', msg => {
    console.log(`浏览器 Console [${msg.type()}]:`, msg.text());
  });
  
  // 监听网络请求
  page.on('request', request => {
    if (request.url().includes('socket.io')) {
      console.log('Socket.IO请求:', request.url());
    }
  });
  
  // 监听页面错误
  page.on('pageerror', error => {
    console.error('页面错误:', error.message);
  });
  
  console.log('正在加载游戏页面...');
  await page.goto('http://localhost:3000');
  
  // 等待页面完全加载
  await page.waitForLoadState('networkidle');
  
  console.log('页面已加载，等待5秒观察连接状态...');
  await page.waitForTimeout(5000);
  
  // 检查连接状态
  const connectionInfo = await page.evaluate(() => {
    return {
      socketExists: typeof window.socket !== 'undefined',
      socketConnected: window.socket ? window.socket.connected : false,
      gameExists: typeof window.game !== 'undefined',
      myId: window.myId || 'undefined'
    };
  });
  
  console.log('连接信息:', connectionInfo);
  
  console.log('浏览器将保持打开60秒，请手动观察游戏...');
  console.log('你可以在另一个标签页打开 http://localhost:3000 来添加更多玩家');
  
  // 保持打开1分钟
  await page.waitForTimeout(60000);
  
  await browser.close();
  console.log('测试完成');
}

simpleTest();