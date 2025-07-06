const { chromium } = require('@playwright/test');

async function testGameFlow() {
  console.log('开始测试掼蛋游戏完整流程...');
  
  // 启动4个浏览器实例模拟4个玩家
  const browsers = [];
  const pages = [];
  
  try {
    // 创建4个浏览器实例
    for (let i = 0; i < 4; i++) {
      const browser = await chromium.launch({ 
        headless: false,
        args: [`--window-position=${i * 300},${i * 200}`] // 错开窗口位置
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      
      browsers.push(browser);
      pages.push(page);
      
      console.log(`玩家 ${i + 1} 浏览器已启动`);
    }
    
    // 所有玩家同时连接到游戏
    console.log('所有玩家连接到游戏...');
    for (let i = 0; i < 4; i++) {
      await pages[i].goto('http://localhost:3000');
      console.log(`玩家 ${i + 1} 已连接到游戏`);
      await pages[i].waitForTimeout(1000); // 等待连接稳定
    }
    
    // 等待游戏开始和发牌
    console.log('等待游戏开始和发牌...');
    await pages[0].waitForTimeout(3000);
    
    // 检查每个玩家是否收到了手牌
    for (let i = 0; i < 4; i++) {
      const playerCards = await pages[i].evaluate(() => {
        return playerHand ? playerHand.length : 0;
      });
      console.log(`玩家 ${i + 1} 手牌数量: ${playerCards}`);
    }
    
    // 检查游戏状态
    const gameStatus = await pages[0].evaluate(() => {
      const statusElement = document.querySelector('canvas') ? 
        '游戏已加载' : '游戏未加载';
      return statusElement;
    });
    console.log('游戏状态:', gameStatus);
    
    // 等待用户观察游戏状态
    console.log('游戏界面将保持打开15秒，请观察游戏状态...');
    await pages[0].waitForTimeout(15000);
    
    // 尝试模拟玩家操作
    console.log('尝试模拟玩家操作...');
    for (let i = 0; i < 4; i++) {
      try {
        // 检查是否轮到这个玩家
        const isMyTurn = await pages[i].evaluate(() => {
          return window.isMyTurn || false;
        });
        
        if (isMyTurn) {
          console.log(`轮到玩家 ${i + 1}`);
          
          // 尝试点击第一张牌
          await pages[i].click('canvas', { position: { x: 100, y: 600 } });
          await pages[i].waitForTimeout(500);
          
          // 尝试点击出牌按钮
          await pages[i].click('canvas', { position: { x: 900, y: 700 } });
          await pages[i].waitForTimeout(1000);
          
          console.log(`玩家 ${i + 1} 尝试出牌`);
          break;
        }
      } catch (error) {
        console.log(`玩家 ${i + 1} 操作失败:`, error.message);
      }
    }
    
    // 继续观察游戏
    console.log('继续观察游戏10秒...');
    await pages[0].waitForTimeout(10000);
    
    // 截图保存游戏状态
    for (let i = 0; i < 4; i++) {
      await pages[i].screenshot({ 
        path: `game-player-${i + 1}.png`,
        fullPage: true 
      });
      console.log(`玩家 ${i + 1} 游戏截图已保存`);
    }
    
  } catch (error) {
    console.error('测试过程中出现错误:', error);
  } finally {
    // 关闭所有浏览器
    console.log('关闭所有浏览器...');
    for (let browser of browsers) {
      await browser.close();
    }
    console.log('测试完成');
  }
}

// 运行测试
testGameFlow();