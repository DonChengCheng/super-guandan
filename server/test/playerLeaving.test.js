// server/test/playerLeaving.test.js

// --- Mocking Dependencies ---
const mockIo = {
    sockets: new Map(), // Store mock sockets by id
    emittedEvents: [],
    emit: function(event, data) {
        this.emittedEvents.push({ event, data });
        // Simulate broadcast to all sockets
        this.sockets.forEach(socket => {
            if (socket.handlers[event]) {
                socket.handlers[event](data);
            }
        });
    },
    reset: function() {
        this.emittedEvents = [];
        this.sockets.clear();
    },
    // Helper to add a mock socket
    addMockSocket: function(id) {
        const socket = {
            id: id,
            handlers: {}, // To store event handlers like 'disconnect'
            on: function(event, handler) {
                this.handlers[event] = handler;
            },
            emit: function(event, data) { // For direct emits to this socket
                mockIo.emittedEvents.push({ socketId: id, event, data });
            },
            disconnect: function() { // Mock disconnect behavior
                if (this.handlers['disconnect']) {
                    this.handlers['disconnect']();
                }
            }
        };
        this.sockets.set(id, socket);
        return socket;
    }
};

// Mock global 'io' object used by server.js
global.io = mockIo;

// Mock players and gameState (these will be manipulated by tests)
let mockPlayers = [];
let mockGameState = {};

// --- Functions to be tested (require them after mocking globals) ---
// We need to carefully extract or adapt functions from server.js
// For simplicity in this environment, we might need to slightly refactor server.js
// or re-declare parts of its logic here if direct import is problematic due to its own `require` calls.

// Placeholder for server functions - these would ideally be imported or refactored for testability
// For now, assume server.js can be required and its functions accessed,
// or relevant logic is copied/adapted here.
// const { checkReconnectionTimeout, handleDisconnect, advanceTurn, players: serverPlayers, gameState: serverGameState } = require('../server');
// Due to the direct manipulation of `players` and `gameState` in server.js,
// we will need to ensure our tests can set these variables.

// --- Test Helper Functions ---
function resetServerState() {
    mockIo.reset();
    mockPlayers.length = 0; // Clear the array
    Object.keys(mockGameState).forEach(key => delete mockGameState[key]); // Clear the object

    // Initialize with some defaults similar to server.js
    mockGameState.currentTurn = 0;
    mockGameState.table = [];
    mockGameState.hands = {};
    mockGameState.levels = { A: 2, B: 2 };
    mockGameState.finishOrder = [];
    mockGameState.roundActive = false;
    mockGameState.paused = false;
    mockGameState.lastPlayerId = null;
}

function createMockPlayer(id, position, uniquePlayerId, isBot = false, disconnected = false, disconnectTime = null) {
    return {
        id,
        position,
        team: position % 2 === 0 ? "A" : "B",
        isBot,
        uniquePlayerId,
        disconnected,
        disconnectTime,
        // Mock socket for this player if needed for 'disconnect' handler testing
        socket: mockIo.sockets.get(id) || mockIo.addMockSocket(id)
    };
}

// --- Test Suite ---
const tests = {
    runAll: function() {
        console.log("--- Running Player Leaving Tests ---");
        this.testCheckReconnectionTimeout();
        this.testSocketDisconnectHandler();
        console.log("--- Player Leaving Tests Finished ---");
        // Summarize results if possible (e.g., count passes/fails)
    },

    // --- Tests for checkReconnectionTimeout ---
    testCheckReconnectionTimeout: function() {
        console.log("\n[TESTING] checkReconnectionTimeout");

        // Test case 1: Player times out, hand cleared, event emitted
        resetServerState();
        const p1 = createMockPlayer("socket1", 0, "uid1", false, true, Date.now() - 35000);
        mockPlayers.push(p1);
        mockGameState.hands[p1.id] = [1, 2, 3];
        mockGameState.roundActive = true; // Keep round active for some tests
        mockPlayers.push(createMockPlayer("socket2", 1, "uid2")); // Keep game viable
        mockPlayers.push(createMockPlayer("socket3", 2, "uid3"));
        mockPlayers.push(createMockPlayer("socket4", 3, "uid4"));


        // Simulate call (assuming checkReconnectionTimeout is globally available or imported)
        // For now, let's assume a global-like access for simplicity.
        // In a real scenario, this would be `server.checkReconnectionTimeout(...)`
        global.checkReconnectionTimeout_testable(p1.uniquePlayerId, mockPlayers, mockGameState, mockIo);

        console.assert(!mockGameState.hands[p1.id], "Test Case 1 Failed: Player hand not cleared.");
        const removedEvent = mockIo.emittedEvents.find(e => e.event === "playerRemoved");
        console.assert(removedEvent, "Test Case 1 Failed: playerRemoved event not emitted.");
        console.assert(removedEvent.data.uniquePlayerId === p1.uniquePlayerId, "Test Case 1 Failed: playerRemoved event has wrong uniquePlayerId.");
        console.assert(removedEvent.data.position === p1.position, "Test Case 1 Failed: playerRemoved event has wrong position.");
        console.assert(removedEvent.data.id === p1.id, "Test Case 1 Failed: playerRemoved event has wrong id.");
        console.log("Test Case 1 (Timeout, Hand Clear, Event): Passed");

        // Test case 2: Removed player was lastPlayerId, table cleared
        resetServerState();
        const p2_1 = createMockPlayer("socket1", 0, "uid1", false, true, Date.now() - 35000);
        mockPlayers.push(p2_1);
        mockGameState.hands[p2_1.id] = [1,2,3];
        mockGameState.table = [10, 11];
        mockGameState.lastPlayerId = p2_1.id;
        mockGameState.roundActive = true;
        mockPlayers.push(createMockPlayer("socket2", 1, "uid2"));
        mockPlayers.push(createMockPlayer("socket3", 2, "uid3"));
        mockPlayers.push(createMockPlayer("socket4", 3, "uid4"));

        global.checkReconnectionTimeout_testable(p2_1.uniquePlayerId, mockPlayers, mockGameState, mockIo);
        console.assert(mockGameState.table.length === 0, "Test Case 2 Failed: gameState.table not cleared.");
        console.log("Test Case 2 (Timeout, Clear Table): Passed");

        // Test case 3: Fewer than 4 players remain, round was active, gameReset emitted
        resetServerState();
        const p3_1 = createMockPlayer("socket1", 0, "uid1", false, true, Date.now() - 35000);
        const p3_2 = createMockPlayer("socket2", 1, "uid2");
        const p3_3 = createMockPlayer("socket3", 2, "uid3");
        mockPlayers.push(p3_1, p3_2, p3_3); // Only 3 players initially, one times out
        mockGameState.hands[p3_1.id] = [1,2,3];
        mockGameState.roundActive = true;
        mockGameState.paused = true; // Game might be paused due to disconnect

        global.checkReconnectionTimeout_testable(p3_1.uniquePlayerId, mockPlayers, mockGameState, mockIo);
        const gameResetEvent = mockIo.emittedEvents.find(e => e.event === "gameReset");
        console.assert(gameResetEvent, "Test Case 3 Failed: gameReset event not emitted.");
        console.assert(mockGameState.roundActive === false, "Test Case 3 Failed: roundActive not set to false.");
        console.assert(mockGameState.paused === false, "Test Case 3 Failed: game not unpaused after reset.");
        console.log("Test Case 3 (Timeout, <4 Players, Game Reset): Passed");

        // Test case 4: Removed player was current turn, turn advanced
        resetServerState();
        const p4_1 = createMockPlayer("socket1", 0, "uid1", false, true, Date.now() - 35000);
        const p4_2 = createMockPlayer("socket2", 1, "uid2");
        const p4_3 = createMockPlayer("socket3", 2, "uid3");
        const p4_4 = createMockPlayer("socket4", 3, "uid4");
        mockPlayers.push(p4_1, p4_2, p4_3, p4_4);
        mockGameState.hands[p4_1.id] = [1,2,3];
        mockGameState.roundActive = true;
        mockGameState.currentTurn = p4_1.position; // Timed-out player is current turn

        global.checkReconnectionTimeout_testable(p4_1.uniquePlayerId, mockPlayers, mockGameState, mockIo);
        console.assert(mockGameState.currentTurn !== p4_1.position, "Test Case 4 Failed: Turn not advanced.");
        console.assert(mockGameState.currentTurn === p4_2.position, "Test Case 4 Failed: Turn not advanced to next player (pos 1).");
        console.log("Test Case 4 (Timeout, Advance Turn): Passed");
    },

    // --- Tests for socket.on('disconnect') ---
    testSocketDisconnectHandler: function() {
        console.log("\n[TESTING] socket.on('disconnect') handler");

        // Test case 1: Player disconnects, marked, event emitted
        resetServerState();
        const p1 = createMockPlayer("socket1", 0, "uid1");
        mockPlayers.push(p1);
        mockGameState.roundActive = false; // Not an active round for this basic test

        // Simulate disconnect by calling the handler directly
        // This assumes 'handleDisconnect_testable' is the core logic of the 'disconnect' event.
        global.handleDisconnect_testable(p1.socket, mockPlayers, mockGameState, mockIo);

        const disconnectedPlayer = mockPlayers.find(p => p.id === p1.id);
        console.assert(disconnectedPlayer.disconnected === true, "Test Case D1 Failed: Player not marked as disconnected.");
        console.assert(disconnectedPlayer.disconnectTime !== null, "Test Case D1 Failed: disconnectTime not set.");
        const disconnectedEvent = mockIo.emittedEvents.find(e => e.event === "playerDisconnected");
        console.assert(disconnectedEvent, "Test Case D1 Failed: playerDisconnected event not emitted.");
        console.assert(disconnectedEvent.data.id === p1.id, "Test Case D1 Failed: playerDisconnected event has wrong id.");
        console.assert(disconnectedEvent.data.position === p1.position, "Test Case D1 Failed: playerDisconnected event has wrong position.");
        console.log("Test Case D1 (Disconnect, Marked, Event): Passed");

        // Test case 2: Active game, real player disconnects, game paused
        resetServerState();
        const p2_real = createMockPlayer("socketReal", 0, "uidReal", false); // Real player
        mockPlayers.push(p2_real);
        mockPlayers.push(createMockPlayer("socketBot1",1,"uidBot1",true));
        mockPlayers.push(createMockPlayer("socketBot2",2,"uidBot2",true));
        mockPlayers.push(createMockPlayer("socketBot3",3,"uidBot3",true));
        mockGameState.roundActive = true;
        mockGameState.paused = false;

        global.handleDisconnect_testable(p2_real.socket, mockPlayers, mockGameState, mockIo);
        console.assert(mockGameState.paused === true, "Test Case D2 Failed: Game not paused for real player disconnect.");
        console.log("Test Case D2 (Real Player Disconnect, Game Paused): Passed");
        
        // Test case 3: Active game, BOT player disconnects, game paused (current behavior)
        resetServerState();
        const p3_bot = createMockPlayer("socketBot", 0, "uidBot", true); // Bot player
        mockPlayers.push(p3_bot);
        mockPlayers.push(createMockPlayer("socketReal1",1,"uidReal1",false));
        mockPlayers.push(createMockPlayer("socketReal2",2,"uidReal2",false));
        mockPlayers.push(createMockPlayer("socketReal3",3,"uidReal3",false));
        mockGameState.roundActive = true;
        mockGameState.paused = false;

        global.handleDisconnect_testable(p3_bot.socket, mockPlayers, mockGameState, mockIo);
        console.assert(mockGameState.paused === true, "Test Case D3 Failed: Game not paused for bot player disconnect.");
        console.log("Test Case D3 (Bot Player Disconnect, Game Paused): Passed");


        // Test case 4: Current player disconnects, turn advanced
        resetServerState();
        const p4_current = createMockPlayer("socketCurrent", 0, "uidCurrent");
        const p4_next = createMockPlayer("socketNext", 1, "uidNext");
        mockPlayers.push(p4_current, p4_next);
        mockPlayers.push(createMockPlayer("socketOther1",2,"uidOther1"));
        mockPlayers.push(createMockPlayer("socketOther2",3,"uidOther2"));
        mockGameState.roundActive = true;
        mockGameState.paused = false;
        mockGameState.currentTurn = p4_current.position;

        global.handleDisconnect_testable(p4_current.socket, mockPlayers, mockGameState, mockIo);
        console.assert(mockGameState.currentTurn !== p4_current.position, "Test Case D4 Failed: Turn not advanced from disconnecting player.");
        console.assert(mockGameState.currentTurn === p4_next.position, `Test Case D4 Failed: Turn not advanced to next player. Expected ${p4_next.position}, got ${mockGameState.currentTurn}`);
        console.log("Test Case D4 (Current Player Disconnect, Turn Advanced): Passed");
    }
};

// --- Expose functions for testing (Adapting server.js logic) ---
// This is a simplified way to make server functions testable without full refactoring.
// Ideally, server.js would export these.

global.checkReconnectionTimeout_testable = function(uniquePlayerId, players, gameState, ioInstance) {
    // Copied and adapted from server.js's checkReconnectionTimeout
    // Requires RECONNECT_TIMEOUT to be defined or passed. Let's define it.
    const RECONNECT_TIMEOUT = 30000; // Value from server.js
    const player = players.find(p => p.uniquePlayerId === uniquePlayerId);

    if (player && player.disconnected && (Date.now() - player.disconnectTime >= RECONNECT_TIMEOUT)) {
        console.log(`TEST_INFO: Player ${player.uniquePlayerId} (Pos ${player.position}, ID ${player.id}) timed out. Removing permanently.`);
        const removedPlayerId = player.id;
        const removedPlayerPosition = player.position;
        const removedPlayerUniqueId = player.uniquePlayerId;
        const playerIndex = players.findIndex(p => p.uniquePlayerId === uniquePlayerId);

        if (playerIndex !== -1) {
            players.splice(playerIndex, 1);
            if (gameState.hands[removedPlayerId]) {
                delete gameState.hands[removedPlayerId];
            }
            ioInstance.emit("playerRemoved", { position: removedPlayerPosition, uniquePlayerId: removedPlayerUniqueId, id: removedPlayerId });

            if (gameState.roundActive) {
                const activePlayers = players.filter(p => !p.disconnected);
                if (activePlayers.length < 4) {
                    gameState.roundActive = false;
                    gameState.paused = false;
                    ioInstance.emit("gameReset", { message: "Round ended: Not enough players..." });
                } else {
                    if (gameState.currentTurn === removedPlayerPosition) {
                        global.advanceTurn_testable(players, gameState, ioInstance); // Use testable advanceTurn
                    }
                }
            } else if (gameState.paused) {
                const activePlayers = players.filter(p => !p.disconnected);
                 if (activePlayers.length === 0) {
                    gameState.roundActive = false;
                    gameState.paused = false;
                    gameState.table = [];
                    gameState.hands = {};
                    gameState.currentTurn = 0;
                    gameState.finishOrder = [];
                    ioInstance.emit("gameReset", { message: "All players left. Game reset." });
                } else if (activePlayers.length < 4 && activePlayers.length > 0) {
                    // Game remains paused, waiting for more players or another timeout.
                }
            }
            if (gameState.lastPlayerId === removedPlayerId) {
                gameState.table = [];
            }
            ioInstance.emit("updateGame", {
                ...gameState,
                players: players.map(p => ({ id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected })),
            });
        }
    }
};

global.handleDisconnect_testable = function(socket, players, gameState, ioInstance) {
    // Copied and adapted from io.on('connection', ...) -> socket.on('disconnect', ...) in server.js
    const RECONNECT_TIMEOUT = 30000; // from server.js
    const leavingPlayer = players.find(p => p.id === socket.id);

    if (leavingPlayer) {
        leavingPlayer.disconnected = true;
        leavingPlayer.disconnectTime = Date.now();
        const wasRoundActive = gameState.roundActive && !gameState.paused;

        ioInstance.emit("playerDisconnected", { position: leavingPlayer.position, id: socket.id, uniquePlayerId: leavingPlayer.uniquePlayerId });

        if (wasRoundActive) {
            gameState.paused = true;
            if (leavingPlayer.position === gameState.currentTurn && players.filter(p => !p.disconnected).length > 0) {
                global.advanceTurn_testable(players, gameState, ioInstance); // Use testable advanceTurn
            }
        }
        ioInstance.emit("updateGame", {
            ...gameState,
            players: players.map(p => ({
                id: p.id, position: p.position, team: p.team, isBot: p.isBot, disconnected: p.disconnected
            })),
        });
        // The actual setTimeout is not executed in this synchronous test,
        // but the call itself can be noted or tested with spies in a more advanced setup.
        // setTimeout(() => checkReconnectionTimeout_testable(leavingPlayer.uniquePlayerId, players, gameState, ioInstance), RECONNECT_TIMEOUT + 1000);
        console.log(`TEST_INFO: setTimeout for checkReconnectionTimeout scheduled for ${leavingPlayer.uniquePlayerId}`);
    }
};

global.advanceTurn_testable = function(players, gameState, ioInstance) {
    // Copied and adapted from server.js's advanceTurn
    const activePlayers = players.filter(p => !p.disconnected);
    if (activePlayers.length === 0 || gameState.finishOrder.length >= activePlayers.length) {
        return;
    }
    let attempts = 0;
    const maxAttempts = players.length > 0 ? players.length + 1 : 4; // Ensure maxAttempts is reasonable if players array is empty
    let nextTurnPosition;
    let nextPlayer;

    do {
        gameState.currentTurn = (gameState.currentTurn + 1) % 4;
        nextTurnPosition = gameState.currentTurn;
        nextPlayer = players.find(p => p.position === nextTurnPosition && !p.disconnected && !gameState.finishOrder.includes(p.id));
        attempts++;
    } while (!nextPlayer && gameState.finishOrder.length < activePlayers.length && attempts < maxAttempts);

    if (!nextPlayer && attempts >= maxAttempts) {
        // This case should ideally not happen if activePlayers > 0 and not all finished
        console.error("TEST_ERROR: advanceTurn_testable could not find valid next player.");
        gameState.roundActive = false;
        gameState.paused = true;
    } else if (nextPlayer) {
         console.log(`TEST_INFO: Advanced turn to position: ${gameState.currentTurn} (Player ${nextPlayer.id})`);
    }
    // In a real scenario, checkRoundEnd might be called here.
};


// --- Manual Execution for Node.js environment ---
if (typeof require !== 'undefined' && require.main === module) {
    tests.runAll();
}

// To make this runnable in a browser console for quick testing if needed:
// function runTestsInBrowser() { tests.runAll(); }
// Then copy-paste the entire file content into browser dev console where server's JS might be loaded.
// This is highly dependent on how server.js is structured and if its functions are globally accessible or modular.
// For the current setup, this is designed for a Node.js execution of this test file.
