const io = require('socket.io-client');

console.log('🎮 测试startRound事件接收...\n');

// 创建4个客户端来模拟4个浏览器标签页
const clients = [];
let connectedClients = 0;
let startRoundReceived = 0;

for (let i = 0; i < 4; i++) {
    const socket = io('http://localhost:3000');
    clients.push(socket);
    
    socket.on('connect', () => {
        console.log(`客户端 ${i+1} 连接成功: ${socket.id}`);
        connectedClients++;
        // 强制作为新玩家连接
        socket.emit('forceNewPlayer');
    });
    
    socket.on('assignPlayer', (data) => {
        console.log(`客户端 ${i+1} 分配: 位置 ${data.position}, 队伍 ${data.team}`);
    });
    
    socket.on('startRound', (state) => {
        startRoundReceived++;
        console.log(`✅ 客户端 ${i+1} 收到 startRound 事件!`);
        console.log(`   - 手牌数据存在: ${!!state.hands}`);
        console.log(`   - 手牌数量: ${state.hands && state.hands[socket.id] ? state.hands[socket.id].length : 'N/A'}`);
        console.log(`   - roundActive: ${state.roundActive}`);
        console.log(`   - currentTurn: ${state.currentTurn}`);
        
        // 如果所有客户端都收到了事件，结束测试
        if (startRoundReceived === 4) {
            console.log('\n🎉 所有客户端都收到了 startRound 事件!');
            console.log('服务器正常工作，问题可能在浏览器客户端。');
            
            // 断开所有连接
            clients.forEach(c => c.disconnect());
            process.exit(0);
        }
    });
    
    socket.on('gameFull', () => {
        console.log(`❌ 客户端 ${i+1}: 游戏已满`);
    });
    
    socket.on('disconnect', () => {
        console.log(`❌ 客户端 ${i+1} 断开连接`);
    });
}

// 超时检查
setTimeout(() => {
    console.log(`\n⏰ 超时检查:`);
    console.log(`连接的客户端: ${connectedClients}/4`);
    console.log(`收到startRound的客户端: ${startRoundReceived}/4`);
    
    if (startRoundReceived === 0) {
        console.log('❌ 没有客户端收到startRound事件 - 服务器问题');
    } else if (startRoundReceived < 4) {
        console.log('⚠️ 部分客户端收到startRound事件 - 可能的并发问题');
    }
    
    clients.forEach(c => c.disconnect());
    process.exit(1);
}, 15000);