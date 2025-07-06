const { chromium } = require('@playwright/test');

async function testGameDetailed() {
  console.log('开始详细测试掼蛋游戏流程...');
  
  const browsers = [];
  const pages = [];
  
  try {
    // 创建4个浏览器实例
    for (let i = 0; i < 4; i++) {
      const browser = await chromium.launch({ 
        headless: false,
        args: [`--window-position=${i * 320},${i * 180}`],
        slowMo: 500 // 减慢操作速度便于观察
      });
      const context = await browser.newContext({
        viewport: { width: 1200, height: 800 }
      });
      const page = await context.newPage();
      
      browsers.push(browser);
      pages.push(page);
      
      // 监听控制台日志
      page.on('console', msg => {
        console.log(`玩家${i+1} Console:`, msg.text());
      });
      
      // 监听页面错误
      page.on('pageerror', error => {
        console.error(`玩家${i+1} 页面错误:`, error.message);
      });
      
      console.log(`玩家 ${i + 1} 浏览器已启动`);
    }
    
    // 逐个连接玩家，观察服务器日志
    for (let i = 0; i < 4; i++) {
      console.log(`玩家 ${i + 1} 正在连接...`);
      await pages[i].goto('http://localhost:3000');
      await pages[i].waitForLoadState('networkidle');
      
      // 等待连接稳定
      await pages[i].waitForTimeout(2000);
      
      // 检查页面是否加载成功
      const title = await pages[i].title();
      console.log(`玩家 ${i + 1} 页面标题: ${title}`);
      
      // 检查Socket.IO连接状态
      const socketConnected = await pages[i].evaluate(() => {
        return window.socket ? window.socket.connected : false;
      });
      console.log(`玩家 ${i + 1} Socket连接状态: ${socketConnected}`);
    }
    
    // 等待游戏开始
    console.log('等待游戏开始...');
    await pages[0].waitForTimeout(5000);
    
    // 检查游戏是否开始
    for (let i = 0; i < 4; i++) {
      const gameInfo = await pages[i].evaluate(() => {
        return {
          myId: window.myId || 'undefined',
          myPosition: window.myPosition || 'undefined',
          myTeam: window.myTeam || 'undefined',
          playerHandLength: window.playerHand ? window.playerHand.length : 0,
          isMyTurn: window.isMyTurn || false,
          statusText: document.querySelector('canvas') ? '游戏界面已加载' : '未找到游戏界面'
        };
      });
      
      console.log(`玩家 ${i + 1} 游戏信息:`, gameInfo);
    }
    
    // 检查DOM中是否有Phaser画布
    const canvasInfo = await pages[0].evaluate(() => {
      const canvas = document.querySelector('canvas');
      return canvas ? {
        width: canvas.width,
        height: canvas.height,
        style: canvas.style.cssText
      } : null;
    });
    console.log('画布信息:', canvasInfo);
    
    // 尝试获取Phaser游戏实例信息
    const phaserInfo = await pages[0].evaluate(() => {
      return {
        gameExists: typeof window.game !== 'undefined',
        gameRunning: window.game && window.game.isRunning,
        sceneCount: window.game && window.game.scene ? window.game.scene.scenes.length : 0
      };
    });
    console.log('Phaser游戏信息:', phaserInfo);
    
    // 模拟等待并观察
    console.log('观察游戏状态20秒...');
    for (let second = 1; second <= 20; second++) {
      await pages[0].waitForTimeout(1000);
      
      if (second % 5 === 0) {
        // 每5秒检查一次第一个玩家的手牌
        const handInfo = await pages[0].evaluate(() => {
          return {
            playerHandExists: typeof window.playerHand !== 'undefined',
            playerHandLength: window.playerHand ? window.playerHand.length : 0,
            selectedCardsLength: window.selectedCards ? window.selectedCards.length : 0
          };
        });
        console.log(`第${second}秒 - 玩家1手牌信息:`, handInfo);
      }
    }
    
    // 尝试简单的点击操作
    console.log('尝试在画布上点击...');
    try {
      await pages[0].click('canvas', { position: { x: 600, y: 400 } });
      await pages[0].waitForTimeout(1000);
      
      await pages[0].click('canvas', { position: { x: 600, y: 600 } });
      await pages[0].waitForTimeout(1000);
      
      console.log('点击操作完成');
    } catch (error) {
      console.log('点击操作失败:', error.message);
    }
    
    // 最终截图
    for (let i = 0; i < 4; i++) {
      await pages[i].screenshot({ 
        path: `detailed-game-player-${i + 1}.png`,
        fullPage: true 
      });
    }
    console.log('所有截图已保存');
    
    // 保持浏览器打开以便手动检查
    console.log('浏览器将保持打开30秒，请手动检查游戏状态...');
    await pages[0].waitForTimeout(30000);
    
  } catch (error) {
    console.error('测试过程中出现错误:', error);
  } finally {
    console.log('关闭所有浏览器...');
    for (let browser of browsers) {
      await browser.close();
    }
    console.log('详细测试完成');
  }
}

testGameDetailed();