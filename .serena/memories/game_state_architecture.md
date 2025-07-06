# Game State Architecture

## Server State Management
```javascript
gameState = {
  currentTurn: 0,           // Current player position (0-3)
  table: [],               // Last played cards on table
  hands: {},               // Player ID → card array mapping
  levels: { A: 2, B: 2 },  // Team progression levels
  finishOrder: [],         // Player finish order for scoring
  roundActive: boolean,    // Game round in progress
  paused: boolean,         // Paused due to disconnection
  tribute: {               // Tribute system state
    required: false,
    phase: 'none',
    tributeCards: {},
    returnCards: {},
    tributeFrom: null,
    tributeTo: null
  }
}
```

## Player System
- 4 players in fixed positions (0-3)
- Teams A (0,2) vs B (1,3)
- Unique persistent player IDs for reconnection
- Player state: `{id, position, team, isBot, uniquePlayerId, disconnected, disconnectTime}`

## Card System
- 108-card deck represented as frame indices (0-107)
- 27 cards per player
- Complete Guandan rules in `server/gameRules.js`