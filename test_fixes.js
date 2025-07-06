// 测试修复后的功能
const io = require('socket.io-client');

console.log('🧪 测试游戏修复...\n');

// 连接到服务器
const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log(`✅ 连接成功: ${socket.id}`);
});

socket.on('assignPlayer', (data) => {
    console.log(`👤 玩家分配: 位置 ${data.position}, 队伍 ${data.team}, ID: ${data.id}`);
});

socket.on('startRound', (state) => {
    console.log(`🎮 回合开始!`);
    console.log(`   💳 我的手牌数量: ${state.hands[socket.id]?.length || 0}`);
    console.log(`   🎯 总玩家数: ${Object.keys(state.hands).length}`);
    console.log(`   📊 每位玩家的牌数: ${Object.values(state.hands).map(h => h?.length).join(', ')}`);
    
    if (state.hands[socket.id]?.length === 27) {
        console.log(`✅ 发牌成功 - 收到27张牌`);
    } else {
        console.log(`❌ 发牌失败 - 只收到${state.hands[socket.id]?.length || 0}张牌`);
    }
    
    // 测试完成后断开连接
    setTimeout(() => {
        socket.disconnect();
        console.log('\n🏁 测试完成');
        process.exit(0);
    }, 2000);
});

socket.on('updateGame', (state) => {
    if (state.hands && state.hands[socket.id]) {
        console.log(`🔄 游戏状态更新 - 手牌数量: ${state.hands[socket.id].length}`);
    }
});

socket.on('gameFull', () => {
    console.log('❌ 游戏已满，无法加入');
    socket.disconnect();
    process.exit(1);
});

socket.on('disconnect', () => {
    console.log('❌ 连接断开');
});

// 超时保护
setTimeout(() => {
    console.log('⏰ 测试超时');
    socket.disconnect();
    process.exit(1);
}, 10000);