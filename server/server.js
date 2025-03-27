const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve client files
// app.use(express.static("../client"));
app.use(express.static(path.join(__dirname, "../client")));
// Game State
let players = []; // { id, position, team }
let gameState = {
  currentTurn: 0, // Player position (0-3)
  table: [],      // Last played cards
  hands: {},      // Player ID -> [card frames]
  levels: { A: 2, B: 2 }, // Team levels
  finishOrder: [], // Players who’ve finished this round
  roundActive: false,
};
let analytics = {
  plays: [], // { playerId, cards, timestamp, valid }
  passes: [], // { playerId, timestamp }
  sessions: {}, // playerId -> { startTime, endTime }
  errors: [], // { playerId, message, timestamp }
};

// Card Deck (simplified for demo)
const deck = Array.from({ length: 108 }, (_, i) => i); // Frames 0-107

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // Assign player position and team
  if (players.length < 4) {
    const position = players.length;
    const team = position % 2 === 0 ? "A" : "B";
    players.push({ id: socket.id, position, team });
    socket.emit("assignPlayer", { id: socket.id, position, team });

    // Start game when 4 players join
    if (players.length === 4) {
      startRound();
    }
  } else {
    socket.emit("gameFull");
    socket.disconnect();
    return;
  }

  socket.on("play", (data) => {
    if (socket.id !== players[gameState.currentTurn].id || !gameState.roundActive) return;
    const cards = data.cards.map(c => parseInt(c));
    const hand = gameState.hands[socket.id];
    const level = gameState.levels[players[gameState.currentTurn].team];
    const timestamp = Date.now();

    const valid = isValidPlay(cards, hand, gameState.table, level);
    analytics.plays.push({ playerId: socket.id, cards, timestamp, valid });

    if (!valid) {
      analytics.errors.push({ playerId: socket.id, message: "Invalid play", timestamp });
      socket.emit("invalidPlay", "Invalid combination or play");
      return;
    }

    gameState.table = cards;
    gameState.hands[socket.id] = hand.filter(c => !cards.includes(c));
    if (gameState.hands[socket.id].length === 0) gameState.finishOrder.push(socket.id);
    advanceTurn();
    io.emit("updateGame", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team })) });
    io.emit("analyticsUpdate", summarizeAnalytics());
    checkRoundEnd();
  });

  
  socket.on("pass", () => {
    if (socket.id !== players[gameState.currentTurn].id || !gameState.roundActive) return;
    analytics.passes.push({ playerId: socket.id, timestamp: Date.now() });
    advanceTurn();
    io.emit("updateGame", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team })) });
    io.emit("analyticsUpdate", summarizeAnalytics());
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    players = players.filter(p => p.id !== socket.id);
    gameState.roundActive = false;
    io.emit("playerLeft", socket.id);
  });
});
function summarizeAnalytics() {
  const now = Date.now();
  const recentPlays = analytics.plays.filter(p => now - p.timestamp < 60000); // Last minute
  const playCount = recentPlays.length;
  const errorCount = analytics.errors.filter(e => now - e.timestamp < 60000).length;
  const avgTurnTime = playCount ? recentPlays.reduce((sum, p) => sum + (p.timestamp - (analytics.passes.find(pa => pa.playerId === p.playerId && pa.timestamp < p.timestamp).timestamp || p.timestamp)), 0) / playCount : 0;
  return { playCount, errorCount, avgTurnTime };
}
function startRound() {
  gameState.roundActive = true;
  gameState.currentTurn = 0;
  gameState.table = [];
  gameState.finishOrder = [];
  const shuffled = deck.slice().sort(() => Math.random() - 0.5);
  gameState.hands = {};
  players.forEach((p, i) => gameState.hands[p.id] = shuffled.slice(i * 27, (i + 1) * 27));
  io.emit("startRound", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team })) });
  io.emit("analyticsUpdate", summarizeAnalytics());
}

function advanceTurn() {
  do {
    gameState.currentTurn = (gameState.currentTurn + 1) % 4;
  } while (gameState.finishOrder.includes(players[gameState.currentTurn].id) && gameState.finishOrder.length < 4);
}

function checkRoundEnd() {
  if (gameState.finishOrder.length === 4) {
    updateLevels();
    io.emit("endRound", { finishOrder: gameState.finishOrder, levels: gameState.levels });
    if (checkWin()) {
      io.emit("gameWin", gameState.levels);
    } else {
      startRound();
    }
  }
}

function updateLevels() {
  const order = gameState.finishOrder.map(id => players.find(p => p.id === id));
  const teamA = [order[0].team, order[1].team, order[2].team, order[3].team].filter(t => t === "A").length;
  if (order[0].team === order[1].team) gameState.levels[order[0].team] += 3; // 1-2
  else if (order[0].team === order[2].team) gameState.levels[order[0].team] += 2; // 1-3
  else if (order[0].team === order[3].team) gameState.levels[order[0].team] += 1; // 1-4
}

function checkWin() {
  return (gameState.levels.A >= 13 && ([0, 1].every(i => players[gameState.finishOrder[i]].team === "A") || 
          [0, 2].every(i => players[gameState.finishOrder[i]].team === "A"))) ||
         (gameState.levels.B >= 13 && ([0, 1].every(i => players[gameState.finishOrder[i]].team === "B") || 
          [0, 2].every(i => players[gameState.finishOrder[i]].team === "B")));
}

server.listen(3000, () => console.log("Server running on http://localhost:3000"));