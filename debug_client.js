const io = require('socket.io-client');

console.log('🔍 调试客户端启动...\n');

const socket = io('http://localhost:3000');
let myId, myPosition;

// 模拟强制新玩家连接（跳过重连）
socket.on('connect', () => {
    console.log(`✅ 连接成功: ${socket.id}`);
    console.log(`📤 发送 forceNewPlayer`);
    socket.emit('forceNewPlayer');
});

socket.on('assignPlayer', (data) => {
    myId = data.id;
    myPosition = data.position;
    console.log(`=== assignPlayer ===`);
    console.log(`Assigned: ID=${myId}, Pos=${myPosition}, Team=${data.team}`);
    console.log(`socket.id=${socket.id}, data.id=${data.id}, match=${socket.id === data.id}`);
});

socket.on('startRound', (state) => {
    console.log(`\n=== startRound Debug ===`);
    console.log(`myId: ${myId}`);
    console.log(`socket.id: ${socket.id}`);
    console.log(`myId === socket.id: ${myId === socket.id}`);
    console.log(`state.hands exists: ${!!state.hands}`);
    
    if (state.hands) {
        console.log(`state.hands keys: [${Object.keys(state.hands).join(', ')}]`);
        console.log(`state.hands[myId]: ${state.hands[myId] ? `Array(${state.hands[myId].length})` : 'undefined'}`);
        console.log(`state.hands[socket.id]: ${state.hands[socket.id] ? `Array(${state.hands[socket.id].length})` : 'undefined'}`);
        
        const hand = state.hands[myId];
        if (!hand) {
            console.log(`❌ Hand not found for myId: ${myId}`);
            console.log(`❌ Available hands for: [${Object.keys(state.hands).join(', ')}]`);
        } else {
            console.log(`✅ Hand found! Length: ${hand.length}`);
        }
    } else {
        console.log(`❌ state.hands does not exist!`);
    }
    
    // 延迟断开以允许更多调试
    setTimeout(() => {
        socket.disconnect();
        console.log(`\n🏁 调试完成`);
        process.exit(0);
    }, 2000);
});

socket.on('gameFull', () => {
    console.log('❌ 游戏已满');
    process.exit(1);
});

socket.on('disconnect', () => {
    console.log('❌ 连接断开');
});

// 超时保护
setTimeout(() => {
    console.log('⏰ 调试超时');
    process.exit(1);
}, 30000);