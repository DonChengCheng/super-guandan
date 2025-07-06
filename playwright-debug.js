const { chromium } = require('@playwright/test');

async function debugTest() {
  console.log('🔍 开始调试测试...');
  
  let browser;
  try {
    // 启动浏览器
    console.log('📱 启动浏览器...');
    browser = await chromium.launch({ 
      headless: false,
      devtools: true,  // 打开开发者工具
      slowMo: 500      // 减慢操作速度便于观察
    });
    
    const context = await browser.newContext({
      viewport: { width: 1200, height: 800 }
    });
    
    const page = await context.newPage();
    
    // 监听错误
    page.on('pageerror', error => {
      console.error('❌ 页面错误:', error.message);
    });
    
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      
      if (type === 'error') {
        console.error('🔴 控制台错误:', text);
      } else if (text.includes('Socket') || text.includes('Connect')) {
        console.log('🔌 连接相关:', text);
      }
    });
    
    // 导航到游戏页面
    console.log('🌐 加载游戏页面...');
    await page.goto('http://localhost:3000', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    console.log('✅ 页面加载完成');
    
    // 等待几秒观察
    await page.waitForTimeout(5000);
    
    // 检查游戏状态
    const gameStatus = await page.evaluate(() => {
      return {
        hasSocket: typeof window.socket !== 'undefined',
        socketConnected: window.socket?.connected || false,
        hasGame: typeof window.game !== 'undefined',
        statusText: document.querySelector('*')?.textContent?.includes('等待') || false
      };
    });
    
    console.log('🎮 游戏状态:', gameStatus);
    
    if (!gameStatus.hasSocket) {
      console.error('❌ Socket.IO 未加载');
    } else if (!gameStatus.socketConnected) {
      console.error('❌ Socket 未连接');
    } else {
      console.log('✅ 连接正常');
    }
    
    console.log('⏱️  测试将保持30秒...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('💥 测试失败:', error.message);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔚 测试结束');
    }
  }
}

// 检查服务器是否运行
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000');
    if (response.ok) {
      console.log('✅ 服务器运行正常');
      return true;
    }
  } catch (error) {
    console.error('❌ 服务器未运行，请先启动: npm run dev');
    return false;
  }
}

// 如果在Node.js环境中没有fetch，使用简单检查
if (typeof fetch === 'undefined') {
  debugTest();
} else {
  checkServer().then(ok => {
    if (ok) debugTest();
  });
}