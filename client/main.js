const config = {
  type: Phaser.AUTO,
  width: window.innerWidth, // Set to window width
  height: window.innerHeight,
  scene: { preload, create, update },
  scale: { 
    mode: Phaser.Scale.RESIZE, 
    autoCenter: Phaser.Scale.CENTER_BOTH 
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    powerPreference: 'high-performance',
    clearBeforeRender: true,
    premultipliedAlpha: false,
    multiSample: 4,
    batchSize: 4096
  }
};

const game = new Phaser.Game(config);

let playerHand = [],
  selectedCards = [],
  tableCards = [],
  opponentCards = [[], [], [], []];
let playButton, passButton, tributeButton, returnTributeButton, socket, myId, myPosition, myTeam, uniquePlayerId; // Add uniquePlayerId
let connectionStatus = null;  // Connection status indicator
let isMyTurn = false;
let players = [];
let gamePaused = false; // Add state for paused game
let disconnectedPlayers = {}; // Track disconnected players by position
let statusText; // Add a variable for general status messages
let analyticsText; // Declare analyticsText
let tributePhase = false; // Track if we're in tribute phase
let tributeState = null; // Store tribute state info

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
  // Enable high-quality texture loading with filtering
  this.load.image("cards_img", "assets/cards.png");
  
  this.load.spritesheet("cards", "assets/cards.png", {
    frameWidth: 70,
    frameHeight: 95,
  });
  this.load.image("card_back", "assets/card_back.png");
  // Socket.IO is already loaded in HTML
  
  // Set texture filtering for high-quality rendering
  this.load.on('filecomplete-spritesheet-cards', () => {
    this.textures.get('cards').setFilter(Phaser.Textures.LINEAR);
  });
  this.load.on('filecomplete-image-card_back', () => {
    this.textures.get('card_back').setFilter(Phaser.Textures.LINEAR);
  });
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
  this.teamALevel = this.add.text(width * 0.05, height * 0.05, "A队: 2", { fontSize: FONT_SIZES.large, color: COLORS.textTeamA, fontStyle: 'bold' });
  this.teamBLevel = this.add.text(width * 0.95, height * 0.05, "B队: 2", { fontSize: FONT_SIZES.large, color: COLORS.textTeamB, fontStyle: 'bold' }).setOrigin(1, 0);
  
  // Add connection status indicator
  connectionStatus = this.add.text(width * 0.02, height * 0.98, '', { 
    fontSize: FONT_SIZES.small, 
    color: COLORS.textInfo 
  }).setOrigin(0, 1);
  this.connectionStatus = connectionStatus;  // Store reference for later use

  // Turn indicator / Status Text (center, slightly lower) - Adjusted styling
  statusText = this.add.text(width / 2, height * 0.4, "等待玩家加入...", { fontSize: FONT_SIZES.xlarge, color: COLORS.textHighlight, align: 'center', fontStyle: 'bold' }).setOrigin(0.5);

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
  const passButtonText = this.add.text(passButtonX + buttonWidth / 2, buttonY, "不要", { fontSize: FONT_SIZES.large, color: COLORS.textPrimary }).setOrigin(0.5);
  passButton = this.add.zone(passButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight).setOrigin(0).setInteractive();
  passButton.setData({ bg: passButtonBg, text: passButtonText, enabled: false }); // Store references and state

  // Play Button
  const playButtonX = width * 0.92 - buttonWidth / 2;
  const playButtonBg = this.add.graphics()
      .fillStyle(COLORS.buttonDisabled) // Start disabled
      .fillRoundedRect(playButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
  const playButtonText = this.add.text(playButtonX + buttonWidth / 2, buttonY, "出牌", { fontSize: FONT_SIZES.large, color: COLORS.textInfo }).setOrigin(0.5); // Start disabled color
  playButton = this.add.zone(playButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight).setOrigin(0).setInteractive();
  playButton.setData({ bg: playButtonBg, text: playButtonText, enabled: false }); // Store references and state

  // Tribute Button (initially hidden)
  const tributeButtonX = width * 0.75 - buttonWidth / 2;
  const tributeButtonBg = this.add.graphics()
      .fillStyle(COLORS.buttonDisabled)
      .fillRoundedRect(tributeButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
  const tributeButtonText = this.add.text(tributeButtonX + buttonWidth / 2, buttonY, "贡牌", { fontSize: FONT_SIZES.medium, color: COLORS.textInfo }).setOrigin(0.5);
  tributeButton = this.add.zone(tributeButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight).setOrigin(0).setInteractive();
  tributeButton.setData({ bg: tributeButtonBg, text: tributeButtonText, enabled: false });
  tributeButton.setVisible(false);

  // Return Tribute Button (initially hidden)
  const returnTributeButtonX = width * 0.68 - buttonWidth / 2;
  const returnTributeButtonBg = this.add.graphics()
      .fillStyle(COLORS.buttonDisabled)
      .fillRoundedRect(returnTributeButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, cornerRadius);
  const returnTributeButtonText = this.add.text(returnTributeButtonX + buttonWidth / 2, buttonY, "还贡", { fontSize: FONT_SIZES.medium, color: COLORS.textInfo }).setOrigin(0.5);
  returnTributeButton = this.add.zone(returnTributeButtonX, buttonY - buttonHeight / 2, buttonWidth, buttonHeight).setOrigin(0).setInteractive();
  returnTributeButton.setData({ bg: returnTributeButtonBg, text: returnTributeButtonText, enabled: false });
  returnTributeButton.setVisible(false);

  // Button Interactions
  [passButton, playButton, tributeButton, returnTributeButton].forEach(button => {
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

  tributeButton.on("pointerdown", () => {
      if (tributeButton.getData('enabled') && selectedCards.length === 1) {
          socket.emit("tribute", { card: selectedCards[0] });
          selectedCards = [];
          updateCardDisplay.call(this);
      }
  });

  returnTributeButton.on("pointerdown", () => {
      if (returnTributeButton.getData('enabled') && selectedCards.length === 1) {
          socket.emit("returnTribute", { card: selectedCards[0] });
          selectedCards = [];
          updateCardDisplay.call(this);
      }
  });
  // --- End Buttons ---


  // Automatically detect server URL (works for both local and production)
  const serverUrl = window.location.origin;
  socket = io(serverUrl, {
    // Connection stability settings
    reconnection: true,          // Enable auto-reconnection
    reconnectionAttempts: 10,    // Try 10 times before giving up
    reconnectionDelay: 1000,     // Start with 1 second delay
    reconnectionDelayMax: 5000,  // Max delay between reconnections
    timeout: 20000,              // Connection timeout (20 seconds)
    
    // Transport settings - prioritize WebSocket
    transports: ['websocket', 'polling'],
    
    // Upgrade from long-polling to WebSocket when possible
    upgrade: true,
    
    // Force new connection (don't reuse existing)
    forceNew: true
  });

  // --- Reconnection Attempt ---
  // TEMPORARY FIX: Clear localStorage to avoid reconnection issues
  localStorage.removeItem('guandanUniquePlayerId');
  console.log("DEBUG: Cleared localStorage, connecting as new player.");
  // --- End Reconnection Attempt ---


  socket.on("assignPlayer", (data) => {
    myId = data.id;
    myPosition = data.position;
    myTeam = data.team;
    uniquePlayerId = data.uniquePlayerId; // Store received unique ID
    // Temporarily disable localStorage to fix reconnection issues
    // localStorage.setItem('guandanUniquePlayerId', uniquePlayerId); // Save to localStorage
    console.log(`Assigned: ID=${myId}, Pos=${myPosition}, Team=${myTeam}, UniqueID=${uniquePlayerId}`);
    
    // Update status to show waiting for other players
    statusText.setText("等待其他玩家加入...").setColor(COLORS.textHighlight);
    
    setupPlayerPositions.call(this);
  });
  socket.on("startRound", (state) => {
    players = state.players || [];
    gamePaused = state.paused || false;
    disconnectedPlayers = {}; // Clear disconnected players list on new round
    console.log('startRound received');
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
    
    // Handle tribute phase state changes
    if (state.tribute && state.tribute.phase === 'return' && state.tribute.tributeTo === myId) {
      statusText.setText("请选择一张牌还贡").setColor(COLORS.textHighlight);
      tributeButton.setVisible(false);
      returnTributeButton.setVisible(true);
      disableButton(returnTributeButton); // Will be enabled when card is selected
      tributeState = state.tribute;
    }
    
    updateGame.call(this, state);
  });
  socket.on("endRound", (data) => endRound.call(this, data));
  socket.on("gameWin", (levels) => {
    statusText.setText(`游戏结束！${levels.A >= 13 ? "A" : "B"}队获胜！`).setColor(COLORS.textHighlight).setFontSize(FONT_SIZES.xxlarge);
    // Optionally disable buttons or show a restart option
  });

  // Handle tribute phase
  socket.on("tributePhase", (state) => {
    tributePhase = true;
    tributeState = state.tribute;
    updateGame.call(this, state);
    
    if (state.tribute.tributeFrom === myId) {
      statusText.setText("请选择一张牌贡牌").setColor(COLORS.textHighlight);
      tributeButton.setVisible(true);
      disableButton(tributeButton); // Will be enabled when card is selected
    } else if (state.tribute.tributeTo === myId) {
      statusText.setText("等待贡牌...").setColor(COLORS.textInfo);
    } else {
      statusText.setText("贡牌阶段进行中...").setColor(COLORS.textInfo);
    }
    
    // Hide normal game buttons during tribute
    playButton.setVisible(false);
    passButton.setVisible(false);
  });

  socket.on("tributeComplete", (data) => {
    tributePhase = false;
    tributeState = null;
    statusText.setText("贡牌完成！游戏开始...").setColor(COLORS.textHighlight);
    
    // Hide tribute buttons
    tributeButton.setVisible(false);
    returnTributeButton.setVisible(false);
    
    // Show normal game buttons
    playButton.setVisible(true);
    passButton.setVisible(true);
  });

  // Error handling
  socket.on("invalidPlay", (message) => {
    statusText.setText(`无效出牌：${message}`).setColor(COLORS.textError);
    // Clear the error message after 3 seconds
    setTimeout(() => {
      if (isMyTurn) {
        statusText.setText("轮到你了").setColor(COLORS.textHighlight);
      } else {
        statusText.setText("等待其他玩家...").setColor(COLORS.textInfo);
      }
    }, 3000);
  });

  socket.on("invalidTribute", (message) => {
    statusText.setText(`无效贡牌：${message}`).setColor(COLORS.textError);
    setTimeout(() => {
      statusText.setText("请选择一张牌贡牌").setColor(COLORS.textHighlight);
    }, 3000);
  });

  socket.on("invalidReturnTribute", (message) => {
    statusText.setText(`无效还贡：${message}`).setColor(COLORS.textError);
    setTimeout(() => {
      statusText.setText("请选择一张牌还贡").setColor(COLORS.textHighlight);
    }, 3000);
  });

  socket.on("gameFull", () => {
    statusText.setText("游戏已满，请稍后再试。").setColor(COLORS.textError);
  });

  socket.on("connect_error", (error) => {
    statusText.setText("连接错误，重试中...").setColor(COLORS.textError);
    console.error("Connection error:", error);
    connectionStatus.setText("⚠️ 连接错误").setColor(COLORS.textError);
  });

  socket.on("disconnect", (reason) => {
    statusText.setText("与服务器断开连接").setColor(COLORS.textError);
    console.log("Disconnected:", reason);
    connectionStatus.setText("🔴 已断开").setColor(COLORS.textError);
  });

  socket.on("reconnect", (attemptNumber) => {
    statusText.setText("已重新连接到服务器").setColor(COLORS.textHighlight);
    console.log("Reconnected after", attemptNumber, "attempts");
    connectionStatus.setText("🟢 已重连").setColor(COLORS.textHighlight);
  });

  socket.on("reconnect_attempt", (attemptNumber) => {
    statusText.setText(`重新连接中... (${attemptNumber})`).setColor(COLORS.textInfo);
    connectionStatus.setText(`🟡 重连中(${attemptNumber})`).setColor(COLORS.textInfo);
  });

  socket.on("reconnect_error", (error) => {
    statusText.setText("重新连接失败").setColor(COLORS.textError);
    console.error("Reconnection error:", error);
    connectionStatus.setText("⚠️ 重连失败").setColor(COLORS.textError);
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
          this.playerTexts[data.position].setText(`位置 ${data.position + 1}: 已移除`).setColor(COLORS.textError);
          if (opponentCards[data.position]) {
              opponentCards[data.position].forEach(c => c.setVisible(false));
          }
      }
      // Server might send gameReset or updateGame
  });

  socket.on("gameReset", (data) => {
      console.log("Game Reset:", data.message);
      statusText.setText("游戏重置中...").setColor(COLORS.textError);
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
      statusText.setText("等待新游戏...").setColor(COLORS.textHighlight);
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
      statusText.setText("连接失败！").setColor(COLORS.textError);
  });
  socket.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
      if (reason !== "io server disconnect") { // Don't show pause if server kicked us (e.g., game full)
          statusText.setText("已断开连接，尝试重新连接...").setColor(COLORS.textError);
          gamePaused = true; // Assume paused state visually on disconnect
          updatePlayButtonStates(); // Disable buttons
      }
  });
  socket.on("connect", () => {
      console.log("Connected successfully.");
      statusText.setText("已连接，等待分配...").setColor(COLORS.textHighlight);
      connectionStatus.setText("🟢 已连接").setColor(COLORS.textHighlight);
      // If we had a uniquePlayerId, try reconnecting again
      if (uniquePlayerId && !myId) { // Check if not already assigned (prevents double emit)
          console.log("Re-attempting reconnect after successful connection.");
          socket.emit('attemptReconnect', { uniquePlayerId });
      }
      
      // Set a timeout to force new player connection if no assignment received
      setTimeout(() => {
          if (!myId) {
              console.log("No assignment received, clearing stored ID and forcing new connection.");
              localStorage.removeItem('guandanUniquePlayerId');
              uniquePlayerId = null;
              // Force server to treat as new player
              socket.emit('forceNewPlayer');
          }
      }, 3000); // 3 second timeout
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
  const cardScale = Math.min(width, height) / 600; // Enhanced scale for better clarity

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
              text.setText(`位置 ${i + 1}: ? 张牌`).setColor(COLORS.textInfo);
          }
      });
  } else {
      // If playerTexts aren't set up yet (e.g., very fast startRound before assignPlayer)
      setupPlayerPositions.call(this);
  }

  
  console.log('DEBUG startRound: myId =', myId);
  console.log('DEBUG startRound: socket.id =', socket.id);
  console.log('DEBUG startRound: state.hands keys =', Object.keys(state.hands || {}));
  
  const hand = state.hands[myId];
  if (!hand) {
    console.error("Hand not found for myId:", myId);
    console.error("Available hands for:", Object.keys(state.hands || {}));
    console.error("Trying socket.id as fallback:", socket.id);
    
    // Try using socket.id as fallback
    const fallbackHand = state.hands[socket.id];
    if (fallbackHand) {
      console.log("Found hand using socket.id, using fallback");
      myId = socket.id; // Update myId to match
      statusText.setText("游戏开始！").setColor(COLORS.textHighlight);
    } else {
      statusText.setText("错误：未收到牌！").setColor(COLORS.textError);
      return;
    }
  }

  const finalHand = state.hands[myId];
  if (!finalHand || finalHand.length === 0) {
    console.error("Hand is empty for myId:", myId);
    statusText.setText("错误：未收到牌！").setColor(COLORS.textError);
    return;
  }

  console.log("Hand found! Length:", finalHand.length);

  // Sort and display hand
  const sortedHand = sortCards(finalHand);
  const totalHandWidth = width * 0.8; // Increase max width for hand display
  const cardWidth = 70 * cardScale;
  const minSpacing = Math.max(cardWidth * 0.3, 20); // Minimum spacing between cards
  const maxSpacing = Math.max(55 * cardScale, 50); // Maximum spacing for fewer cards
  
  // Calculate optimal spacing
  let displaySpacing;
  if (sortedHand.length <= 1) {
    displaySpacing = 0;
  } else {
    const idealSpacing = totalHandWidth / (sortedHand.length - 1);
    displaySpacing = Math.max(minSpacing, Math.min(maxSpacing, idealSpacing));
  }
  
  // Calculate start position to center the hand
  const totalWidth = (sortedHand.length - 1) * displaySpacing + cardWidth;
  const startX = width / 2 - totalWidth / 2;
  
  console.log(`DEBUG: Hand with ${sortedHand.length} cards, spacing: ${displaySpacing.toFixed(1)}px, totalWidth: ${totalWidth.toFixed(1)}px`);

  for (let i = 0; i < sortedHand.length; i++) {
    let card = this.add.sprite(startX + i * displaySpacing, height * 0.85, "cards", sortedHand[i]).setInteractive(); // Lower hand slightly
    card.setScale(cardScale);
    // Phaser 3 handles texture smoothing automatically
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
  const cardScale = Math.min(width, height) / 600; // Enhanced scale for better clarity

  // Ensure player assignment is complete
  if (myId === undefined || myPosition === undefined) {
      console.log("updateGame received before player assignment, waiting...");
      statusText.setText("连接中...").setColor(COLORS.textHighlight);
      return;
  }

  // Update local game state variables
  gamePaused = state.paused || false;
  if (state.players) players = state.players; // Update players array if provided

  // Safety check for essential state data
  if (!players || players.length === 0 || state.currentTurn === undefined || !state.levels) {
      console.warn("updateGame: Incomplete state received:", state);
      // Avoid full update if state is bad, maybe show error
      if (!gamePaused) statusText.setText("等待状态...").setColor(COLORS.textHighlight);
      return;
  }

  // Find the player object for the current turn based on position
  const currentPlayer = players.find(p => p.position === state.currentTurn && !p.disconnected); // Check disconnected status too

  isMyTurn = currentPlayer && currentPlayer.id === myId && state.roundActive && !gamePaused;

  // Update Status Text / Turn Indicator
  if (gamePaused) {
      statusText.setText("游戏暂停").setColor(COLORS.textError).setFontSize(FONT_SIZES.xlarge);
  } else if (!state.roundActive) {
      // Check for win condition first
      if (state.levels.A >= 13 || state.levels.B >= 13) {
          statusText.setText(`游戏结束！${state.levels.A >= 13 ? "A" : "B"}队获胜！`).setColor(COLORS.textHighlight).setFontSize(FONT_SIZES.xxlarge);
      } else {
          statusText.setText("回合结束").setColor(COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
      }
  } else if (currentPlayer) {
      statusText.setText(isMyTurn ? "轮到你了" : `玩家 ${state.currentTurn + 1} 的回合`).setColor(isMyTurn ? COLORS.textHighlight : COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
  } else {
      // Handle case where currentTurn position might not have a player (e.g., after disconnect and before advanceTurn)
      statusText.setText("等待中...").setColor(COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
      console.log(`No active player found at current turn position: ${state.currentTurn}`);
  }

  // Update Team Levels
  this.teamALevel.setText(`A队: ${state.levels.A}`);
  this.teamBLevel.setText(`B队: ${state.levels.B}`);

  // Update table cards with enhanced rendering
  tableCards.forEach(c => c.destroy());
  tableCards = [];
  if (state.table && state.table.length > 0) {
      const tableSpacing = 65 * cardScale; // Enhanced spacing for better visibility
      const tableStartX = width / 2 - (state.table.length - 1) * tableSpacing / 2;
      tableCards = state.table.map((frame, i) => {
          const card = this.add.sprite(tableStartX + i * tableSpacing, height / 2, "cards", frame)
              .setScale(cardScale);
          return card;
      });
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
    const cardScale = Math.min(width, height) / 600; // Enhanced scale for better clarity
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
            textElement.setText(`位置 ${pos + 1}: 已断开`).setColor(COLORS.textError);
            // Keep opponent cards hidden (already cleared)
        } else {
            // Update text for active players
            const playerType = pos === myPosition ? "You" : (player.team === myTeam ? "Teammate" : "Opponent");
            const botIndicator = player.isBot ? " (Bot)" : "";
            textElement.setText(`${playerType}${botIndicator}: ${handCount} 张牌`).setColor(COLORS.textPrimary);

            // Update opponent card backs (if not 'You')
            if (pos !== myPosition) {
                const displayPosIndex = (pos - myPosition + 4) % 4; // Index in positions array relative to 'You'
                const maxVisibleCards = 15; // Move this definition to the top

                const opponentActualHand = hands[player.id];
                let currentDisplayCount = 0;
                let sortedFramesToDisplay = [];

                if (opponentActualHand && opponentActualHand.length > 0) {
                    const sortedOpponentHand = sortCards(opponentActualHand);
                    currentDisplayCount = Math.min(sortedOpponentHand.length, maxVisibleCards);
                    sortedFramesToDisplay = sortedOpponentHand.slice(0, currentDisplayCount);
                } else {
                    // handCount is already 0 from earlier, text will show "0 cards"
                    // currentDisplayCount remains 0, so no cards will be drawn.
                }
                const backCardScale = 0.8 * cardScale; // Make backs slightly smaller but still clear
                const backCardWidth = 70 * backCardScale;
                const backCardHeight = 95 * backCardScale;
                const cardOverlap = 10 * backCardScale; // Adjust overlap for smaller cards

                // Get text bounds for positioning cards relative to text
                const textBounds = textElement.getBounds();
                let groupStartX, groupStartY;

                // --- Revised Opponent Card Positioning ---
                let stackDirection; // 'horizontal' or 'vertical'
                let baseCardX, baseCardY; // Starting position for the first card in the stack, relative to container
                let xIncrement = 0, yIncrement = 0; // How much to move for each subsequent card

                const horizontalStackWidth = currentDisplayCount > 0 ? (currentDisplayCount - 1) * cardOverlap + backCardWidth : 0;
                const verticalStackHeight = currentDisplayCount > 0 ? (currentDisplayCount - 1) * cardOverlap + backCardHeight : 0;

                // Calculate the text's bounding box corners *within the container*
                // textElement.x, .y are its position within the container.
                // textElement.originX, .originY are its origin.
                const textLocalLeft = textElement.x - textElement.width * textElement.originX;
                const textLocalRight = textElement.x + textElement.width * (1 - textElement.originX);
                const textLocalTop = textElement.y - textElement.height * textElement.originY;
                const textLocalBottom = textElement.y + textElement.height * (1 - textElement.originY);
                const textLocalCenterX = textLocalLeft + textElement.width / 2;
                const textLocalCenterY = textLocalTop + textElement.height / 2;

                switch (displayPosIndex) {
                    case 1: // Left Player (cards to the right of text, stack vertically)
                        stackDirection = 'vertical';
                        baseCardX = textLocalRight + cardPadding;
                        baseCardY = textLocalCenterY - verticalStackHeight / 2;
                        xIncrement = 0;
                        yIncrement = cardOverlap;
                        break;
                    case 2: // Top Player (cards below text, stack horizontally)
                        stackDirection = 'horizontal';
                        baseCardX = textLocalCenterX - horizontalStackWidth / 2;
                        baseCardY = textLocalBottom + cardPadding;
                        xIncrement = cardOverlap;
                        yIncrement = 0;
                        break;
                    case 3: // Right Player (cards to the left of text, stack vertically)
                        stackDirection = 'vertical';
                        baseCardX = textLocalLeft - cardPadding - backCardWidth;
                        baseCardY = textLocalCenterY - verticalStackHeight / 2;
                        xIncrement = 0;
                        yIncrement = cardOverlap;
                        break;
                }

                if (currentDisplayCount > 0 && baseCardX !== undefined) { // Ensure it's an opponent and cards to draw
                    for (let i = 0; i < currentDisplayCount; i++) {
                        let cardGlobalX = container.x + baseCardX + i * xIncrement;
                        let cardGlobalY = container.y + baseCardY + i * yIncrement;
                        let cardFrame = sortedFramesToDisplay[i]; // Get the specific card frame

                        let card = this.add.sprite(cardGlobalX, cardGlobalY, "cards", cardFrame) // Use "cards" spritesheet and frame
                            .setScale(backCardScale)
                            .setOrigin(0, 0); // Origin is top-left for these calculations
                        opponentCards[pos].push(card);
                    }
                }
                // --- End Revised Opponent Card Positioning ---
            }
        }
    });

    // Handle empty slots (if player array doesn't have 4 players)
    for (let i = 0; i < 4; i++) {
        if (!currentPlayers.find(p => p.position === i)) {
             if (this.playerTexts[i]) {
                 const textElement = this.playerTexts[i].list[0];
                 textElement.setText(`位置 ${i+1}: 空`).setColor(COLORS.textInfo);
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

// Button helper functions
function enableButton(button) {
  button.setData('enabled', true);
  const color = COLORS.buttonIdle;
  const textColor = COLORS.textPrimary;
  button.getData('bg').clear().fillStyle(color).fillRoundedRect(button.x, button.y, button.width, button.height, 10);
  button.getData('text').setColor(textColor);
}

function disableButton(button) {
  button.setData('enabled', false);
  const color = COLORS.buttonDisabled;
  const textColor = COLORS.textInfo;
  button.getData('bg').clear().fillStyle(color).fillRoundedRect(button.x, button.y, button.width, button.height, 10);
  button.getData('text').setColor(textColor);
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
    const cardScale = Math.min(width, height) / 600; // Enhanced scale for better clarity

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
    if (tributePhase) {
        // During tribute phase, handle tribute buttons
        if (tributeState && tributeState.phase === 'tribute' && tributeState.tributeFrom === myId) {
            const tributeEnabled = selectedCards.length === 1;
            if (tributeEnabled) {
                enableButton(tributeButton);
            } else {
                disableButton(tributeButton);
            }
        }
        
        if (tributeState && tributeState.phase === 'return' && tributeState.tributeTo === myId) {
            const returnEnabled = selectedCards.length === 1;
            returnTributeButton.setVisible(true);
            if (returnEnabled) {
                enableButton(returnTributeButton);
            } else {
                disableButton(returnTributeButton);
            }
        }
        return; // Don't update normal buttons during tribute phase
    }

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
  statusText.setText("回合结束！").setColor(COLORS.textInfo).setFontSize(FONT_SIZES.xlarge);
  // Server will send startRound shortly if game continues
}

function update() {
  // Main update loop (if needed for continuous updates)
}
