const { chromium } = require('@playwright/test');

async function testFinalGameFlow() {
  console.log('🎮 最终游戏流程测试开始...');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--window-position=200,100']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  
  const page = await context.newPage();
  
  // 监听关键事件
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('DEBUG') || text.includes('Player') || text.includes('startRound') || text.includes('Hand')) {
      console.log(`🎯 游戏日志: ${text}`);
    }
  });
  
  console.log('📱 正在连接游戏...');
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  // 等待连接和游戏初始化
  console.log('⏳ 等待游戏初始化...');
  await page.waitForTimeout(8000);
  
  // 检查游戏状态
  const gameState = await page.evaluate(() => {
    return {
      socketConnected: window.socket ? window.socket.connected : false,
      myId: window.myId || 'N/A',
      myPosition: window.myPosition || 'N/A',
      myTeam: window.myTeam || 'N/A',
      playerHandCount: window.playerHand ? window.playerHand.length : 0,
      isMyTurn: window.isMyTurn || false,
      gameExists: typeof window.game !== 'undefined'
    };
  });
  
  console.log('📊 游戏状态:', gameState);
  
  // 如果有手牌，尝试交互
  if (gameState.playerHandCount > 0) {
    console.log(`🎴 检测到 ${gameState.playerHandCount} 张手牌`);
    
    // 截图当前状态
    await page.screenshot({ path: 'game-with-cards.png', fullPage: true });
    console.log('📸 带卡牌的游戏截图已保存');
    
    try {
      // 尝试点击第一张牌
      console.log('🖱️ 尝试选择第一张牌...');
      await page.click('canvas', { position: { x: 300, y: 650 } });
      await page.waitForTimeout(1000);
      
      // 检查是否选中了牌
      const selectedCards = await page.evaluate(() => {
        return window.selectedCards ? window.selectedCards.length : 0;
      });
      
      if (selectedCards > 0) {
        console.log(`✅ 成功选中 ${selectedCards} 张牌`);
        
        // 如果轮到这个玩家，尝试出牌
        if (gameState.isMyTurn) {
          console.log('🎯 轮到我了，尝试出牌...');
          await page.click('canvas', { position: { x: 1100, y: 700 } }); // 出牌按钮位置
          await page.waitForTimeout(2000);
          console.log('✅ 出牌命令已发送');
        } else {
          console.log('⏳ 还不是我的回合');
        }
      } else {
        console.log('❌ 没有选中任何牌');
      }
    } catch (error) {
      console.log('⚠️ 交互测试失败:', error.message);
    }
  } else {
    console.log('❌ 没有检测到手牌');
  }
  
  // 最终截图
  await page.screenshot({ path: 'final-game-state.png', fullPage: true });
  console.log('📸 最终游戏状态截图已保存');
  
  console.log('🎮 保持浏览器打开30秒以便观察...');
  console.log('💡 提示: 你可以手动与游戏交互测试功能');
  
  await page.waitForTimeout(30000);
  
  await browser.close();
  console.log('✅ 测试完成');
}

testFinalGameFlow();