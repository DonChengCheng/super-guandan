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

// Card Deck (simplified for demo)
const deck = Array.from({ length: 108 }, (_, i) => i); // Frames 0-107
const baseUrl = "http://localhost:3000";
const RECONNECT_TIMEOUT = 30000; // 30 seconds timeout for reconnection

// Game State
let players = []; // { id (socket.id), position, team, isBot, uniquePlayerId, disconnected, disconnectTime }
let gameState = {
  currentTurn: 0, // Player position (0-3)
  table: [], // Last played cards
  hands: {}, // Player ID -> [card frames]
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

// --- Helper Function to generate a simple unique ID ---
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15);
}
// --- End Helper ---

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // --- Reconnection Logic ---
  // Client will emit 'attemptReconnect' with their stored uniquePlayerId
  socket.on("attemptReconnect", (data) => {
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
      socket.emit("assignPlayer", { id: socket.id, position: reconnectingPlayer.position, team: reconnectingPlayer.team, uniquePlayerId: reconnectingPlayer.uniquePlayerId }); // Send uniqueId back too
      socket.emit("updateGame", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })) }); // Send full state including hands

      // Notify others
      io.emit("playerReconnected", { position: reconnectingPlayer.position, id: socket.id }); // Send new ID

      // Check if game should unpause
      const disconnectedPlayers = players.filter(p => p.disconnected && !p.isBot);
      if (gameState.paused && disconnectedPlayers.length === 0) {
          console.log("Last disconnected player reconnected. Unpausing game.");
          gameState.paused = false;
          // No need to change roundActive here if it was kept true during pause
          io.emit("updateGame", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })) }); // Emit unpaused state
      }

    } else {
      console.log(`Reconnect attempt failed for ${socket.id} with ID ${data.uniquePlayerId}: Player not found or not disconnected.`);
      // Treat as a new player connection attempt
      handleNewPlayerConnection(socket);
    }
  });
  // --- End Reconnection Logic ---

  // Initial connection handling (wrapped in a function)
  function handleNewPlayerConnection(currentSocket) {
      if (players.filter(p => !p.disconnected).length >= 4) {
          console.log(`Connection rejected for ${currentSocket.id}: Game full.`);
          currentSocket.emit("gameFull");
          currentSocket.disconnect();
          return;
      }

      // Check if there's an empty slot from a timed-out player (optional enhancement)
      // For now, just add to the end if space allows

      const position = players.length; // Simplistic position assignment, might need refinement if players leave permanently
      const team = position % 2 === 0 ? "A" : "B";
      const isBot = false;
      const uniquePlayerId = generateUniqueId(); // Assign a unique ID

      const newPlayer = { id: currentSocket.id, position, team, isBot, uniquePlayerId, disconnected: false, disconnectTime: null };
      players.push(newPlayer);
      currentSocket.emit("assignPlayer", { id: currentSocket.id, position, team, uniquePlayerId }); // Send uniqueId to client
      console.log(
          `New player assigned: ${currentSocket.id}, Position ${position}, Team ${team}, UniqueID ${uniquePlayerId}`
      );

      // Check if we need to start the round after adding the real player
      if (players.filter(p => !p.disconnected).length === 4 && !gameState.roundActive && !gameState.paused) {
          console.log("Fourth player joined. Starting round.");
          startRound();
      }

      // Simulate bot players (ensure bots also get unique IDs)
      if (players.filter(p => !p.disconnected && !p.isBot).length === 1 && players.filter(p => !p.disconnected).length === 1) {
          console.log("First real player joined. Adding 3 bots.");
          for (let i = 1; i < 4; i++) {
              const botSocket = ioClient(baseUrl, { forceNew: true });
              const botUniqueId = generateUniqueId(); // Bot unique ID

              botSocket.on("connect", () => {
                  const botPosition = players.length;
                  if (botPosition >= 4) {
                      console.warn(`Attempted to add bot ${i} but game is already full.`);
                      botSocket.disconnect();
                      return;
                  }
                  const botTeam = botPosition % 2 === 0 ? "A" : "B";
                  const botPlayer = {
                      id: botSocket.id, // Bot's socket ID
                      position: botPosition,
                      team: botTeam,
                      isBot: true,
                      uniquePlayerId: botUniqueId, // Store unique ID for bot too
                      disconnected: false,
                      disconnectTime: null
                  };
                  players.push(botPlayer);

                  console.log(
                      `Bot ${i} connected: ${botSocket.id}, Position ${botPosition}, Team ${botTeam}, UniqueID ${botUniqueId}`
                  );

                  botSocket.emit("assignPlayer", {
                      id: botSocket.id,
                      position: botPosition,
                      team: botTeam,
                      uniquePlayerId: botUniqueId // Send ID to bot client if needed
                  });

                  if (players.filter(p => !p.disconnected).length === 4 && !gameState.roundActive && !gameState.paused) {
                      console.log(`Fourth player (bot ${i}) joined. Starting round.`);
                      startRound();
                  }

                  // Bot logic listeners...
                  botSocket.on("updateGame", (state) => {
                      // ... existing bot play logic ...
                      // Ensure bot logic checks if game is paused: if (state.roundActive && !state.paused && ...)
                      const currentPlayer = players.find(p => p.position === state.currentTurn);
                      if (state.roundActive && !state.paused && currentPlayer && currentPlayer.id === botSocket.id) {
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
                    console.log(
                      `Bot ${i} (${botSocket.id}) received assignment confirmation: Position ${data.position}, Team ${data.team}`
                    );
                  });

                  botSocket.on("disconnect", () => {
                    console.log(`Bot ${i} disconnected: ${botSocket.id}`);
                    const botIndex = players.findIndex((p) => p.id === botSocket.id);
                    if (botIndex !== -1) {
                      players.splice(botIndex, 1);
                      io.emit("playerLeft", botSocket.id);
                      console.log(`Bot ${botSocket.id} removed from players.`);
                      if (gameState.roundActive) {
                        console.log(
                          "Bot disconnected during active round. Stopping round."
                        );
                        gameState.roundActive = false;
                        io.emit("updateGame", {
                          ...gameState,
                          players: players.map((p) => ({
                            id: p.id,
                            position: p.position,
                            team: p.team,
                          })),
                        });
                      }
                    }
                  });

                  botSocket.on("connect_error", (err) => {
                    console.error(`Bot ${i} connection error:`, err.message);
                  });
              });
          }
      }
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
      console.log("Player disconnected:", socket.id);
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
          io.emit("playerDisconnected", { position: leavingPlayer.position, id: socket.id });

          // If a REAL player disconnects during an active game, pause it.
          if (!leavingPlayer.isBot && wasRoundActive) {
              gameState.paused = true;
              console.log(`Real player left during active round. Pausing game.`);

              // If the leaving player was the current turn, advance it
              if (leavingPlayer.position === gameState.currentTurn && players.filter(p => !p.disconnected).length > 0) {
                  console.log(`Advancing turn from disconnected player ${leavingPlayer.position}`)
                  advanceTurn(); // Advance turn *after* marking as disconnected
              }
          } else if (leavingPlayer.isBot && wasRoundActive) {
              // Option 1: Pause on bot disconnect too (like real players)
              gameState.paused = true;
              console.log(`Bot left during active round. Pausing game.`);
              if (leavingPlayer.position === gameState.currentTurn && players.filter(p => !p.disconnected).length > 0) {
                  advanceTurn();
              }
              // Option 2: Original logic - Stop round (commented out)
              // gameState.roundActive = false;
              // console.log("Bot disconnected during active round. Stopping round.");
          }

          // Always update game state for all clients after a disconnect/pause
          io.emit("updateGame", {
              ...gameState,
              players: players.map(p => ({
                  id: p.id,
                  position: p.position,
                  team: p.team,
                  isBot: p.isBot,
                  disconnected: p.disconnected // Send disconnected status
              })),
          });

          // Start timeout check for this player
          setTimeout(() => checkReconnectionTimeout(leavingPlayer.uniquePlayerId), RECONNECT_TIMEOUT + 1000); // Check shortly after timeout expires

      } else {
          console.log(`Disconnected socket ${socket.id} was not found in players array (already removed or never fully added).`);
      }
  });

  // --- Other event listeners ('play', 'pass') need to check gameState.paused ---
  socket.on("play", (data) => {
      const player = players.find(p => p.id === socket.id);
      console.log(`Received play from ${player?.id} (Pos ${player?.position}):`, data.cards); // Log received cards

      if (!player || player.position !== gameState.currentTurn || !gameState.roundActive || gameState.paused) {
          console.log(`Play rejected: Not turn, round inactive, or game paused. Turn=${gameState.currentTurn}, PlayerPos=${player?.position}, Active=${gameState.roundActive}, Paused=${gameState.paused}`);
          socket.emit("invalidPlay", "Not your turn, round inactive, or game paused."); // Inform player
          return;
      }
      if (!data || !Array.isArray(data.cards) || data.cards.length === 0) {
          console.log(`Play rejected: Invalid card data received from ${player.id}`);
          socket.emit("invalidPlay", "Invalid card data sent.");
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

          console.log("Updated gameState.table:", gameState.table); // Log table state before emit

          // Check if player finished
          if (gameState.hands[player.id].length === 0) {
              if (!gameState.finishOrder.includes(player.id)) {
                  gameState.finishOrder.push(player.id);
                  console.log(`Player ${player.id} (Pos ${player.position}) finished.`);
              }
              // Check round end condition immediately after finishing
              if (checkRoundEnd()) {
                  return; // Stop further processing if round ended
              }
          }

          // Advance turn
          advanceTurn();

          // Emit the updated state
          io.emit("updateGame", {
              ...gameState,
              players: players.map(p => ({
                  id: p.id,
                  position: p.position,
                  team: p.team,
                  isBot: p.isBot,
                  disconnected: p.disconnected
              })),
          });
          // io.emit("analyticsUpdate", summarizeAnalytics()); // Uncomment if using analytics

      } else {
          console.log(`Invalid play rejected for player ${player.id}:`, data.cards);
          socket.emit("invalidPlay", "Invalid combination or move.");
      }
      // --- End Validation and State Update ---
  });

  socket.on("pass", () => {
    const player = players.find(p => p.id === socket.id);
    if (!player || player.position !== gameState.currentTurn || !gameState.roundActive || gameState.paused) { // Added gameState.paused check
        console.log(`Pass rejected: Not turn, round inactive, or game paused. Turn=${gameState.currentTurn}, PlayerPos=${player?.position}, Active=${gameState.roundActive}, Paused=${gameState.paused}`);
        return;
    }
    analytics.passes.push({ playerId: socket.id, timestamp: Date.now() });
    advanceTurn();
    io.emit("updateGame", {
      ...gameState,
      players: players.map((p) => ({
        id: p.id,
        position: p.position,
        team: p.team,
      })),
    });
    io.emit("analyticsUpdate", summarizeAnalytics());
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
            io.emit("playerRemoved", { position: player.position, uniquePlayerId: player.uniquePlayerId });

            // If game was paused due to this player, and now cannot continue (e.g., < 4 players), handle game end/reset
            if (gameState.paused) {
                 const activePlayers = players.filter(p => !p.disconnected);
                 if (activePlayers.length < 4) { // Or your minimum required players
                     console.log("Game cannot continue after player timeout. Resetting.");
                     // Reset game state or handle appropriately
                     gameState.roundActive = false;
                     gameState.paused = false;
                     // players = []; // Or handle differently
                     io.emit("gameReset", { message: "Game reset due to player timeout." });
                 }
            }
             // Update game state for remaining players
             io.emit("updateGame", {
                 ...gameState,
                 players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })),
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
  // Clear disconnected status for all players before starting
  players.forEach(p => {
      p.disconnected = false;
      p.disconnectTime = null;
  });

  gameState.paused = false; // Ensure game is not paused
  gameState.roundActive = true;
  gameState.currentTurn = 0; // Start with position 0
  gameState.table = [];
  gameState.finishOrder = [];
  const shuffled = deck.slice().sort(() => Math.random() - 0.5);
  gameState.hands = {};
  players.forEach(
    (p, i) => (gameState.hands[p.id] = shuffled.slice(i * 27, (i + 1) * 27)) // Deal based on current players array order
  );

  // Find the first player (position 0) who is not disconnected to set initial turn
  const firstPlayer = players.find(p => p.position === 0 && !p.disconnected);
  if (!firstPlayer) {
      // If player 0 is missing/disconnected, advance turn to find the first active player
      console.warn("Player at position 0 is missing or disconnected at round start. Advancing turn.");
      advanceTurn(); // This will find the next available player
  } else {
      gameState.currentTurn = 0; // Explicitly set if player 0 is present
  }


  io.emit("startRound", {
    ...gameState,
    players: players.map((p) => ({
      id: p.id,
      position: p.position,
      team: p.team,
      isBot: p.isBot,
      disconnected: p.disconnected // Send initial disconnected status (should be false)
    })),
  });
  // io.emit("analyticsUpdate", summarizeAnalytics()); // Uncomment if using analytics
}

function advanceTurn() {
  const activePlayers = players.filter(p => !p.disconnected);
  if (activePlayers.length === 0 || gameState.finishOrder.length >= activePlayers.length) {
    console.log("AdvanceTurn: Cannot advance, no active players or all finished.");
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
      "AdvanceTurn: Could not find valid next player. Game state potentially corrupted."
    );
    gameState.roundActive = false; // Stop the round if turn cannot advance
    gameState.paused = true; // Pause to indicate error state
    io.emit("updateGame", { ...gameState, players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })) });
  } else if (nextPlayer) {
    // gameState.currentTurn is already set correctly by the loop
    console.log(`Advanced turn to position: ${gameState.currentTurn} (Player ${nextPlayer.id})`);
  } else {
    // This case might occur if all remaining active players have finished
    console.log("AdvanceTurn: No valid next player found (likely all active players finished).");
    checkRoundEnd(); // Check end condition
  }
}

function checkRoundEnd() {
  if (gameState.finishOrder.length === 4) {
    updateLevels();
    io.emit("endRound", {
      finishOrder: gameState.finishOrder,
      levels: gameState.levels,
    });
    if (checkWin()) {
      io.emit("gameWin", gameState.levels);
    } else {
      startRound();
    }
  }
}

function updateLevels() {
  const order = gameState.finishOrder.map((id) =>
    players.find((p) => p.id === id)
  );
  const teamA = [
    order[0].team,
    order[1].team,
    order[2].team,
    order[3].team,
  ].filter((t) => t === "A").length;
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
      ([0, 1].every((i) => players[gameState.finishOrder[i]].team === "A") ||
        [0, 2].every((i) => players[gameState.finishOrder[i]].team === "A"))) ||
    (gameState.levels.B >= 13 &&
      ([0, 1].every((i) => players[gameState.finishOrder[i]].team === "B") ||
        [0, 2].every((i) => players[gameState.finishOrder[i]].team === "B")))
  );
}

function cardValue(frame) {
  if (frame >= 104) return 16; // Jokers
  const rank = Math.floor(frame / 4);
  return rank + 2;
}

// Ensure isValidPlay function exists and performs correct validation
// It should return true or false and NOT modify gameState or data.cards directly
function isValidPlay(cards, hand, table, level) {
    // Placeholder: Add actual Guandan validation logic here
    console.log(`Validating play: Cards=${cards}, Hand=${hand?.length}, Table=${table?.length}, Level=${level}`);

    // Basic checks:
    if (!cards || cards.length === 0) return false; // Must play cards
    if (!hand || !cards.every(c => hand.includes(c))) {
        console.error("Validation Fail: Player doesn't have the cards:", cards, hand);
        return false; // Must have the cards
    }

    // TODO: Implement full Guandan play validation rules
    // - Compare type and value against table
    // - Check for valid combinations (single, pair, triple, runs, plates, bombs)
    // - Consider current level card rules

    // Temporary: Allow any play if table is empty, otherwise basic length check (NEEDS REPLACEMENT)
    if (!table || table.length === 0) {
        console.log("Validation Pass: Table empty.");
        return true; // Allow first play
    }

    // --- Add Real Guandan Logic Here ---
    // Example: Check if played cards are stronger than table cards
    // const playedType = getHandType(cards, level);
    // const tableType = getHandType(table, level);
    // if (!playedType) return false; // Invalid combination played
    // if (playedType.type === tableType.type && playedType.rank > tableType.rank) return true; // Higher rank same type
    // if (playedType.isBomb && !tableType.isBomb) return true; // Bomb beats non-bomb
    // if (playedType.isBomb && tableType.isBomb && playedType.rank > tableType.rank) return true; // Higher bomb
    // ... other rules ...


    console.warn("isValidPlay: Validation logic not fully implemented. Allowing play for testing.");
    return true; // Allow most plays for now during development (REMOVE THIS LINE LATER)
    // return false; // Default to false once real logic is added
}

server.listen(3000, () =>
  console.log("Server running on http://localhost:3000")
);
