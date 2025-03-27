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

  // Turn indicator (center, above table)
  this.turnIndicator = this.add.text(width / 2, height * 0.4, "", { fontSize: "32px", color: "#ff0" }).setOrigin(0.5);

  // Analytics (bottom-left)
  analyticsText = this.add.text(width * 0.05, height * 0.15, "Plays: 0\nErrors: 0\nAvg Turn: 0s", { fontSize: "20px", color: "#fff" });

  // Pass and Play buttons (bottom-right)
  const passButton = this.add.text(width * 0.85, height * 0.95, "Pass", { fontSize: "24px", color: "#fff" }).setInteractive();
  playButton = this.add.text(width * 0.92, height * 0.95, "Play", { fontSize: "24px", color: "#ccc" }).setInteractive();

  passButton.on("pointerdown", () => { if (isMyTurn) socket.emit("pass"); });
  playButton.on("pointerdown", () => { if (isMyTurn && selectedCards.length) playCards.call(this); });
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
    startRound.call(this, state);
  });
  socket.on("updateGame", (state) => {
    players = state.players || players;
    updateGame.call(this, state);
  });
  socket.on("endRound", (data) => endRound.call(this, data));
  socket.on("gameWin", (levels) => {
    this.add.text(width / 2, height / 2, `Team ${levels.A >= 13 ? "A" : "B"} Wins!`, { fontSize: "48px", color: "#ff0" }).setOrigin(0.5);
  });
  socket.on("playerLeft", () => {
    this.add.text(width / 2, height / 2, "Player Disconnected", { fontSize: "48px", color: "#f00" }).setOrigin(0.5);
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

function startRound(state) {
  const width = this.game.config.width;
  const height = this.game.config.height;
  const cardScale = Math.min(width, height) / 720; // Scale relative to original 720px height

  playerHand.forEach(c => c.destroy());
  playerHand = [];
  tableCards.forEach(c => c.destroy());
  tableCards = [];
  opponentCards.forEach(cards => cards.forEach(c => c.destroy()));
  opponentCards = [[], [], [], []];

  const hand = state.hands[myId];
  if (!hand) {
    console.error("Hand not found for myId:", myId);
    return;
  }
  const handWidth = Math.min(40, (width * 0.7) / (hand.length - 1));
  for (let i = 0; i < hand.length; i++) {
    let card = this.add.sprite(width * 0.25 + i * handWidth, height * 0.9, "cards", hand[i]).setInteractive();
    card.setScale(1.2 * cardScale);
    card.on("pointerdown", () => selectCard.call(this, card));
    card.on("pointerover", () => card.setTint(0xcccccc));
    card.on("pointerout", () => card.clearTint());
    playerHand.push(card);
  }
  updateGame.call(this, state);
}

function updateGame(state) {
  const width = this.game.config.width;
  const height = this.game.config.height;
  const cardScale = Math.min(width, height) / 720;

  if (!players || !players[state.currentTurn]) {
    console.warn("Players or currentTurn not ready:", players, state.currentTurn);
    isMyTurn = false;
    this.turnIndicator.setText("Waiting for players...");
    return;
  }

  isMyTurn = players[state.currentTurn].id === myId && state.roundActive;
  this.turnIndicator.setText(isMyTurn ? "Your Turn" : `Player ${state.currentTurn + 1}'s Turn`);
  this.teamALevel.setText(`Team A: ${state.levels.A}`);
  this.teamBLevel.setText(`Team B: ${state.levels.B}`);

  tableCards.forEach(c => c.destroy());
  tableCards = state.table.map((frame, i) => 
    this.add.sprite(width / 2 + i * 80 - (state.table.length - 1) * 40, height / 2, "cards", frame).setScale(cardScale)
  );

  Object.entries(state.hands).forEach(([id, hand]) => {
    const pos = players.find(p => p.id === id)?.position;
    if (pos !== undefined) {
      this.playerTexts[pos].setText(`${pos === myPosition ? "You" : pos % 2 === myPosition % 2 ? "Teammate" : "Opponent"}: ${hand.length}`);
      if (pos !== myPosition) {
        opponentCards[pos].forEach(c => c.destroy());
        opponentCards[pos] = [];
        const offset = pos === 1 || pos === 3 ? height / 2 : height * 0.1;
        const isVertical = pos === 1 || pos === 3;
        const spacing = Math.min(20, (height * 0.5) / (hand.length - 1));
        for (let i = 0; i < hand.length; i++) {
          let card = this.add.sprite(
            pos === 1 ? width * 0.05 : pos === 3 ? width * 0.95 : width / 2 + i * spacing - (hand.length - 1) * spacing / 2,
            isVertical ? offset + i * spacing - (hand.length - 1) * spacing / 2 : offset,
            "card_back"
          ).setScale(0.8 * cardScale);
          if (isVertical) card.setAngle(90);
          opponentCards[pos].push(card);
        }
      }
    }
  });
}

function selectCard(card) {
  const index = selectedCards.indexOf(card);
  if (index === -1) {
    selectedCards.push(card);
    card.setTint(0xffff00);
  } else {
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
  playButton.setStyle({ color: selectedCards.length ? "#fff" : "#ccc" });
}

function endRound(data) {
  const width = this.game.config.width;
  const height = this.game.config.height;
  this.add.text(width / 2, height / 2, `Round Over\n${data.message}`, { fontSize: "32px", color: "#fff" }).setOrigin(0.5);
}


function update() {

}
