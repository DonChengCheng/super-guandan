const { chromium } = require('@playwright/test');

async function testWorkingGame() {
  console.log('🚀 启动4个玩家测试游戏完整流程...');
  
  const browsers = [];
  const pages = [];
  
  try {
    // 启动4个浏览器
    for (let i = 0; i < 4; i++) {
      const browser = await chromium.launch({ 
        headless: false,
        args: [`--window-position=${100 + i * 350},${50 + i * 150}`]
      });
      
      const context = await browser.newContext({
        viewport: { width: 800, height: 600 }
      });
      
      const page = await context.newPage();
      browsers.push(browser);
      pages.push(page);
      
      // 监听重要日志
      page.on('console', msg => {
        const text = msg.text();
        if (text.includes('startRound') || text.includes('Hand') || text.includes('dealt') || text.includes('DEBUG')) {
          console.log(`👤 玩家${i+1}: ${text}`);
        }
      });
      
      console.log(`🎮 玩家 ${i + 1} 浏览器已启动`);
    }
    
    // 逐个连接玩家，确保稳定连接
    for (let i = 0; i < 4; i++) {
      console.log(`🔌 玩家 ${i + 1} 正在连接...`);
      await pages[i].goto('http://localhost:3000');
      await pages[i].waitForLoadState('networkidle');
      await pages[i].waitForTimeout(2000); // 让每个连接都稳定一下
    }
    
    console.log('⏳ 等待所有玩家连接完毕并游戏开始...');
    await pages[0].waitForTimeout(8000);
    
    // 检查每个玩家的状态
    for (let i = 0; i < 4; i++) {
      const playerState = await pages[i].evaluate(() => {
        return {
          connected: window.socket ? window.socket.connected : false,
          myId: window.myId || 'undefined',
          position: window.myPosition,
          team: window.myTeam,
          handCount: window.playerHand ? window.playerHand.length : 0,
          selectedCount: window.selectedCards ? window.selectedCards.length : 0,
          isMyTurn: window.isMyTurn
        };
      });
      
      console.log(`📊 玩家 ${i + 1} 状态:`, playerState);
      
      // 为每个玩家截图
      await pages[i].screenshot({ 
        path: `player-${i + 1}-status.png`,
        fullPage: true 
      });
    }
    
    // 寻找当前回合的玩家并尝试出牌
    for (let i = 0; i < 4; i++) {
      const isMyTurn = await pages[i].evaluate(() => window.isMyTurn);
      const handCount = await pages[i].evaluate(() => window.playerHand ? window.playerHand.length : 0);
      
      if (isMyTurn && handCount > 0) {
        console.log(`🎯 轮到玩家 ${i + 1}，尝试出牌...`);
        
        try {
          // 点击手牌区域选择第一张牌
          await pages[i].click('canvas', { position: { x: 200, y: 500 } });
          await pages[i].waitForTimeout(500);
          
          // 点击出牌按钮
          await pages[i].click('canvas', { position: { x: 700, y: 550 } });
          await pages[i].waitForTimeout(1000);
          
          console.log(`✅ 玩家 ${i + 1} 出牌尝试完成`);
        } catch (error) {
          console.log(`❌ 玩家 ${i + 1} 出牌失败:`, error.message);
        }
        break;
      }
    }
    
    // 观察游戏状态
    console.log('👀 观察游戏状态变化...');
    await pages[0].waitForTimeout(5000);
    
    // 最终状态检查
    console.log('📈 最终状态检查:');
    for (let i = 0; i < 4; i++) {
      const finalState = await pages[i].evaluate(() => {
        return {
          handCount: window.playerHand ? window.playerHand.length : 0,
          isMyTurn: window.isMyTurn,
          connected: window.socket ? window.socket.connected : false
        };
      });
      console.log(`🎭 玩家 ${i + 1} 最终状态:`, finalState);
    }
    
    console.log('🎮 游戏测试将保持30秒供手动观察...');
    await pages[0].waitForTimeout(30000);
    
  } catch (error) {
    console.error('❌ 测试错误:', error);
  } finally {
    console.log('🔚 关闭所有浏览器...');
    for (const browser of browsers) {
      await browser.close();
    }
    console.log('✅ 完整游戏流程测试完成!');
  }
}

testWorkingGame();