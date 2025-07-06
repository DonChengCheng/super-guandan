const io = require('socket.io-client');

console.log('Testing card dealing with 4 players...');

const clients = [];
let connectedCount = 0;

function createClient(index) {
  const client = io('http://localhost:3000', { forceNew: true });
  
  client.on('connect', () => {
    console.log(`Player ${index + 1} connected: ${client.id}`);
    connectedCount++;
    
    // Force new player connection
    client.emit('forceNewPlayer');
  });
  
  client.on('assignPlayer', (data) => {
    console.log(`Player ${index + 1} assigned:`, data);
  });
  
  client.on('startRound', (data) => {
    console.log(`Player ${index + 1} received startRound with hand length:`, data.hands[client.id]?.length || 'No hand');
    console.log('Game state:', {
      roundActive: data.roundActive,
      currentTurn: data.currentTurn,
      players: data.players?.length || 0
    });
  });
  
  client.on('updateGame', (data) => {
    console.log(`Player ${index + 1} received updateGame with hand length:`, data.hands[client.id]?.length || 'No hand');
  });
  
  client.on('disconnect', () => {
    console.log(`Player ${index + 1} disconnected`);
  });
  
  client.on('connect_error', (error) => {
    console.error(`Player ${index + 1} connection error:`, error.message);
  });
  
  return client;
}

// Create 4 clients
for (let i = 0; i < 4; i++) {
  clients.push(createClient(i));
}

// Clean up after 10 seconds
setTimeout(() => {
  console.log('Disconnecting all clients...');
  clients.forEach(client => client.disconnect());
  process.exit(0);
}, 10000);