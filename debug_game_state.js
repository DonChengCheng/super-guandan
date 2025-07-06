const io = require('socket.io-client');

console.log('🔍 测试游戏状态接收...\n');

const socket = io('http://localhost:3000');
let myId, myPosition;

socket.on('connect', () => {
    console.log(`✅ 连接成功: ${socket.id}`);
    socket.emit('forceNewPlayer');
});

socket.on('assignPlayer', (data) => {
    myId = data.id;
    myPosition = data.position;
    console.log(`👤 玩家分配: 位置 ${data.position}, 队伍 ${data.team}`);
});

socket.on('startRound', (state) => {
    console.log('\n🎮 收到 startRound 事件:');
    console.log(`   roundActive: ${state.roundActive}`);
    console.log(`   paused: ${state.paused}`);
    console.log(`   currentTurn: ${state.currentTurn}`);
    console.log(`   hands存在: ${!!state.hands}`);
    console.log(`   players存在: ${!!state.players}`);
    
    if (state.players) {
        console.log(`   players数量: ${state.players.length}`);
        const myPlayer = state.players.find(p => p.position === myPosition);
        console.log(`   我的玩家数据:`, myPlayer);
    }
    
    if (state.hands && state.hands[myId]) {
        console.log(`   我的手牌数量: ${state.hands[myId].length}`);
    } else {
        console.log(`   ❌ 我的手牌不存在!`);
    }
    
    // 模拟客户端的游戏状态判断逻辑
    const gamePaused = state.paused || false;
    console.log(`   客户端判断 gamePaused: ${gamePaused}`);
    
    if (state.players) {
        const currentPlayer = state.players.find(p => p.position === state.currentTurn && !p.disconnected);
        const isMyTurn = currentPlayer && currentPlayer.id === myId && state.roundActive && !gamePaused;
        console.log(`   当前回合玩家: ${currentPlayer ? `位置${currentPlayer.position}` : '未找到'}`);
        console.log(`   是否轮到我: ${isMyTurn}`);
        
        if (gamePaused) {
            console.log(`   ⚠️ 游戏状态: 暂停`);
        } else if (!state.roundActive) {
            console.log(`   ⚠️ 游戏状态: 回合未激活`);
        } else if (isMyTurn) {
            console.log(`   ✅ 游戏状态: 轮到我了!`);
        } else {
            console.log(`   ℹ️ 游戏状态: 等待其他玩家`);
        }
    }
    
    setTimeout(() => {
        socket.disconnect();
        console.log('\n🏁 测试完成');
        process.exit(0);
    }, 2000);
});

socket.on('updateGame', (state) => {
    console.log('\n🔄 收到 updateGame 事件:');
    console.log(`   roundActive: ${state.roundActive}`);
    console.log(`   paused: ${state.paused}`);
    console.log(`   currentTurn: ${state.currentTurn}`);
});

socket.on('gameFull', () => {
    console.log('❌ 游戏已满');
    process.exit(1);
});

// 超时保护
setTimeout(() => {
    console.log('⏰ 测试超时');
    process.exit(1);
}, 30000);