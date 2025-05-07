const config = {
  type: Phaser.AUTO,
  width: window.innerWidth, // Set to window width
  height: window.innerHeight,
  scene: { preload, create, update },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
};

const game = new Phaser.Game(config);

let playerHand = [],
  selectedCards = [],
  tableCards = [],
  opponentCards = [[], [], [], []];
let playButton, passButton, socket, myId, myPosition, myTeam, uniquePlayerId; // Add uniquePlayerId
let isMyTurn = false;
let players = [];
let gamePaused = false; // Add state for paused game
let disconnectedPlayers = {}; // Track disconnected players by position
let statusText; // Add a variable for general status messages
let analyticsText; // Declare analyticsText

// --- Constants for Styling ---
const COLORS = {
    backgroundGradient: [0x1a1a1a, 0x2a2a2a, 0x2a2a2a, 0x1a1a1a], // Dark gradient
    tableFill: 0x004d00, // Darker green
    tableStroke: 0xeeeeee,
    buttonIdle: 0x555555,
    buttonHover: 0x777777,
    buttonDisabled: 0x333333,
    textPrimary: "#ffffff",
    textHighlight: "#ffff00", // Yellow for turn/status
    textError: "#ff4444", // Red for errors/paused
    textInfo: "#cccccc", // Lighter grey for info
    textTeamA: "#8888ff", // Lighter blue
    textTeamB: "#ff8888", // Lighter red
    cardSelectTint: 0x00ffff, // Cyan tint for selected cards
};
const FONT_SIZES = {
    small: "16px",
    medium: "20px",
    large: "24px",
    xlarge: "32px",
    xxlarge: "48px",
};
// --- End Constants ---


function preload() {
  this.load.spritesheet("cards", "assets/cards.png", {
    frameWidth: 70,
    frameHeight: 95,
  });
  this.load.image("card_back", "assets/card_back.png");
  this.load.script(
    "socketio",
    "//cdn.jsdelivr.net/npm/socket.io-client@4/dist/socket.io.min.js"
  );
}

function create() {
  // Get dynamic dimensions
  const width = this.game.config.width;
  const height = this.game.config.height;

  // --- Background Gradient ---
  this.add.graphics()
      .fillGradientStyle(...COLORS.backgroundGradient, 1)
      .fillRect(0, 0, width, height);
  // --- End Background ---

  // --- Game Table ---
  const tableWidth = width * 0.4;
  const tableHeight = height * 0.5;
  const tableX = width / 2 - tableWidth / 2;
  const tableY = height / 2 - tableHeight / 2;
  const tableGraphics = this.add.graphics();
  tableGraphics.fillStyle(COLORS.tableFill, 1);
  tableGraphics.lineStyle(2, COLORS.tableStroke, 1);
  tableGraphics.fillRoundedRect(tableX, tableY, tableWidth, tableHeight, 15);
  tableGraphics.strokeRoundedRect(tableX, tableY, tableWidth, tableHeight, 15);
  // --- End Game Table ---


  // Team levels (top corners) - Adjusted styling
  this.teamALevel = this.add.text(width * 0.05, height * 0.05, "Team A: 2", { fontSize: FONT_SIZES.large, color: COLORS.textTeamA, fontStyle: 'bold' });
  this.teamBLevel = this.add.text(width * 0.95, height * 0.05, "Team B: 2", { fontSize: FONT_SIZES.large, color: COLORS.textTeamB, fontStyle: 'bold' }).setOrigin(1, 0);

  // Turn indicator / Status Text (center, slightly lower) - Adjusted styling
  statusText = this.add.text(width / 2, height * 0.4, "Waiting for players...", { fontSize: FONT_SIZES.xlarge, color: COLORS.textHighlight, align: 'center', fontStyle: 'bold' }).setOrigin(0.5);

  // Analytics (bottom-left) - Adjusted styling
  analyticsText = this.add.text(width * 0.05, height * 0.15, "Plays: 0\nErrors: 0\nAvg Turn: 0s", { fontSize: FONT_SIZES.small, color: COLORS.textInfo });

  // --- Buttons ---
  const buttonY = height * 0.95; // Move slightly lower
  const buttonHeight = 40;
  const buttonWidth = 100;
  const buttonPadding = 10;
  const cornerRadius = 10;

  // Pass Button
  const passButtonX = width * 0.85 - buttonWidth / 2;
  const passButtonBg = this.add.graphics()
      .fillStyle(COLORS.buttonIdle)
      .fillRoundedRect(passButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
  const passButtonText = this.add.text(passButtonX + buttonWidth / 2, buttonY, "Pass", { fontSize: FONT_SIZES.large, color: COLORS.textPrimary }).setOrigin(0.5);
  passButton = this.add.zone(passButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight).setOrigin(0).setInteractive();
  passButton.setData({ bg: passButtonBg, text: passButtonText, enabled: false }); // Store references and state

  // Play Button
  const playButtonX = width * 0.92 - buttonWidth / 2;
  const playButtonBg = this.add.graphics()
      .fillStyle(COLORS.buttonDisabled) // Start disabled
      .fillRoundedRect(playButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
  const playButtonText = this.add.text(playButtonX + buttonWidth / 2, buttonY, "Play", { fontSize: FONT_SIZES.large, color: COLORS.textInfo }).setOrigin(0.5); // Start disabled color
  playButton = this.add.zone(playButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight).setOrigin(0).setInteractive();
  playButton.setData({ bg: playButtonBg, text: playButtonText, enabled: false }); // Store references and state


  // Button Interactions
  [passButton, playButton].forEach(button => {
      button.on('pointerover', () => {
          if (button.getData('enabled')) {
              button.getData('bg').clear().fillStyle(COLORS.buttonHover).fillRoundedRect(button.x, button.y, button.width, button.height, cornerRadius);
          }
      });
      button.on('pointerout', () => {
          const color = button.getData('enabled') ? COLORS.buttonIdle : COLORS.buttonDisabled;
          button.getData('bg').clear().fillStyle(color).fillRoundedRect(button.x, button.y, button.width, button.height, cornerRadius);
      });
  });

  passButton.on("pointerdown", () => {
      if (passButton.getData('enabled')) {
          socket.emit("pass");
      }
  });
  playButton.on("pointerdown", () => {
      if (playButton.getData('enabled')) {
          playCards.call(this);
      }
  });
  // --- End Buttons ---


  socket = io("http://localhost:3000");

  // --- Reconnection Attempt ---
  uniquePlayerId = localStorage.getItem('guandanUniquePlayerId');
  if (uniquePlayerId) {
      console.log("Attempting reconnect with ID:", uniquePlayerId);
      socket.emit('attemptReconnect', { uniquePlayerId });
  } else {
      console.log("No stored ID found, connecting as new player.");
      // Server will handle as new player after timeout if no reconnect attempt received
  }
  // --- End Reconnection Attempt ---


  socket.on("assignPlayer", (data) => {
    myId = data.id;
    myPosition = data.position;
    myTeam = data.team;
    uniquePlayerId = data.uniquePlayerId; // Store received unique ID
    localStorage.setItem('guandanUniquePlayerId', uniquePlayerId); // Save to localStorage
    console.log(`Assigned: ID=${myId}, Pos=${myPosition}, Team=${myTeam}, UniqueID=${uniquePlayerId}`);
    setupPlayerPositions.call(this);
  });
  socket.on("startRound", (state) => {
    players = state.players || [];
    gamePaused = state.paused || false;
    disconnectedPlayers = {}; // Clear disconnected players list on new round
    console.log('startRound', state);
    // Clear any persistent status messages
    if (this.disconnectMessage) {
        this.disconnectMessage.destroy();
        this.disconnectMessage = null;
    }
    startRound.call(this, state);
    updatePlayerTexts.call(this, state.hands, state.players); // Pass players array
  });
  socket.on("updateGame", (state) => {
    // Update local players array ONLY if state.players is provided
    if (state.players) {
        players = state.players;
    }
    gamePaused = state.paused || false;
    updateGame.call(this, state);
  });
  socket.on("endRound", (data) => endRound.call(this, data));
  socket.on("gameWin", (levels) => {
    statusText.setText(`Game Over! Team ${levels.A >= 13 ? "A" : "B"} Wins!`).setColor(COLORS.textHighlight).setFontSize(FONT_SIZES.xxlarge);
    // Optionally disable buttons or show a restart option
  });

  // --- Updated Disconnect/Reconnect Listeners ---
  socket.on("playerDisconnected", (data) => {
      disconnectedPlayers[data.position] = true; // Mark as temporarily disconnected
      console.log(`Player disconnected at position: ${data.position}`);
      updatePlayerTexts.call(this, gameState?.hands || {}, players); // Update display
      // Status text update is handled in updateGame based on 'paused' flag
  });

  socket.on("playerReconnected", (data) => {
      console.log(`Player reconnected at position: ${data.position}`);
      delete disconnectedPlayers[data.position]; // Unmark as disconnected
      // Server sends updateGame which will refresh the state and potentially unpause
  });

  socket.on("playerRemoved", (data) => {
      console.log(`Player removed permanently from position: ${data.position}`);
      disconnectedPlayers[data.position] = true; // Keep marked as disconnected visually
      // Find player text and update to "Removed" or similar
      if (this.playerTexts && this.playerTexts[data.position]) {
          this.playerTexts[data.position].setText(`Position ${data.position + 1}: Removed`).setColor(COLORS.textError);
          if (opponentCards[data.position]) {
              opponentCards[data.position].forEach(c => c.setVisible(false));
          }
      }
      // Server might send gameReset or updateGame
  });

  socket.on("gameReset", (data) => {
      console.log("Game Reset:", data.message);
      statusText.setText("Game Resetting...").setColor(COLORS.textError);
      // Clear local state, maybe reload page or wait for new startRound
      localStorage.removeItem('guandanUniquePlayerId'); // Clear stored ID on reset
      myId = undefined;
      myPosition = undefined;
      myTeam = undefined;
      uniquePlayerId = undefined;
      players = [];
      // Clear visual elements
      playerHand.forEach(c => c.destroy()); playerHand = [];
      tableCards.forEach(c => c.destroy()); tableCards = [];
      opponentCards.forEach(arr => arr.forEach(c => c.destroy())); opponentCards = [[],[],[],[]];
      if (this.playerTexts) this.playerTexts.forEach(t => t.destroy()); this.playerTexts = null;
      // Show waiting message
      statusText.setText("Waiting for new game...").setColor(COLORS.textHighlight);
  });
  // --- End Disconnect/Reconnect Listeners ---


  socket.on("invalidPlay", (msg) => {
    // Show temporary error message near status text
    const errorText = this.add.text(width / 2, height * 0.45, msg, { fontSize: FONT_SIZES.medium, color: COLORS.textError }).setOrigin(0.5).setDepth(10);
    this.time.delayedCall(2000, () => errorText.destroy()); // Remove after 2 seconds
  });
  socket.on("analyticsUpdate", (data) => {
    // analyticsText.setText(`Plays: ${data.playCount}\nErrors: ${data.errorCount}\nAvg Turn: ${(data.avgTurnTime / 1000).toFixed(1)}s`);
  });
  socket.on("connect_error", (err) => {
      console.error("Connection Error:", err.message);
      statusText.setText("Connection Failed!").setColor(COLORS.textError);
  });
  socket.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
      if (reason !== "io server disconnect") { // Don't show pause if server kicked us (e.g., game full)
          statusText.setText("Disconnected. Attempting to reconnect...").setColor(COLORS.textError);
          gamePaused = true; // Assume paused state visually on disconnect
          updatePlayButtonStates(); // Disable buttons
      }
  });
  socket.on("connect", () => {
      console.log("Connected successfully.");
      statusText.setText("Connected. Waiting for assignment...").setColor(COLORS.textHighlight);
      // If we had a uniquePlayerId, try reconnecting again
      if (uniquePlayerId && !myId) { // Check if not already assigned (prevents double emit)
          console.log("Re-attempting reconnect after successful connection.");
          socket.emit('attemptReconnect', { uniquePlayerId });
      }
  });
}

function setupPlayerPositions() {
  const width = this.game.config.width;
  const height = this.game.config.height;
  const padding = width * 0.02; // Padding from edges

  // Destroy existing texts if they exist (e.g., on reconnect/reset)
  if (this.playerTexts) {
      this.playerTexts.forEach(container => container.destroy());
  }
  this.playerTexts = []; // Reset array

  // Define relative positions and text alignment anchors
  const positions = [
      // You (Bottom Center)
      { x: 0.5, y: 0.95, anchorX: 0.5, anchorY: 1 },
      // Left Player
      { x: padding, y: 0.5, anchorX: 0, anchorY: 0.5 },
      // Top Player (Teammate)
      { x: 0.5, y: padding, anchorX: 0.5, anchorY: 0 },
      // Right Player
      { x: 1 - padding, y: 0.5, anchorX: 1, anchorY: 0.5 }
  ];

  // Create text containers for better alignment and background
  for (let i = 0; i < 4; i++) {
      const playerIndex = (myPosition + i) % 4; // Calculate actual player position index
      const displayPos = positions[i]; // Position on screen relative to 'You'

      const container = this.add.container(width * displayPos.x, height * displayPos.y);
      const text = this.add.text(0, 0, `Position ${playerIndex + 1}: ? cards`, { fontSize: FONT_SIZES.medium, color: COLORS.textInfo })
          .setOrigin(displayPos.anchorX, displayPos.anchorY); // Set origin based on anchor

      // Optional: Add a background rectangle for readability
      // const bgPadding = 5;
      // const bg = this.add.graphics().fillStyle(0x000000, 0.5)
      //     .fillRect(text.x - displayPos.anchorX * text.width - bgPadding, text.y - displayPos.anchorY * text.height - bgPadding, text.width + bgPadding*2, text.height + bgPadding*2);
      // container.add(bg); // Add background behind text

      container.add(text);
      // container.angle = displayPos.angle; // REMOVED ANGLE
      this.playerTexts[playerIndex] = container; // Store container by actual position index
  }
}
function getCardInfo(frame) {
  if (frame >= 104) {
    const jokerIndex = frame - 104;
    return {
      value: 13,
      suit: 4,
      deck: jokerIndex >= 2 ? 1 : 0,
      jokerType: jokerIndex % 2,
      frame: frame
    };
  }

  const deck = frame >= 52 ? 1 : 0;
  const frameInDeck = frame % 52;
  const suit = Math.floor(frameInDeck / 13);
  const value = frameInDeck % 13;

  return {
    value: value,
    suit: suit,
    deck: deck,
    jokerType: -1,
    frame: frame
  };
}

function sortCards(hand) {
  return hand.slice().sort((a, b) => {
    const cardA = getCardInfo(a);
    const cardB = getCardInfo(b);

    if (cardA.value !== cardB.value) {
      return cardA.value - cardB.value;
    }
    if (cardA.suit !== cardB.suit) {
      return cardA.suit - cardB.suit;
    }
    if (cardA.deck !== cardB.deck) {
      return cardA.deck - cardB.deck;
    }
    if (cardA.jokerType !== -1 && cardB.jokerType !== -1) {
      return cardA.jokerType - cardB.jokerType;
    }
    return 0;
  });
}

function startRound(state) {
  const width = this.game.config.width;
  const height = this.game.config.height;
  const cardScale = Math.min(width, height) / 900; // Slightly smaller cards

  // Clear status text
  statusText.setText("").setColor(COLORS.textHighlight);

  // Clear old game objects
  playerHand.forEach(c => c.destroy()); playerHand = [];
  selectedCards = []; // Clear selection
  tableCards.forEach(c => c.destroy()); tableCards = [];
  opponentCards.forEach(cards => cards.forEach(c => c.destroy()));
  opponentCards = [[], [], [], []]; // Reinitialize opponent card arrays

  // Reset player text visuals (will be updated by updatePlayerTexts)
  if (this.playerTexts) {
      this.playerTexts.forEach((container, i) => {
          if (container) {
              const text = container.list[0]; // Assuming text is the first element
              text.setText(`Position ${i + 1}: ? cards`).setColor(COLORS.textInfo);
          }
      });
  } else {
      // If playerTexts aren't set up yet (e.g., very fast startRound before assignPlayer)
      setupPlayerPositions.call(this);
  }

  const hand = state.hands[myId];
  if (!hand) {
    console.error("Hand not found for myId:", myId);
    statusText.setText("Error: Hand not received!").setColor(COLORS.textError);
    return;
  }

  // Sort and display hand
  const sortedHand = sortCards(hand);
  const totalHandWidth = width * 0.6; // Max width for hand display
  const cardOverlap = 45 * cardScale; // Overlap cards slightly
  const requiredWidth = sortedHand.length * cardOverlap - (cardOverlap - 70 * cardScale); // Calculate width needed
  const startX = width / 2 - Math.min(totalHandWidth, requiredWidth) / 2; // Center the hand display
  const displaySpacing = Math.min(cardOverlap, totalHandWidth / Math.max(1, sortedHand.length -1)); // Calculate spacing

  for (let i = 0; i < sortedHand.length; i++) {
    let card = this.add.sprite(startX + i * displaySpacing, height * 0.85, "cards", sortedHand[i]).setInteractive(); // Lower hand slightly
    card.setScale(cardScale);
    card.setData('originalY', card.y); // Store original Y for selection animation
    card.on("pointerdown", () => selectCard.call(this, card));
    card.on("pointerover", () => { if (!card.getData('selected')) card.setTint(0xcccccc); });
    card.on("pointerout", () => { if (!card.getData('selected')) card.clearTint(); });
    playerHand.push(card);
  }

  // Call updateGame immediately to set initial turn indicator and opponent cards
  updateGame.call(this, state);
}

function updateGame(state) {
  const width = this.game.config.width;
  const height = this.game.config.height;
  const cardScale = Math.min(width, height) / 900; // Consistent card scale

  // Ensure player assignment is complete
  if (myId === undefined || myPosition === undefined) {
      console.log("updateGame received before player assignment, waiting...");
      statusText.setText("Connecting...").setColor(COLORS.textHighlight);
      return;
  }

  // Update local game state variables
  gamePaused = state.paused || false;
  if (state.players) players = state.players; // Update players array if provided

  // Safety check for essential state data
  if (!players || players.length === 0 || state.currentTurn === undefined || !state.levels) {
      console.warn("updateGame: Incomplete state received:", state);
      // Avoid full update if state is bad, maybe show error
      if (!gamePaused) statusText.setText("Waiting for state...").setColor(COLORS.textHighlight);
      return;
  }

  // Find the player object for the current turn based on position
  const currentPlayer = players.find(p => p.position === state.currentTurn && !p.disconnected); // Check disconnected status too

  isMyTurn = currentPlayer && currentPlayer.id === myId && state.roundActive && !gamePaused;

  // Update Status Text / Turn Indicator
  if (gamePaused) {
      statusText.setText("Game Paused").setColor(COLORS.textError).setFontSize(FONT_SIZES.xlarge);
  } else if (!state.roundActive) {
      // Check for win condition first
      if (state.levels.A >= 13 || state.levels.B >= 13) {
          statusText.setText(`Game Over! Team ${state.levels.A >= 13 ? "A" : "B"} Wins!`).setColor(COLORS.textHighlight).setFontSize(FONT_SIZES.xxlarge);
      } else {
          statusText.setText("Round Over").setColor(COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
      }
  } else if (currentPlayer) {
      statusText.setText(isMyTurn ? "Your Turn" : `Player ${state.currentTurn + 1}'s Turn`).setColor(isMyTurn ? COLORS.textHighlight : COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
  } else {
      // Handle case where currentTurn position might not have a player (e.g., after disconnect and before advanceTurn)
      statusText.setText("Waiting...").setColor(COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
      console.log(`No active player found at current turn position: ${state.currentTurn}`);
  }

  // Update Team Levels
  this.teamALevel.setText(`Team A: ${state.levels.A}`);
  this.teamBLevel.setText(`Team B: ${state.levels.B}`);

  // Update table cards
  tableCards.forEach(c => c.destroy());
  tableCards = [];
  if (state.table && state.table.length > 0) {
      const tableSpacing = 60 * cardScale; // Spacing for table cards
      const tableStartX = width / 2 - (state.table.length - 1) * tableSpacing / 2;
      tableCards = state.table.map((frame, i) =>
          this.add.sprite(tableStartX + i * tableSpacing, height / 2, "cards", frame).setScale(cardScale)
      );
  }

  // Update player texts and opponent card backs
  updatePlayerTexts.call(this, state.hands, players); // Pass players array

  // Update Play/Pass button states
  updatePlayButtonStates();
}

// Helper function to update player texts and opponent cards
function updatePlayerTexts(hands, currentPlayers) {
    const width = this.game.config.width;
    const height = this.game.config.height;
    const cardScale = Math.min(width, height) / 900; // Consistent scale
    const cardPadding = 5 * cardScale; // Padding between cards and text

    if (!this.playerTexts || !currentPlayers) return; // Guard against calls before setup or missing data

    // Clear existing opponent cards first
    opponentCards.forEach(cards => cards.forEach(c => c.destroy()));
    opponentCards = [[], [], [], []]; // Reinitialize

    currentPlayers.forEach(player => {
        const pos = player.position;
        const handCount = hands[player.id]?.length ?? 0;
        const container = this.playerTexts[pos];

        if (!container) return; // Skip if text container doesn't exist for this position

        const textElement = container.list[0]; // Assuming text is first element

        if (player.disconnected) {
            textElement.setText(`Position ${pos + 1}: Disconnected`).setColor(COLORS.textError);
            // Keep opponent cards hidden (already cleared)
        } else {
            // Update text for active players
            const playerType = pos === myPosition ? "You" : (player.team === myTeam ? "Teammate" : "Opponent");
            const botIndicator = player.isBot ? " (Bot)" : "";
            textElement.setText(`${playerType}${botIndicator}: ${handCount} cards`).setColor(COLORS.textPrimary);

            // Update opponent card backs (if not 'You')
            if (pos !== myPosition) {
                const displayPosIndex = (pos - myPosition + 4) % 4; // Index in positions array relative to 'You'

                const maxVisibleCards = 15;
                const displayCount = Math.min(handCount, maxVisibleCards);
                const backCardScale = 0.7 * cardScale; // Make backs even smaller
                const backCardWidth = 70 * backCardScale;
                const backCardHeight = 95 * backCardScale;
                const cardOverlap = 10 * backCardScale; // Adjust overlap for smaller cards

                // Calculate the total span needed for the cards
                const requiredSpan = displayCount > 0 ? (displayCount - 1) * cardOverlap + backCardWidth : 0;

                // Get text bounds for positioning cards relative to text
                const textBounds = textElement.getBounds();
                let groupStartX, groupStartY;

                // Position cards based on player position relative to 'You'
                switch (displayPosIndex) {
                    case 1: // Left Player
                        groupStartX = textBounds.right + cardPadding;
                        groupStartY = textBounds.centerY - (requiredSpan / 2); // Center vertically
                        break;
                    case 2: // Top Player
                        groupStartX = textBounds.centerX - (requiredSpan / 2); // Center horizontally
                        groupStartY = textBounds.bottom + cardPadding;
                        break;
                    case 3: // Right Player
                        groupStartX = textBounds.left - cardPadding - requiredSpan; // Align right edge of group
                        groupStartY = textBounds.centerY - (requiredSpan / 2); // Center vertically
                        break;
                }


                for (let i = 0; i < displayCount; i++) {
                    // Draw cards horizontally for top/bottom, vertically for left/right (relative to screen)
                    let cardX = (displayPosIndex === 1 || displayPosIndex === 3) ? groupStartX + i * cardOverlap : groupStartX + i * cardOverlap;
                    let cardY = (displayPosIndex === 1 || displayPosIndex === 3) ? groupStartY + i * cardOverlap : groupStartY; // Stacking horizontally for top player

                    // Adjust position based on side for clarity
                     if (displayPosIndex === 1) { // Left
                         cardX = groupStartX; // Align left edge
                         cardY = groupStartY + i * cardOverlap;
                     } else if (displayPosIndex === 2) { // Top
                         cardX = groupStartX + i * cardOverlap;
                         cardY = groupStartY; // Align top edge
                     } else if (displayPosIndex === 3) { // Right
                         cardX = groupStartX + requiredSpan - backCardWidth - i * cardOverlap; // Align right edge, draw leftwards
                         cardY = groupStartY + i * cardOverlap;
                     }


                    let card = this.add.sprite(cardX, cardY, "card_back")
                        .setScale(backCardScale)
                        .setOrigin(0, 0); // Use top-left origin for easier positioning

                    opponentCards[pos].push(card); // Store by actual position
                }
            }
        }
    });

    // Handle empty slots (if player array doesn't have 4 players)
    for (let i = 0; i < 4; i++) {
        if (!currentPlayers.find(p => p.position === i)) {
             if (this.playerTexts[i]) {
                 const textElement = this.playerTexts[i].list[0];
                 textElement.setText(`Position ${i+1}: Empty`).setColor(COLORS.textInfo);
             }
             // Opponent cards already cleared
        }
    }
}


function selectCard(card) {
  const index = selectedCards.indexOf(card);
  const originalY = card.getData('originalY');
  const selectedYOffset = -20; // Move card up when selected

  if (index === -1) {
    // Select
    selectedCards.push(card);
    card.setTint(COLORS.cardSelectTint);
    card.setData('selected', true);
    // Animate up
    this.tweens.add({ targets: card, y: originalY + selectedYOffset, duration: 100, ease: 'Power1' });
  } else {
    // Deselect
    selectedCards.splice(index, 1);
    card.clearTint();
    card.setData('selected', false);
    // Animate back down
    this.tweens.add({ targets: card, y: originalY, duration: 100, ease: 'Power1' });
  }
  updatePlayButtonStates(); // Update button state after selection change
}

function playCards() {
  const cardsToPlay = selectedCards.map(c => c.frame.name);
  socket.emit("play", { cards: cardsToPlay });

  // Animate played cards towards the center (optional) then destroy
  selectedCards.forEach(card => {
      card.disableInteractive(); // Prevent further interaction
      this.tweens.add({
          targets: card,
          x: this.game.config.width / 2,
          y: this.game.config.height / 2,
          scale: card.scale * 0.5, // Shrink
          alpha: 0, // Fade out
          duration: 300,
          ease: 'Power1',
          onComplete: () => card.destroy()
      });
  });

  // Remove played cards from hand array immediately
  playerHand = playerHand.filter(card => !selectedCards.includes(card));
  selectedCards = []; // Clear selection
  updatePlayButtonStates(); // Update button state

  // --- Add Card Rearrangement Logic ---
  rearrangeHand.call(this);
  // --- End Card Rearrangement Logic ---
}

// --- Add New Function to Rearrange Hand ---
function rearrangeHand() {
    const width = this.game.config.width;
    const height = this.game.config.height;
    const cardScale = Math.min(width, height) / 900;

    // Recalculate layout based on remaining cards
    const remainingHand = playerHand; // Already filtered in playCards
    const totalHandWidth = width * 0.6;
    const cardOverlap = 45 * cardScale;
    const requiredWidth = remainingHand.length > 0 ? (remainingHand.length -1) * cardOverlap + (70 * cardScale) : 0; // Width of one card if only one remains
    const startX = width / 2 - Math.min(totalHandWidth, requiredWidth) / 2;
    const displaySpacing = remainingHand.length > 1 ? Math.min(cardOverlap, totalHandWidth / (remainingHand.length - 1)) : 0; // No spacing if 1 card
    const targetY = height * 0.85; // Original Y position for hand cards

    remainingHand.forEach((card, i) => {
        const targetX = startX + i * displaySpacing;
        // Animate card to its new position
        this.tweens.add({
            targets: card,
            x: targetX,
            y: targetY, // Ensure card returns to base Y level
            duration: 200, // Quick animation
            ease: 'Power1',
            onComplete: () => {
                card.setData('originalY', targetY); // Update originalY after move
            }
        });
        // Ensure card tint is cleared if it was selected (should be cleared by playCards, but belt-and-suspenders)
        card.clearTint();
        card.setData('selected', false);
    });
}
// --- End New Function ---


// Centralized function to update button appearance and enabled state
function updatePlayButtonStates() {
    const canPlay = isMyTurn && !gamePaused;
    const playEnabled = canPlay && selectedCards.length > 0;

    // Pass Button
    passButton.setData('enabled', canPlay);
    passButton.getData('bg').clear().fillStyle(canPlay ? COLORS.buttonIdle : COLORS.buttonDisabled).fillRoundedRect(passButton.x, passButton.y, passButton.width, passButton.height, 10);
    passButton.getData('text').setColor(canPlay ? COLORS.textPrimary : COLORS.textInfo);

    // Play Button
    playButton.setData('enabled', playEnabled);
    playButton.getData('bg').clear().fillStyle(playEnabled ? COLORS.buttonIdle : COLORS.buttonDisabled).fillRoundedRect(playButton.x, playButton.y, playButton.width, playButton.height, 10);
    playButton.getData('text').setColor(playEnabled ? COLORS.textPrimary : COLORS.textInfo);
}


function endRound(data) {
  // Display round end message, maybe clear table
  statusText.setText("Round Over!").setColor(COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
  // Server will send startRound shortly if game continues
}

function update() {
  // Main update loop (if needed for continuous updates)
}
