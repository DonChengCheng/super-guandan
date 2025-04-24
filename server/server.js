const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const ioClient = require("socket.io-client");
const path = require("path");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve client files
app.use(express.static(path.join(__dirname, "../client")));

// Game State
let players = []; // { id, position, team, isBot }
let gameState = {
  currentTurn: 0, // Player position (0-3)
  table: [],      // Last played cards
  hands: {},      // Player ID -> [card frames]
  levels: { A: 2, B: 2 }, // Team levels
  finishOrder: [], // Players who’ve finished this round
  roundActive: false,
  paused: false, // New paused state flag
};
let analytics = {
  plays: [], // { playerId, cards, timestamp, valid }
  passes: [], // { playerId, timestamp }
  sessions: {}, // playerId -> { startTime, endTime }
  errors: [], // { playerId, message, timestamp }
};

// Card Deck (simplified for demo)
const deck = Array.from({ length: 108 }, (_, i) => i); // Frames 0-107
const baseUrl = "http://localhost:3000";

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  if (players.length < 4) {
    const position = players.length;
    const team = position % 2 === 0 ? "A" : "B";
    const isBot = false; // Assume real player initially
    players.push({ id: socket.id, position, team, isBot });
    socket.emit("assignPlayer", { id: socket.id, position, team });
    console.log(`Player assigned: ${socket.id}, Position ${position}, Team ${team}`);

    // Check if we need to start the round after adding the real player
    if (players.length === 4) {
        console.log("Fourth player (real) joined. Starting round.");
        startRound();
    }

    // Simulate 3 bot players if this is the first real player
    if (players.length === 1 && !isBot) { // Only add bots if the first player is real
      console.log("First real player joined. Adding 3 bots.");
      for (let i = 1; i < 4; i++) {
        const botSocket = ioClient(baseUrl, { forceNew: true });

        botSocket.on("connect", () => {
            const botPosition = players.length; // Get current length before pushing
            if (botPosition >= 4) { // Should not happen if logic is correct, but safety check
                console.warn(`Attempted to add bot ${i} but game is already full.`);
                botSocket.disconnect();
                return;
            }
            const botTeam = botPosition % 2 === 0 ? "A" : "B";
            const botPlayer = { id: botSocket.id, position: botPosition, team: botTeam, isBot: true };
            players.push(botPlayer); // Add bot to players array *after* connection

            console.log(`Bot ${i} connected: ${botSocket.id}, Position ${botPosition}, Team ${botTeam}`);

            // Emit assignPlayer *from the server* to the bot client *after* it's added
            botSocket.emit("assignPlayer", { id: botSocket.id, position: botPosition, team: botTeam });

            // Check if we need to start the round after adding this bot
            if (players.length === 4) {
                console.log(`Fourth player (bot ${i}) joined. Starting round.`);
                startRound();
            }

            // Bot auto-play logic (now inside connect handler)
            botSocket.on("updateGame", (state) => {
              const currentPlayer = players.find(p => p.position === state.currentTurn);
              if (state.roundActive && currentPlayer && currentPlayer.id === botSocket.id) {
                const hand = state.hands[botSocket.id];
                if (!hand || hand.length === 0) return;

                const validPairs = [];
                for (let k = 0; k < hand.length - 1; k++) {
                  for (let j = k + 1; j < hand.length; j++) {
                     if (Math.floor(hand[k] / 4) === Math.floor(hand[j] / 4)) {
                       validPairs.push([hand[k], hand[j]]);
                     }
                  }
                }

                if (Math.random() > 0.3 && validPairs.length > 0) {
                  const cardsToPlay = validPairs[0];
                  console.log(`Bot ${i} (${botSocket.id}) playing:`, cardsToPlay);
                  botSocket.emit("play", { cards: cardsToPlay });
                } else {
                  console.log(`Bot ${i} (${botSocket.id}) passing.`);
                  botSocket.emit("pass");
                }
              }
            });

            botSocket.on("assignPlayer", (data) => {
              console.log(`Bot ${i} (${botSocket.id}) received assignment confirmation: Position ${data.position}, Team ${data.team}`);
            });

            botSocket.on("disconnect", () => {
                console.log(`Bot ${i} disconnected: ${botSocket.id}`);
                const botIndex = players.findIndex(p => p.id === botSocket.id);
                if (botIndex !== -1) {
                    players.splice(botIndex, 1);
                    io.emit("playerLeft", botSocket.id);
                    console.log(`Bot ${botSocket.id} removed from players.`);
                    if (gameState.roundActive) {
                        console.log("Bot disconnected during active round. Stopping round.");
                        gameState.roundActive = false;
                        io.emit("updateGame", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team })) });
                    }
                }
            });

            botSocket.on("connect_error", (err) => {
                console.error(`Bot ${i} connection error:`, err.message);
            });
        });
      }
    }
  } else {
    console.log(`Connection rejected for ${socket.id}: Game full.`);
    socket.emit("gameFull");
    socket.disconnect();
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
    const leavingPlayerIndex = players.findIndex(p => p.id === socket.id);

    if (leavingPlayerIndex !== -1) {
        const leavingPlayer = players[leavingPlayerIndex];
        const wasRoundActive = gameState.roundActive; // Check status before removing player

        players.splice(leavingPlayerIndex, 1); // Remove player

        console.log(`Player ${socket.id} (Position ${leavingPlayer.position}, Team ${leavingPlayer.team}, Bot: ${leavingPlayer.isBot}) removed.`);
        // Notify all clients immediately that a player left
        io.emit("playerLeft", { id: socket.id, position: leavingPlayer.position });

        // If a real player leaves during an active game, pause it.
        if (!leavingPlayer.isBot && wasRoundActive) {
            console.log("Real player left during active round. Pausing game.");
            gameState.roundActive = false; // Pause the game logic
            gameState.paused = true; // Add a specific paused state flag
            // Do NOT disconnect bots here anymore.

            // If the leaving player was the current turn, advance it so game doesn't get stuck
            if (leavingPlayer.position === gameState.currentTurn && players.length > 0) {
                 console.log(`Advancing turn from disconnected player ${leavingPlayer.position}`);
                 // Need to advance turn carefully, considering remaining players and finishOrder
                 // This advanceTurn might need refinement if called when few players remain
                 advanceTurn(); // Advance turn *after* removing the player
            }

        // If a bot leaves (or real player leaves when game wasn't active)
        } else if (leavingPlayer.isBot && wasRoundActive) {
             console.log("Bot disconnected during active round. Stopping round.");
             // Keep the original logic for bot disconnects for now: stop the round.
             gameState.roundActive = false;
             gameState.paused = false; // Ensure paused is false if a bot disconnect causes stop
        } else {
             // Player (real or bot) left when round was not active, just ensure flags are reset
             gameState.paused = false;
        }

         // Always update the game state for all remaining clients after a disconnect
         // Include the paused status and the updated player list
         io.emit("updateGame", {
             ...gameState,
             players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot })) // Send bot status too
         });

    } else {
        console.log(`Disconnected socket ${socket.id} was not found in players array.`);
    }
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
  // Ensure game is not paused when starting a new round
  gameState.paused = false;
  gameState.roundActive = true;
  gameState.currentTurn = 0;
  gameState.table = [];
  gameState.finishOrder = [];
  const shuffled = deck.slice().sort(() => Math.random() - 0.5);
  gameState.hands = {};
  players.forEach((p, i) => gameState.hands[p.id] = shuffled.slice(i * 27, (i + 1) * 27));
  // Send bot status in player list
  io.emit("startRound", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot })) });
  io.emit("analyticsUpdate", summarizeAnalytics());
}

function advanceTurn() {
  if (players.length === 0 || gameState.finishOrder.length >= players.length) {
      console.log("AdvanceTurn: Cannot advance, no players or all finished.");
      // Potentially stop the round if all remaining players finished
      // checkRoundEnd(); // Might be needed here
      return;
  }

  let attempts = 0;
  const maxAttempts = players.length + 1; // Prevent infinite loops

  do {
    gameState.currentTurn = (gameState.currentTurn + 1) % 4; // Still modulo 4 for position
    attempts++;
    // Check if the player at the new currentTurn position actually exists and hasn't finished
  } while (
      (!players.find(p => p.position === gameState.currentTurn) || // Check if player exists at this position
       gameState.finishOrder.includes(players.find(p => p.position === gameState.currentTurn)?.id)) && // Check if they finished
      gameState.finishOrder.length < players.length && // Ensure not everyone has finished
      attempts < maxAttempts // Safety break
  );

   if (attempts >= maxAttempts) {
       console.error("AdvanceTurn: Could not find valid next player. Game state potentially corrupted.");
       // Handle this error state, maybe stop the round
       gameState.roundActive = false;
       gameState.paused = true;
       io.emit("updateGame", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot })) });
   } else {
       console.log(`Advanced turn to position: ${gameState.currentTurn}`);
   }
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

function cardValue(frame) {
  if (frame >= 104) return 16; // Jokers
  const rank = Math.floor(frame / 4);
  return rank + 2;
}

function isValidPlay(cards, hand, table, level) {
  console.log(`Validating play: Cards=${cards}, Hand=${hand.length}, Table=${table.length}, Level=${level}`);
  if (!cards || cards.length === 0) return false;
  if (!cards.every(c => hand.includes(c))) return false;

  if (table.length === 0) return true;

  console.warn("isValidPlay: Validation logic not fully implemented.");
  return true;
}

server.listen(3000, () => console.log("Server running on http://localhost:3000"));