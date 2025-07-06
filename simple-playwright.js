const { chromium } = require('@playwright/test');

async function simplePlaywrightTest() {
  console.log('🚀 启动简单 Playwright 测试');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000
  });
  
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:3000');
    console.log('✅ 页面加载成功');
    
    // 等待5秒观察
    await page.waitForTimeout(5000);
    
    // 检查页面元素
    const title = await page.title();
    console.log('📄 页面标题:', title);
    
    // 检查canvas是否存在（游戏渲染元素）
    const hasCanvas = await page.$('canvas') !== null;
    console.log('🎮 游戏画布:', hasCanvas ? '存在' : '不存在');
    
    console.log('⏱️  浏览器将保持打开20秒...');
    await page.waitForTimeout(20000);
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await browser.close();
    console.log('🔚 测试完成');
  }
}

simplePlaywrightTest();