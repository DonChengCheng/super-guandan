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
let playButton, socket, myId, myPosition, myTeam;
let isMyTurn = false;
let players = [];
let gamePaused = false; // Add state for paused game
let disconnectedPlayers = {}; // Track disconnected players by position
let statusText; // Add a variable for general status messages

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

  // Center table (scaled to fit)
  this.add.rectangle(width / 2, height / 2, width * 0.4, height * 0.5, 0x006400);

  // Team levels (top corners)
  this.teamALevel = this.add.text(width * 0.05, height * 0.05, "Team A: 2", { fontSize: "24px", color: "#00f" });
  this.teamBLevel = this.add.text(width * 0.95, height * 0.05, "Team B: 2", { fontSize: "24px", color: "#f00" }).setOrigin(1, 0);

  // Turn indicator / Status Text (center, above table)
  // Use a single text object for turn indication and status messages
  statusText = this.add.text(width / 2, height * 0.4, "Waiting for players...", { fontSize: "32px", color: "#ff0", align: 'center' }).setOrigin(0.5);

  // Analytics (bottom-left)
  analyticsText = this.add.text(width * 0.05, height * 0.15, "Plays: 0\nErrors: 0\nAvg Turn: 0s", { fontSize: "20px", color: "#fff" });

  // Pass and Play buttons (bottom-right)
  const passButton = this.add.text(width * 0.85, height * 0.9, "Pass", { fontSize: "24px", color: "#fff" }).setInteractive();
  playButton = this.add.text(width * 0.92, height * 0.9, "Play", { fontSize: "24px", color: "#ccc" }).setInteractive();

  passButton.on("pointerdown", () => {
    // Add check for gamePaused
    if (isMyTurn && !gamePaused) {
        socket.emit("pass");
    }
  });
  playButton.on("pointerdown", () => {
    // Add check for gamePaused
    if (isMyTurn && !gamePaused && selectedCards.length) {
        playCards.call(this);
    }
  });
  passButton.on("pointerover", () => passButton.setStyle({ color: "#ff0" }));
  passButton.on("pointerout", () => passButton.setStyle({ color: "#fff" }));
  playButton.on("pointerover", () => playButton.setStyle({ color: selectedCards.length ? "#ff0" : "#ccc" }));
  playButton.on("pointerout", () => playButton.setStyle({ color: selectedCards.length ? "#fff" : "#ccc" }));

  socket = io("http://localhost:3000");
  socket.on("assignPlayer", (data) => {
    myId = data.id;
    myPosition = data.position;
    myTeam = data.team;
    setupPlayerPositions.call(this);
  });
  socket.on("startRound", (state) => {
    players = state.players || [];
    gamePaused = state.paused || false; // Reset paused state
    disconnectedPlayers = {}; // Clear disconnected players list
    console.log('startRound', state);
    // Clear any persistent status messages from previous round/disconnects
    if (this.disconnectMessage) {
        this.disconnectMessage.destroy();
        this.disconnectMessage = null;
    }
    startRound.call(this, state);
    // Update player texts immediately after starting round
    updatePlayerTexts.call(this, state.hands);
  });
  socket.on("updateGame", (state) => {
    players = state.players || players; // Update player list if provided
    gamePaused = state.paused || false; // Update paused state
    updateGame.call(this, state);
  });
  socket.on("endRound", (data) => endRound.call(this, data));
  socket.on("gameWin", (levels) => {
    this.add.text(width / 2, height / 2, `Team ${levels.A >= 13 ? "A" : "B"} Wins!`, { fontSize: "48px", color: "#ff0" }).setOrigin(0.5);
  });
  socket.on("playerLeft", (data) => {
    // Store disconnected player info
    disconnectedPlayers[data.position] = true;
    console.log(`Player left at position: ${data.position}`);

    // Update the specific player's text
    if (this.playerTexts && this.playerTexts[data.position]) {
        this.playerTexts[data.position].setText(`Position ${data.position + 1}: Disconnected`).setColor("#f00");
        // Optionally hide their cards immediately
        if (opponentCards[data.position]) {
            opponentCards[data.position].forEach(c => c.setVisible(false));
        }
    }

    // Display a general message if needed, but rely on updateGame for paused state
    // Example: Add a temporary message (optional)
    // if (!this.disconnectMessage) {
    //     this.disconnectMessage = this.add.text(width / 2, height / 2, "A player disconnected.", { fontSize: "32px", color: "#f00" }).setOrigin(0.5).setDepth(10);
    //     // Optional: Auto-remove message after a delay
    //     this.time.delayedCall(3000, () => {
    //         if (this.disconnectMessage) this.disconnectMessage.destroy();
    //         this.disconnectMessage = null;
    //     });
    // }
    // Note: The main "Game Paused" logic is handled in updateGame based on the state flag
  });
  socket.on("invalidPlay", (msg) => {
    this.add.text(width / 2, height * 0.6, msg, { fontSize: "24px", color: "#f00" }).setOrigin(0.5).setDepth(10);
  });
  socket.on("analyticsUpdate", (data) => {
    analyticsText.setText(`Plays: ${data.playCount}\nErrors: ${data.errorCount}\nAvg Turn: ${(data.avgTurnTime / 1000).toFixed(1)}s`);
  });
}

function setupPlayerPositions() {
  const width = this.game.config.width;
  const height = this.game.config.height;

  const positions = [
    { x: width / 2, y: height * 0.9, text: "You" }, // Bottom (Player 0)
    { x: width * 0.05, y: height / 2, text: "Opponent" }, // Left (Player 1)
    { x: width / 2, y: height * 0.1, text: myPosition % 2 === 0 ? "Teammate" : "Opponent" }, // Top (Player 2)
    { x: width * 0.95, y: height / 2, text: "Opponent" }, // Right (Player 3)
  ];

  this.playerTexts = positions.map((pos, i) => {
    const text = this.add.text(pos.x, pos.y - (i === 0 ? -height * 0.05 : height * 0.05), `${pos.text}: 0`, { fontSize: "20px", color: "#fff" }).setOrigin(0.5);
    if (i === 1) {
      text.setAngle(-90);
    } else if (i === 2) {
      text.setAngle(180);
    } else if (i === 3) {
      text.setAngle(90);
    }
    return text;
  });
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
  const cardScale = Math.min(width, height) / 720;

  // Clear any previous status text related to pausing or disconnection
  statusText.setText("").setColor("#ff0"); // Reset status text

  playerHand.forEach(c => c.destroy());
  playerHand = [];
  tableCards.forEach(c => c.destroy());
  tableCards = [];
  opponentCards.forEach(cards => cards.forEach(c => c.destroy()));
  opponentCards = [[], [], [], []];

  // Reset player text visuals
  if (this.playerTexts) {
      this.playerTexts.forEach((text, i) => {
          // Reset text content and color (will be updated by updatePlayerTexts)
          text.setText(`Position ${i + 1}: ?`).setColor("#fff");
          // Ensure opponent cards area is ready (will be populated by updateGame)
          if (opponentCards[i]) opponentCards[i] = [];
      });
  }

  const hand = state.hands[myId];
  if (!hand) {
    console.error("Hand not found for myId:", myId);
    return;
  }

  // Sort the hand
  const sortedHand = sortCards(hand);
  const handWidth = Math.min(40, (width * 0.7) / (sortedHand.length - 1));
  for (let i = 0; i < sortedHand.length; i++) {
    let card = this.add.sprite(width * 0.25 + i * handWidth, height * 0.9, "cards", sortedHand[i]).setInteractive();
    card.setScale(1.2 * cardScale);
    card.on("pointerdown", () => selectCard.call(this, card));
    card.on("pointerover", () => {
      if (selectedCards.indexOf(card) === -1) { // Only apply hover tint if not selected
        card.setTint(0xcccccc);
      }
    });
    card.on("pointerout", () => {
      if (selectedCards.indexOf(card) === -1) { // Only clear tint if not selected
        card.clearTint();
      }
    });
    playerHand.push(card);
  }

  // Call updateGame immediately to set initial turn indicator and opponent cards
  updateGame.call(this, state);
}

function updateGame(state) {
  const width = this.game.config.width;
  const height = this.game.config.height;
  const cardScale = Math.min(width, height) / 720;

  // Update paused state based on received state
  gamePaused = state.paused || false;

  if (!players || players.length === 0 || state.currentTurn === undefined) {
    console.warn("Players or currentTurn not ready:", players, state.currentTurn);
    isMyTurn = false;
    statusText.setText("Waiting for players...").setColor("#ff0");
    return;
  }

  // Find the player object for the current turn based on position
  const currentPlayer = players.find(p => p.position === state.currentTurn);

  isMyTurn = currentPlayer && currentPlayer.id === myId && state.roundActive && !gamePaused;

  // Update Status Text / Turn Indicator
  if (gamePaused) {
      statusText.setText("Game Paused - Player Disconnected").setColor("#f00");
  } else if (!state.roundActive) {
      statusText.setText("Round Over").setColor("#fff"); // Or specific end round message
  } else if (currentPlayer) {
      statusText.setText(isMyTurn ? "Your Turn" : `Player ${state.currentTurn + 1}'s Turn`).setColor(isMyTurn ? "#0f0" : "#ff0");
  } else {
      // Handle case where currentTurn position might not have a player (e.g., after disconnect)
      statusText.setText("Waiting...").setColor("#ff0");
      console.log(`No player found at current turn position: ${state.currentTurn}`);
  }

  this.teamALevel.setText(`Team A: ${state.levels.A}`);
  this.teamBLevel.setText(`Team B: ${state.levels.B}`);

  // Update table cards
  tableCards.forEach(c => c.destroy());
  tableCards = state.table.map((frame, i) =>
    this.add.sprite(width / 2 + i * 80 - (state.table.length - 1) * 40, height / 2, "cards", frame).setScale(cardScale)
  );

  // Update player texts and opponent card backs
  updatePlayerTexts.call(this, state.hands); // Use helper function

  // Update Play/Pass button states based on turn and paused status
  updatePlayButton();
  passButton.setStyle({ color: isMyTurn && !gamePaused ? "#fff" : "#ccc" });
}

// Helper function to update player texts and opponent cards
function updatePlayerTexts(hands) {
    const width = this.game.config.width;
    const height = this.game.config.height;
    const cardScale = Math.min(width, height) / 720;

    if (!this.playerTexts) return; // Guard against calls before setup

    players.forEach(player => {
        const pos = player.position;
        const handCount = hands[player.id]?.length ?? 0; // Get hand count safely

        if (disconnectedPlayers[pos]) {
            // Keep disconnected status if player left
            this.playerTexts[pos].setText(`Position ${pos + 1}: Disconnected`).setColor("#f00");
            if (opponentCards[pos]) {
                opponentCards[pos].forEach(c => c.setVisible(false)); // Ensure cards are hidden
            }
        } else {
            // Update text for active players
            const playerType = pos === myPosition ? "You" : (player.team === myTeam ? "Teammate" : "Opponent");
            const botIndicator = player.isBot ? " (Bot)" : ""; // Add bot indicator
            this.playerTexts[pos].setText(`${playerType}${botIndicator}: ${handCount}`).setColor("#fff"); // Reset color

            // Update opponent card backs
            if (pos !== myPosition) {
                opponentCards[pos].forEach(c => c.destroy()); // Clear old cards
                opponentCards[pos] = [];
                const offset = pos === 1 || pos === 3 ? height / 2 : height * 0.1;
                const isVertical = pos === 1 || pos === 3;
                // Adjust spacing based on card count to prevent excessive overlap
                const maxVisibleCards = 15; // Limit visible back cards for performance/clarity
                const displayCount = Math.min(handCount, maxVisibleCards);
                const totalSpan = isVertical ? height * 0.5 : width * 0.4; // Available space
                const spacing = displayCount > 1 ? Math.min(20, totalSpan / (displayCount - 1)) : 0;

                for (let i = 0; i < displayCount; i++) {
                    let card = this.add.sprite(
                        pos === 1 ? width * 0.05 : pos === 3 ? width * 0.95 : width / 2 + i * spacing - (displayCount - 1) * spacing / 2,
                        isVertical ? offset + i * spacing - (displayCount - 1) * spacing / 2 : offset,
                        "card_back"
                    ).setScale(0.8 * cardScale);
                    if (isVertical) card.setAngle(90);
                    opponentCards[pos].push(card);
                }
            }
        }
    });

    // Ensure texts for positions without players (if any) are cleared or handled
    for (let i = 0; i < 4; i++) {
        if (!players.find(p => p.position === i) && !disconnectedPlayers[i]) {
             if (this.playerTexts[i]) this.playerTexts[i].setText(`Position ${i+1}: Empty`).setColor("#888");
             if (opponentCards[i]) {
                 opponentCards[i].forEach(c => c.destroy());
                 opponentCards[i] = [];
             }
        }
    }
}

function selectCard(card) {
  const index = selectedCards.indexOf(card);
  if (index === -1) {
    console.log("Selecting card:", card.frame.name);
    selectedCards.push(card);
    card.setTint(0x00ffff);
    
  } else {
    console.log("Deselecting card:", card.frame.name);
    selectedCards.splice(index, 1);
    card.clearTint();
  
  }
  updatePlayButton();
}

function playCards() {
  const cards = selectedCards.map(c => c.frame.name);
  socket.emit("play", { cards });
  selectedCards.forEach(c => c.clearTint());
  selectedCards = [];
  updatePlayButton();
}

function updatePlayButton() {
  // Enable play button only if it's my turn, game is not paused, and cards are selected
  const enabled = isMyTurn && !gamePaused && selectedCards.length > 0;
  playButton.setStyle({ color: enabled ? "#fff" : "#ccc" });
}

function endRound(data) {
  const width = this.game.config.width;
  const height = this.game.config.height;
  this.add.text(width / 2, height / 2, `Round Over\n${data.message}`, { fontSize: "32px", color: "#fff" }).setOrigin(0.5);
}

function update() {

}
