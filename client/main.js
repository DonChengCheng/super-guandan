const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  scene: { preload, create, update },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
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
  // Table
  this.add.rectangle(640, 360, 500, 400, 0x006400);

  // UI Elements
  this.teamALevel = this.add.text(50, 50, "Team A: 2", {
    fontSize: "24px",
    color: "#00f",
  });
  this.teamBLevel = this.add
    .text(1230, 50, "Team B: 2", { fontSize: "24px", color: "#f00" })
    .setOrigin(1, 0);
  this.turnIndicator = this.add
    .text(640, 300, "", { fontSize: "32px", color: "#ff0" })
    .setOrigin(0.5);

  const passButton = this.add
    .text(1050, 680, "Pass", {
      fontSize: "24px",
      color: "#fff",
      backgroundColor: "#333",
      padding: { x: 10, y: 5 },
    })
    .setInteractive();
  playButton = this.add
    .text(1150, 680, "Play", {
      fontSize: "24px",
      color: "#ccc",
      backgroundColor: "#333",
      padding: { x: 10, y: 5 },
    })
    .setInteractive();

  passButton.on("pointerdown", () => {
    if (isMyTurn) socket.emit("pass");
  });
  playButton.on("pointerdown", () => {
    if (isMyTurn && selectedCards.length) playCards.call(this);
  });
  passButton.on("pointerover", () => passButton.setStyle({ color: "#ff0" }));
  passButton.on("pointerout", () => passButton.setStyle({ color: "#fff" }));
  playButton.on("pointerover", () =>
    playButton.setStyle({ color: selectedCards.length ? "#ff0" : "#ccc" })
  );
  playButton.on("pointerout", () =>
    playButton.setStyle({ color: selectedCards.length ? "#fff" : "#ccc" })
  );

  // Socket.IO Connection
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
    players = state.players || players; // Update if sent, otherwise keep existing
    updateGame.call(this, state);
  });
  socket.on("endRound", (data) => endRound.call(this, data));
  socket.on("gameWin", (levels) =>
    this.add
      .text(
        640,
        360,
        `${myTeam === "A" && levels.A >= 13 ? "You Win!" : "Team B Wins!"}`,
        { fontSize: "48px", color: "#fff" }
      )
      .setOrigin(0.5)
  );
  socket.on("playerLeft", () =>
    this.add
      .text(640, 360, "A player disconnected", {
        fontSize: "32px",
        color: "#f00",
      })
      .setOrigin(0.5)
  );
  socket.on("gameFull", () => alert("Game is full!"));
}

function setupPlayerPositions() {
  const positions = [
    { x: 640, y: 650, text: "You" }, // Bottom (0)
    { x: 50, y: 360, text: "Opponent" }, // Left (1)
    { x: 640, y: 50, text: myPosition % 2 === 0 ? "Teammate" : "Opponent" }, // Top (2)
    { x: 1230, y: 360, text: "Opponent" }, // Right (3)
  ];
  this.playerTexts = positions.map((pos, i) => {
    const text = this.add
      .text(pos.x, pos.y - (i === 0 ? -40 : 40), `${pos.text}: 0`, {
        fontSize: "20px",
        color: "#fff",
      })
      .setOrigin(0.5);
    // Rotate text based on position
    if (i === 1) {
      // Left (Player 1)
      text.setAngle(-90); // Vertical, top-to-bottom
    } else if (i === 2) {
      // Top (Player 2)
      text.setAngle(180); // Upside-down
    } else if (i === 3) {
      // Right (Player 3)
      text.setAngle(90); // Vertical, bottom-to-top
    }
    return text;
  });
}

function startRound(state) {
  playerHand.forEach((c) => c.destroy());
  playerHand = [];
  tableCards.forEach((c) => c.destroy());
  tableCards = [];
  opponentCards.forEach((cards) => cards.forEach((c) => c.destroy()));
  opponentCards = [[], [], [], []];

  const hand = state.hands[myId];
  if (!hand) {
    console.error("Hand not found for myId:", myId);
    return;
  }
  const handWidth = Math.min(40, 980 / (hand.length - 1));
  for (let i = 0; i < hand.length; i++) {
    let card = this.add
      .sprite(300 + i * handWidth, 650, "cards", hand[i])
      .setInteractive();
    card.setScale(1.2);
    card.on("pointerdown", () => selectCard.call(this, card));
    card.on("pointerover", () => card.setTint(0xcccccc));
    card.on("pointerout", () => card.clearTint());
    playerHand.push(card);
  }
  updateGame.call(this, state);
}

function updateGame(state) {
  // Safety check for players and currentTurn
  if (!players || !players[state.currentTurn]) {
    console.warn(
      "Players or currentTurn not ready:",
      players,
      state.currentTurn
    );
    isMyTurn = false;
    this.turnIndicator.setText("Waiting for players...");
    return;
  }

  isMyTurn = players[state.currentTurn].id === myId && state.roundActive;
  this.turnIndicator.setText(
    isMyTurn ? "Your Turn" : `Player ${state.currentTurn + 1}'s Turn`
  );
  this.teamALevel.setText(`Team A: ${state.levels.A}`);
  this.teamBLevel.setText(`Team B: ${state.levels.B}`);

  tableCards.forEach((c) => c.destroy());
  tableCards = state.table.map((frame, i) =>
    this.add.sprite(
      640 + i * 80 - (state.table.length - 1) * 40,
      360,
      "cards",
      frame
    )
  );

  Object.entries(state.hands).forEach(([id, hand]) => {
    const pos = players.find((p) => p.id === id)?.position;
    if (pos !== undefined) {
      this.playerTexts[pos].setText(
        `${
          pos === myPosition
            ? "You"
            : pos % 2 === myPosition % 2
            ? "Teammate"
            : "Opponent"
        }: ${hand.length}`
      );
      if (pos !== myPosition) {
        opponentCards[pos].forEach((c) => c.destroy());
        opponentCards[pos] = [];
        const offset = pos === 1 || pos === 3 ? 360 : 50;
        const isVertical = pos === 1 || pos === 3;
        const spacing = Math.min(20, 400 / (hand.length - 1));
        for (let i = 0; i < hand.length; i++) {
          let card = this.add
            .sprite(
              pos === 1
                ? 100
                : pos === 3
                ? 1180
                : 640 + i * spacing - ((hand.length - 1) * spacing) / 2,
              isVertical
                ? offset + i * spacing - ((hand.length - 1) * spacing) / 2
                : offset,
              "card_back"
            )
            .setScale(0.8);
          if (isVertical) card.setAngle(90);
          opponentCards[pos].push(card);
        }
      }
    }
  });
}

function selectCard(card) {
  if (!isMyTurn) return;
  const index = selectedCards.indexOf(card);
  if (index === -1) {
    card.y -= 30;
    selectedCards.push(card);
  } else {
    card.y += 30;
    selectedCards.splice(index, 1);
  }
  updatePlayButton();
}

function playCards() {
  socket.emit("play", { cards: selectedCards.map((c) => c.frame.name) });
  selectedCards = [];
  updatePlayButton();
}

function updatePlayButton() {
  playButton.setStyle({ color: selectedCards.length > 0 ? "#fff" : "#ccc" });
}

function endRound(data) {
  const orderText = data.finishOrder
    .map((id) => `P${players.find((p) => p.id === id).position + 1}`)
    .join(", ");
  this.add
    .text(640, 400, `Finish: ${orderText}`, { fontSize: "24px", color: "#fff" })
    .setOrigin(0.5);
}

function update() {
  if (isMyTurn)
    this.turnIndicator.setAlpha(Math.sin(this.time.now * 0.002) * 0.3 + 0.7);
}
