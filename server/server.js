const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ioClient = require('socket.io-client');
const path = require('path');
const { isValidPlay, getHandType, HAND_TYPES } = require('./gameRules');
const logger = require('./logger');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Connection stability settings
  pingInterval: 10000,  // Send heartbeat every 10 seconds
  pingTimeout: 5000,    // Timeout if no response in 5 seconds
  
  // CORS configuration
  cors: {
    origin: "*",  // In production, specify your domain
    methods: ["GET", "POST"]
  },
  
  // Transport settings - prioritize WebSocket
  transports: ['websocket', 'polling'],
  
  // Allow upgrades from long-polling to WebSocket
  allowUpgrades: true,
  
  // Increase max HTTP buffer size for stability
  maxHttpBufferSize: 1e6  // 1MB
});

// Serve client files
app.use(express.static(path.join(__dirname, '../client')));

// Card Deck (simplified for demo)
const deck = Array.from({ length: 108 }, (_, i) => i); // Frames 0-107
const baseUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
const RECONNECT_TIMEOUT = 30000; // 30 seconds timeout for reconnection

// Game State
const players = []; // { id (socket.id), position, team, isBot, uniquePlayerId, disconnected, disconnectTime }
const gameState = {
  currentTurn: 0, // Player position (0-3)
  table: [], // Last played cards
  hands: {}, // Player ID -> [card frames]
  levels: { A: 2, B: 2 }, // Team levels
  finishOrder: [], // Players who’ve finished this round
  roundActive: false,
  paused: false, // New paused state flag
  tribute: {
    required: false, // Whether tribute is required this round
    phase: 'none', // 'tribute', 'return', 'complete'
    tributeCards: {}, // Player ID -> card to tribute
    returnCards: {}, // Player ID -> card to return
    tributeFrom: null, // Player who needs to give tribute
    tributeTo: null // Player who receives tribute
  },
  lastWinner: null, // Winner of last round (gets to play first)
  passCount: 0, // Number of consecutive passes
  lastPlayerId: null // Who played the last valid cards
};
const analytics = {
  plays: [], // { playerId, cards, timestamp, valid }
  passes: [], // { playerId, timestamp }
  sessions: {}, // playerId -> { startTime, endTime }
  errors: [] // { playerId, message, timestamp }
};

// --- Helper Function to generate a simple unique ID ---
function generateUniqueId() {
  return Math.random().toString(36).substring(2, 15);
}
// --- End Helper ---

io.on('connection', (socket) => {
  logger.info('Player connected', { socketId: socket.id });

  // --- Reconnection Logic ---
  // Client will emit 'attemptReconnect' with their stored uniquePlayerId
  socket.on('attemptReconnect', (data) => {
    if (!data || !data.uniquePlayerId) {
      console.log(`Reconnect attempt failed for ${socket.id}: No uniquePlayerId provided.`);
      // Proceed as new player if possible, or reject if full
      handleNewPlayerConnection(socket);
      return;
    }

    const reconnectingPlayer = players.find(p => p.uniquePlayerId === data.uniquePlayerId && p.disconnected);

    if (reconnectingPlayer) {
      console.log(`Player ${reconnectingPlayer.uniquePlayerId} (Pos ${reconnectingPlayer.position}) reconnected with new socket ID ${socket.id}`);
      const oldSocketId = reconnectingPlayer.id;
      reconnectingPlayer.id = socket.id; // Update socket ID
      reconnectingPlayer.disconnected = false;
      reconnectingPlayer.disconnectTime = null;

      // Put the player back into the socket room for broadcasts if using rooms
      // socket.join(gameRoomId); // Example if using rooms

      // Send current state back to reconnected player
      socket.emit('assignPlayer', { id: socket.id, position: reconnectingPlayer.position, team: reconnectingPlayer.team, uniquePlayerId: reconnectingPlayer.uniquePlayerId }); // Send uniqueId back too
      socket.emit('updateGame', { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })) }); // Send full state including hands

      // Notify others
      io.emit('playerReconnected', { position: reconnectingPlayer.position, id: socket.id }); // Send new ID

      // Check if game should unpause
      const disconnectedPlayers = players.filter(p => p.disconnected && !p.isBot);
      if (gameState.paused && disconnectedPlayers.length === 0) {
        console.log('Last disconnected player reconnected. Unpausing game.');
        gameState.paused = false;
        // No need to change roundActive here if it was kept true during pause
        io.emit('updateGame', { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })) }); // Emit unpaused state
      }

    } else {
      console.log(`Reconnect attempt failed for ${socket.id} with ID ${data.uniquePlayerId}: Player not found or not disconnected.`);
      // Treat as a new player connection attempt
      handleNewPlayerConnection(socket);
    }
  });
  // --- End Reconnection Logic ---

  // Handle force new player connection
  socket.on('forceNewPlayer', () => {
    console.log(`Force new player connection for ${socket.id}`);
    handleNewPlayerConnection(socket);
  });

  // Initial connection handling (wrapped in a function)
  function handleNewPlayerConnection(currentSocket) {
    // Check if this socket already has a player assigned
    const existingPlayer = players.find(p => p.id === currentSocket.id);
    if (existingPlayer) {
      console.log(`Socket ${currentSocket.id} already has a player assigned.`);
      return;
    }

    const activePlayers = players.filter(p => !p.disconnected);
    console.log(`Current players: ${players.length}, Active players: ${activePlayers.length}`);
    console.log(`Players state:`, players.map(p => ({ id: p.id, position: p.position, disconnected: p.disconnected })));
    
    if (activePlayers.length >= 4) {
      console.log(`Connection rejected for ${currentSocket.id}: Game full.`);
      currentSocket.emit('gameFull');
      currentSocket.disconnect();
      return;
    }

    // Find the first available position (0-3)
    let position = -1;
    for (let i = 0; i < 4; i++) {
      const positionTaken = players.some(p => p.position === i && !p.disconnected);
      if (!positionTaken) {
        position = i;
        break;
      }
    }

    if (position === -1) {
      console.log(`Connection rejected for ${currentSocket.id}: All positions taken.`);
      currentSocket.emit('gameFull');
      currentSocket.disconnect();
      return;
    }
    const team = position % 2 === 0 ? 'A' : 'B';
    const isBot = false;
    const uniquePlayerId = generateUniqueId(); // Assign a unique ID

    const newPlayer = { id: currentSocket.id, position, team, isBot, uniquePlayerId, disconnected: false, disconnectTime: null };
    players.push(newPlayer);
    currentSocket.emit('assignPlayer', { id: currentSocket.id, position, team, uniquePlayerId }); // Send uniqueId to client
    console.log(
      `New player assigned: ${currentSocket.id}, Position ${position}, Team ${team}, UniqueID ${uniquePlayerId}`
    );

    // Check if we need to start the round after adding the real player
    const activePlayerCount = players.filter(p => !p.disconnected).length;
    console.log(`Active players: ${activePlayerCount}, Round active: ${gameState.roundActive}, Paused: ${gameState.paused}`);

    if (activePlayerCount === 4 && !gameState.roundActive && !gameState.paused) {
      console.log('Fourth player joined. Starting round.');
      startRound();
    } else if (activePlayerCount < 4) {
      console.log(`Waiting for more players. Current: ${activePlayerCount}/4`);
    }

    // Simulate bot players (ensure bots also get unique IDs)
    // if (players.filter(p => !p.disconnected && !p.isBot).length === 1 && players.filter(p => !p.disconnected).length === 1) {
    //     console.log("First real player joined. Adding 3 bots.");
    //     for (let i = 1; i < 4; i++) {
    //         const botSocket = ioClient(baseUrl, { forceNew: true });
    //         const botUniqueId = generateUniqueId(); // Bot unique ID

    //         botSocket.on("connect", () => {
    //             const botPosition = players.length;
    //             if (botPosition >= 4) {
    //                 console.warn(`Attempted to add bot ${i} but game is already full.`);
    //                 botSocket.disconnect();
    //                 return;
    //             }
    //             const botTeam = botPosition % 2 === 0 ? "A" : "B";
    //             const botPlayer = {
    //                 id: botSocket.id, // Bot's socket ID
    //                 position: botPosition,
    //                 team: botTeam,
    //                 isBot: true,
    //                 uniquePlayerId: botUniqueId, // Store unique ID for bot too
    //                 disconnected: false,
    //                 disconnectTime: null
    //             };
    //             players.push(botPlayer);

    //             console.log(
    //                 `Bot ${i} connected: ${botSocket.id}, Position ${botPosition}, Team ${botTeam}, UniqueID ${botUniqueId}`
    //             );

    //             botSocket.emit("assignPlayer", {
    //                 id: botSocket.id,
    //                 position: botPosition,
    //                 team: botTeam,
    //                 uniquePlayerId: botUniqueId // Send ID to bot client if needed
    //             });

    //             if (players.filter(p => !p.disconnected).length === 4 && !gameState.roundActive && !gameState.paused) {
    //                 console.log(`Fourth player (bot ${i}) joined. Starting round.`);
    //                 startRound();
    //             }

    //             // Bot logic listeners...
    //             botSocket.on("updateGame", (state) => {
    //                 // ... existing bot play logic ...
    //                 // Ensure bot logic checks if game is paused: if (state.roundActive && !state.paused && ...)
    //                 const currentPlayer = players.find(p => p.position === state.currentTurn);
    //                 if (state.roundActive && !state.paused && currentPlayer && currentPlayer.id === botSocket.id) {
    //                     const hand = state.hands[botSocket.id];
    //                     if (!hand || hand.length === 0) return;

    //                     const validPairs = [];
    //                     for (let k = 0; k < hand.length - 1; k++) {
    //                       for (let j = k + 1; j < hand.length; j++) {
    //                         if (Math.floor(hand[k] / 4) === Math.floor(hand[j] / 4)) {
    //                           validPairs.push([hand[k], hand[j]]);
    //                         }
    //                       }
    //                     }

    //                     if (Math.random() > 0.3 && validPairs.length > 0) {
    //                       const cardsToPlay = validPairs[0];
    //                       console.log(`Bot ${i} (${botSocket.id}) playing:`, cardsToPlay);
    //                       botSocket.emit("play", { cards: cardsToPlay });
    //                     } else {
    //                       console.log(`Bot ${i} (${botSocket.id}) passing.`);
    //                       botSocket.emit("pass");
    //                     }
    //                 }
    //             });
    //             botSocket.on("assignPlayer", (data) => {
    //               console.log(
    //                 `Bot ${i} (${botSocket.id}) received assignment confirmation: Position ${data.position}, Team ${data.team}`
    //               );
    //             });

    //             botSocket.on("disconnect", () => {
    //               console.log(`Bot ${i} disconnected: ${botSocket.id}`);
    //               const botIndex = players.findIndex((p) => p.id === botSocket.id);
    //               if (botIndex !== -1) {
    //                 players.splice(botIndex, 1);
    //                 io.emit("playerLeft", botSocket.id);
    //                 console.log(`Bot ${botSocket.id} removed from players.`);
    //                 if (gameState.roundActive) {
    //                   console.log(
    //                     "Bot disconnected during active round. Stopping round."
    //                   );
    //                   gameState.roundActive = false;
    //                   io.emit("updateGame", {
    //                     ...gameState,
    //                     players: players.map((p) => ({
    //                       id: p.id,
    //                       position: p.position,
    //                       team: p.team,
    //                     })),
    //                   });
    //                 }
    //               }
    //             });

    //             botSocket.on("connect_error", (err) => {
    //               console.error(`Bot ${i} connection error:`, err.message);
    //             });
    //         });
    //     }
    // }
  }

  // --- Initial connection attempt ---
  // Don't immediately call handleNewPlayerConnection. Wait for client to potentially send 'attemptReconnect'.
  // Set a small timeout. If 'attemptReconnect' isn't received, treat as new player.
  const connectTimeout = setTimeout(() => {
    // Check if player object was created by a successful reconnect attempt
    const existingPlayer = players.find(p => p.id === socket.id);
    if (!existingPlayer) {
      console.log(`No reconnect attempt from ${socket.id} within timeout. Treating as new player.`);
      handleNewPlayerConnection(socket);
    }
  }, 1000); // 1 second grace period for reconnect attempt

  socket.on('disconnect', () => {
    clearTimeout(connectTimeout); // Clear timeout if disconnect happens quickly
    console.log('Player disconnected:', socket.id);
    const leavingPlayer = players.find(p => p.id === socket.id);

    if (leavingPlayer) {
      // Don't remove immediately, mark as disconnected
      leavingPlayer.disconnected = true;
      leavingPlayer.disconnectTime = Date.now();
      const wasRoundActive = gameState.roundActive && !gameState.paused; // Check if round was actively running

      console.log(
        `Player ${socket.id} (Pos ${leavingPlayer.position}, UniqueID ${leavingPlayer.uniquePlayerId}, Bot: ${leavingPlayer.isBot}) marked as disconnected.`
      );
      // Notify clients that player is disconnected (client can show different state)
      io.emit('playerDisconnected', { position: leavingPlayer.position, id: socket.id });

      // If a REAL player disconnects during an active game, pause it.
      if (!leavingPlayer.isBot && wasRoundActive) {
        gameState.paused = true;
        console.log('Real player left during active round. Pausing game.');

        // If the leaving player was the current turn, advance it
        if (leavingPlayer.position === gameState.currentTurn && players.filter(p => !p.disconnected).length > 0) {
          console.log(`Advancing turn from disconnected player ${leavingPlayer.position}`);
          advanceTurn(); // Advance turn *after* marking as disconnected
        }
      } else if (leavingPlayer.isBot && wasRoundActive) {
        // Option 1: Pause on bot disconnect too (like real players)
        gameState.paused = true;
        console.log('Bot left during active round. Pausing game.');
        if (leavingPlayer.position === gameState.currentTurn && players.filter(p => !p.disconnected).length > 0) {
          advanceTurn();
        }
        // Option 2: Original logic - Stop round (commented out)
        // gameState.roundActive = false;
        // console.log("Bot disconnected during active round. Stopping round.");
      }

      // Always update game state for all clients after a disconnect/pause
      io.emit('updateGame', {
        ...gameState,
        players: players.map(p => ({
          id: p.id,
          position: p.position,
          team: p.team,
          isBot: p.isBot,
          disconnected: p.disconnected // Send disconnected status
        }))
      });

      // Start timeout check for this player
      setTimeout(() => checkReconnectionTimeout(leavingPlayer.uniquePlayerId), RECONNECT_TIMEOUT + 1000); // Check shortly after timeout expires

    } else {
      console.log(`Disconnected socket ${socket.id} was not found in players array (already removed or never fully added).`);
    }
  });

  // --- Other event listeners ('play', 'pass') need to check gameState.paused ---
  socket.on('play', (data) => {
    const player = players.find(p => p.id === socket.id);
    logger.player(player?.id, 'Attempting to play cards', {
      position: player?.position,
      cards: data?.cards,
      currentTurn: gameState.currentTurn
    });

    if (!player || player.position !== gameState.currentTurn || !gameState.roundActive || gameState.paused) {
      logger.warn('Play rejected: Invalid game state', {
        playerId: player?.id,
        playerPosition: player?.position,
        currentTurn: gameState.currentTurn,
        roundActive: gameState.roundActive,
        paused: gameState.paused
      });
      socket.emit('invalidPlay', '不是你的回合，游戏未开始或已暂停');
      return;
    }
    if (!data || !Array.isArray(data.cards) || data.cards.length === 0) {
      logger.warn('Play rejected: Invalid card data', {
        playerId: player.id,
        receivedData: data
      });
      socket.emit('invalidPlay', '无效的牌组数据');
      return;
    }

    // --- Validation and State Update ---
    // Ensure isValidPlay uses the correct arguments and doesn't modify data.cards unintentionally
    if (isValidPlay(data.cards, gameState.hands[player.id], gameState.table, gameState.levels[player.team])) {
      console.log(`Play validated for player ${player.id}:`, data.cards);

      // Remove cards from player's hand
      gameState.hands[player.id] = gameState.hands[player.id].filter(card => !data.cards.includes(card));

      // *** Crucial Step: Update table with the EXACT cards received and validated ***
      gameState.table = data.cards;
      gameState.lastPlayerId = player.id; // Track who played last
      gameState.passCount = 0; // Reset pass count when someone plays

      console.log('Updated gameState.table:', gameState.table); // Log table state before emit

      // Check if player finished
      if (gameState.hands[player.id].length === 0) {
        if (!gameState.finishOrder.includes(player.id)) {
          gameState.finishOrder.push(player.id);
          console.log(`Player ${player.id} (Pos ${player.position}) finished.`);

          // Set last winner for next round's first play
          if (gameState.finishOrder.length === 1) {
            gameState.lastWinner = player.id;
          }
        }
        // Check round end condition immediately after finishing
        if (checkRoundEnd()) {
          return; // Stop further processing if round ended
        }
      }

      // Advance turn
      advanceTurn();

      // Emit the updated state
      io.emit('updateGame', {
        ...gameState,
        players: players.map(p => ({
          id: p.id,
          position: p.position,
          team: p.team,
          isBot: p.isBot,
          disconnected: p.disconnected
        }))
      });
      // io.emit("analyticsUpdate", summarizeAnalytics()); // Uncomment if using analytics

    } else {
      console.log(`Invalid play rejected for player ${player.id}:`, data.cards);
      socket.emit('invalidPlay', '无效的牌型组合或出牌');
    }
    // --- End Validation and State Update ---
  });

  // Handle tribute phase
  socket.on('tribute', (data) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || gameState.tribute.phase !== 'tribute' || player.id !== gameState.tribute.tributeFrom) {
      console.log('Tribute rejected: Invalid phase or player');
      return;
    }

    if (!data || !data.card || !gameState.hands[player.id].includes(data.card)) {
      console.log('Tribute rejected: Invalid card');
      socket.emit('invalidTribute', '你没有这张牌');
      return;
    }

    // Store tribute card
    gameState.tribute.tributeCards[player.id] = data.card;

    // Remove card from tribute giver's hand
    gameState.hands[player.id] = gameState.hands[player.id].filter(card => card !== data.card);

    // Add card to tribute receiver's hand
    const receiverId = gameState.tribute.tributeTo;
    gameState.hands[receiverId].push(data.card);

    console.log(`Player ${player.id} tributed card ${data.card} to ${receiverId}`);

    // Move to return phase
    gameState.tribute.phase = 'return';

    io.emit('updateGame', {
      ...gameState,
      players: players.map((p) => ({
        id: p.id,
        position: p.position,
        team: p.team,
        isBot: p.isBot,
        disconnected: p.disconnected
      }))
    });
  });

  // Handle return tribute phase
  socket.on('returnTribute', (data) => {
    const player = players.find(p => p.id === socket.id);
    if (!player || gameState.tribute.phase !== 'return' || player.id !== gameState.tribute.tributeTo) {
      console.log('Return tribute rejected: Invalid phase or player');
      return;
    }

    if (!data || !data.card || !gameState.hands[player.id].includes(data.card)) {
      console.log('Return tribute rejected: Invalid card');
      socket.emit('invalidReturnTribute', '你没有这张牌');
      return;
    }

    // Store return card
    gameState.tribute.returnCards[player.id] = data.card;

    // Remove card from tribute receiver's hand
    gameState.hands[player.id] = gameState.hands[player.id].filter(card => card !== data.card);

    // Add card to tribute giver's hand
    const giverId = gameState.tribute.tributeFrom;
    gameState.hands[giverId].push(data.card);

    console.log(`Player ${player.id} returned card ${data.card} to ${giverId}`);

    // Complete tribute phase
    gameState.tribute.phase = 'complete';
    gameState.tribute.required = false;

    // Start actual game play - set first player
    const tributeReceiver = players.find(p => p.id === gameState.tribute.tributeTo);
    gameState.currentTurn = tributeReceiver ? tributeReceiver.position : 0;

    io.emit('updateGame', {
      ...gameState,
      players: players.map((p) => ({
        id: p.id,
        position: p.position,
        team: p.team,
        isBot: p.isBot,
        disconnected: p.disconnected
      }))
    });

    io.emit('tributeComplete', {
      tributeCard: gameState.tribute.tributeCards[giverId],
      returnCard: gameState.tribute.returnCards[player.id]
    });
  });

  socket.on('pass', () => {
    const player = players.find(p => p.id === socket.id);
    if (!player || player.position !== gameState.currentTurn || !gameState.roundActive || gameState.paused) { // Added gameState.paused check
      console.log(`Pass rejected: Not turn, round inactive, or game paused. Turn=${gameState.currentTurn}, PlayerPos=${player?.position}, Active=${gameState.roundActive}, Paused=${gameState.paused}`);
      return;
    }

    analytics.passes.push({ playerId: socket.id, timestamp: Date.now() });
    gameState.passCount++;

    // Check if all players passed (clear table)
    if (gameState.passCount >= 3) {
      gameState.table = [];
      gameState.passCount = 0;
      gameState.lastPlayerId = null;
      console.log('All players passed. Table cleared.');
    }

    advanceTurn();
    io.emit('updateGame', {
      ...gameState,
      players: players.map((p) => ({
        id: p.id,
        position: p.position,
        team: p.team,
        isBot: p.isBot,
        disconnected: p.disconnected
      }))
    });
    io.emit('analyticsUpdate', summarizeAnalytics());
  });

}); // End io.on('connection')

// --- Function to handle timed-out players ---
function checkReconnectionTimeout(uniquePlayerId) {
  const player = players.find(p => p.uniquePlayerId === uniquePlayerId);
  if (player && player.disconnected && (Date.now() - player.disconnectTime >= RECONNECT_TIMEOUT)) {
    console.log(`Player ${player.uniquePlayerId} (Pos ${player.position}) timed out. Removing permanently.`);

    // Remove player permanently
    const playerIndex = players.findIndex(p => p.uniquePlayerId === uniquePlayerId);
    if (playerIndex !== -1) {
      players.splice(playerIndex, 1);

      // Notify clients of permanent removal
      io.emit('playerRemoved', { position: player.position, uniquePlayerId: player.uniquePlayerId });

      // If game was paused due to this player, and now cannot continue (e.g., < 4 players), handle game end/reset
      if (gameState.paused) {
        const activePlayers = players.filter(p => !p.disconnected);
        if (activePlayers.length < 4) { // Or your minimum required players
          console.log('Game cannot continue after player timeout. Resetting.');
          // Reset game state or handle appropriately
          gameState.roundActive = false;
          gameState.paused = false;
          // players = []; // Or handle differently
          io.emit('gameReset', { message: 'Game reset due to player timeout.' });
        }
      }
      // Update game state for remaining players
      io.emit('updateGame', {
        ...gameState,
        players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected }))
      });

    }
  }
}
// --- End Timeout Check ---

function summarizeAnalytics() {
  // const now = Date.now();
  // const recentPlays = analytics.plays.filter((p) => now - p.timestamp < 60000); // Last minute
  // const playCount = recentPlays.length;
  // const errorCount = analytics.errors.filter(
  //   (e) => now - e.timestamp < 60000
  // ).length;
  // const avgTurnTime = playCount
  //   ? recentPlays.reduce(
  //       (sum, p) =>
  //         sum +
  //         (p.timestamp -
  //           (analytics.passes.find(
  //             (pa) => pa.playerId === p.playerId && pa.timestamp < p.timestamp
  //           ).timestamp || p.timestamp)),
  //       0
  //     ) / playCount
  //   : 0;
  // return { playCount, errorCount, avgTurnTime };
}

function startRound() {
  console.log('=== START ROUND DEBUG ===');
  console.log('Total players array length:', players.length);
  console.log('Players details:', players.map(p => ({ id: p.id, position: p.position, team: p.team, disconnected: p.disconnected })));

  // Clear disconnected status for all players before starting
  players.forEach(p => {
    p.disconnected = false;
    p.disconnectTime = null;
  });

  gameState.paused = false; // Ensure game is not paused
  gameState.roundActive = true;
  gameState.table = [];
  gameState.passCount = 0;
  gameState.lastPlayerId = null;

  // Store previous finish order for tribute check
  const previousFinishOrder = [...gameState.finishOrder];

  // Reset current round state
  gameState.finishOrder = [];

  // Reset tribute state
  gameState.tribute = {
    required: false,
    phase: 'none',
    tributeCards: {},
    returnCards: {},
    tributeFrom: null,
    tributeTo: null
  };

  console.log('Deck total cards:', deck.length);
  const shuffled = deck.slice().sort(() => Math.random() - 0.5);
  console.log('Shuffled deck length:', shuffled.length);
  gameState.hands = {};

  // Deal cards based on position order (0, 1, 2, 3), not array order
  const sortedPlayers = players.filter(p => !p.disconnected).sort((a, b) => a.position - b.position);
  console.log('Active players count:', sortedPlayers.length);
  console.log('Sorted players:', sortedPlayers.map(p => ({ id: p.id, position: p.position, team: p.team })));

  // Validation: Must have exactly 4 players
  if (sortedPlayers.length !== 4) {
    console.error('ERROR: Cannot start round with', sortedPlayers.length, 'players. Need exactly 4 players.');
    return;
  }

  sortedPlayers.forEach((p, i) => {
    const startIndex = i * 27;
    const endIndex = (i + 1) * 27;
    const playerCards = shuffled.slice(startIndex, endIndex);
    gameState.hands[p.id] = playerCards;
    console.log(`Player ${p.id} (pos ${p.position}): dealt ${playerCards.length} cards (indices ${startIndex}-${endIndex-1})`);
  });

  // Post-dealing verification
  console.log('Final hands verification:');
  let totalCardsDealt = 0;
  Object.keys(gameState.hands).forEach(playerId => {
    const handSize = gameState.hands[playerId].length;
    totalCardsDealt += handSize;
    console.log(`Player ${playerId}: ${handSize} cards`);
  });
  console.log('Total cards dealt:', totalCardsDealt, '/ Expected: 108');
  console.log('=== END START ROUND DEBUG ===');

  // Check if tribute is needed based on previous round results
  if (previousFinishOrder.length > 0) {
    const needsTribute = checkTributeNeeded(previousFinishOrder);
    if (needsTribute) {
      gameState.tribute = needsTribute;
      gameState.currentTurn = -1; // No one's turn during tribute phase

      io.emit('tributePhase', {
        ...gameState,
        tribute: gameState.tribute,
        players: players.map((p) => ({
          id: p.id,
          position: p.position,
          team: p.team,
          isBot: p.isBot,
          disconnected: p.disconnected
        }))
      });
      return; // Don't start normal gameplay yet
    }
  }

  // Find the first player (position 0 or last winner) who is not disconnected to set initial turn
  const startingPlayer = gameState.lastWinner ?
    players.find(p => p.id === gameState.lastWinner && !p.disconnected) :
    players.find(p => p.position === 0 && !p.disconnected);

  if (!startingPlayer) {
    // If starting player is missing/disconnected, advance turn to find the first active player
    console.warn('Starting player is missing or disconnected at round start. Advancing turn.');
    gameState.currentTurn = 0;
    advanceTurn(); // This will find the next available player
  } else {
    gameState.currentTurn = startingPlayer.position;
  }

  io.emit('startRound', {
    ...gameState,
    players: players.map((p) => ({
      id: p.id,
      position: p.position,
      team: p.team,
      isBot: p.isBot,
      disconnected: p.disconnected // Send initial disconnected status (should be false)
    }))
  });
}

function advanceTurn() {
  const activePlayers = players.filter(p => !p.disconnected);
  if (activePlayers.length === 0 || gameState.finishOrder.length >= activePlayers.length) {
    console.log('AdvanceTurn: Cannot advance, no active players or all finished.');
    checkRoundEnd(); // Check if round ended even if turn can't advance
    return;
  }

  let attempts = 0;
  const maxAttempts = players.length + 1; // Use total player slots for modulo safety

  let nextTurnPosition;
  let nextPlayer;

  do {
    gameState.currentTurn = (gameState.currentTurn + 1) % 4; // Cycle through positions 0-3
    nextTurnPosition = gameState.currentTurn;
    // Find player at this position who is NOT disconnected and NOT finished
    nextPlayer = players.find(p => p.position === nextTurnPosition && !p.disconnected && !gameState.finishOrder.includes(p.id));
    attempts++;
  } while (
    !nextPlayer && // Keep looping if no valid player found at this position
    gameState.finishOrder.length < activePlayers.length && // Ensure not everyone has finished
    attempts < maxAttempts // Safety break
  );

  if (!nextPlayer && attempts >= maxAttempts) {
    console.error(
      'AdvanceTurn: Could not find valid next player. Game state potentially corrupted.'
    );
    gameState.roundActive = false; // Stop the round if turn cannot advance
    gameState.paused = true; // Pause to indicate error state
    io.emit('updateGame', { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })) });
  } else if (nextPlayer) {
    // gameState.currentTurn is already set correctly by the loop
    console.log(`Advanced turn to position: ${gameState.currentTurn} (Player ${nextPlayer.id})`);
  } else {
    // This case might occur if all remaining active players have finished
    console.log('AdvanceTurn: No valid next player found (likely all active players finished).');
    checkRoundEnd(); // Check end condition
  }
}

function checkRoundEnd() {
  console.log(`CheckRoundEnd: finishOrder.length=${gameState.finishOrder.length}, roundActive=${gameState.roundActive}`);

  // Only check for round end if the round is actually active
  if (!gameState.roundActive) {
    console.log('CheckRoundEnd: Round not active, skipping check');
    return false;
  }

  if (gameState.finishOrder.length === 4) {
    console.log('Round ending: All 4 players finished');
    updateLevels();
    io.emit('endRound', {
      finishOrder: gameState.finishOrder,
      levels: gameState.levels
    });
    if (checkWin()) {
      io.emit('gameWin', gameState.levels);
    } else {
      startRound();
    }
    return true;
  }
  return false;
}

function updateLevels() {
  const order = gameState.finishOrder.map((id) =>
    players.find((p) => p.id === id)
  );
  const teamA = [
    order[0].team,
    order[1].team,
    order[2].team,
    order[3].team
  ].filter((t) => t === 'A').length;
  if (order[0].team === order[1].team)
    gameState.levels[order[0].team] += 3; // 1-2
  else if (order[0].team === order[2].team)
    gameState.levels[order[0].team] += 2; // 1-3
  else if (order[0].team === order[3].team)
    gameState.levels[order[0].team] += 1; // 1-4
}

function checkWin() {
  return (
    (gameState.levels.A >= 13 &&
      ([0, 1].every((i) => players[gameState.finishOrder[i]].team === 'A') ||
        [0, 2].every((i) => players[gameState.finishOrder[i]].team === 'A'))) ||
    (gameState.levels.B >= 13 &&
      ([0, 1].every((i) => players[gameState.finishOrder[i]].team === 'B') ||
        [0, 2].every((i) => players[gameState.finishOrder[i]].team === 'B')))
  );
}

function cardValue(frame) {
  if (frame >= 104) return 16; // Jokers
  const rank = Math.floor(frame / 4);
  return rank + 2;
}

// isValidPlay function is now imported from gameRules.js

// Check if tribute is needed based on previous round results
function checkTributeNeeded(finishOrder = gameState.finishOrder) {
  if (finishOrder.length < 2) return null;

  // Get the first and last players to finish
  const firstPlayerId = finishOrder[0];
  const lastPlayerId = finishOrder[finishOrder.length - 1];

  const firstPlayer = players.find(p => p.id === firstPlayerId);
  const lastPlayer = players.find(p => p.id === lastPlayerId);

  if (!firstPlayer || !lastPlayer) return null;

  // Check if they are from different teams
  if (firstPlayer.team === lastPlayer.team) return null;

  // Check level difference for tribute requirement
  const winnerTeam = firstPlayer.team;
  const loserTeam = lastPlayer.team;
  const levelDiff = gameState.levels[winnerTeam] - gameState.levels[loserTeam];

  // Tribute is required if winner team is 2+ levels ahead
  if (levelDiff >= 2) {
    return {
      required: true,
      phase: 'tribute',
      tributeCards: {},
      returnCards: {},
      tributeFrom: lastPlayerId, // Last player must tribute
      tributeTo: firstPlayerId // First player receives tribute
    };
  }

  return null;
}

// Use PORT environment variable for Render deployment
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Server running on port ${PORT}`)
);
