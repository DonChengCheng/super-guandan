# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm start` - Start the game server on http://localhost:3000
- `npm run dev` - Start server with hot reload (recommended for development)
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues automatically

## Architecture Overview

This is a real-time multiplayer card game (掼蛋/Guandan) built with Node.js/Express + Socket.IO server and Phaser.js client.

### Core Components

- **Server (`server/server.js`)**: Authoritative game state, Socket.IO event handlers, player management
- **Client (`client/main.js`)**: Phaser.js game engine, UI rendering, client-side Socket.IO
- **Assets (`client/assets/`)**: High-quality programmatically generated card spritesheet (108 frames), card back texture, and UI assets
- **Asset Generation (`scripts/generate_assets.py`)**: Python script for regenerating all game assets

### Communication Pattern

All game logic runs server-side with client-server communication via Socket.IO events:

**Key Server Events**: `assignPlayer`, `startRound`, `updateGame`, `endRound`, `playerDisconnected`
**Key Client Events**: `attemptReconnect`, `play`, `pass`

## Game State Architecture

### Server State Management
```javascript
gameState = {
  currentTurn: 0,           // Current player position (0-3)
  table: [],               // Last played cards on table
  hands: {},               // Player ID → card array mapping
  levels: { A: 2, B: 2 },  // Team progression levels
  finishOrder: [],         // Player finish order for scoring
  roundActive: boolean,    // Game round in progress
  paused: boolean          // Paused due to disconnection
}
```

### Player System
- 4 players in fixed positions (0-3) with teams A (0,2) vs B (1,3)
- Unique persistent player IDs for reconnection support
- 30-second reconnection timeout with game pause/resume
- Player state includes: `id`, `position`, `team`, `isBot`, `uniquePlayerId`, `disconnected`

### Card System
- 108-card deck (dual deck), 27 cards per player
- Cards represented as frame indices (0-107) into spritesheet
- Client displays cards using Phaser sprites with sorting and selection
- Complete Guandan rules implemented in `server/gameRules.js`:
  - Card types: single, pair, triple, straight, bombs, etc.
  - Level card mechanics and special rankings
  - Comprehensive hand validation and comparison

## Key Technical Details

### Turn Management
- Position-based turn rotation (0→1→2→3→0)
- Automatic advancement past disconnected players
- Turn validation checks: correct player, round active, not paused

### Client-Server Sync
- Server is authoritative for all game state
- Clients receive state updates via `updateGame` events
- Client UI reflects server state with optimistic updates for selections

### Reconnection System
- Players store `uniquePlayerId` in localStorage
- On reconnect, client sends `attemptReconnect` with stored ID
- Server matches disconnected players and restores session
- Game automatically pauses/resumes based on player connectivity

## Development Notes

### Tribute System
- Automatic tribute requirement detection based on level differences
- Tribute phase with dedicated UI buttons and game flow
- Return tribute mechanism with proper validation
- Game state management for tribute phases

### Development Tools
- **Hot reload**: Use `npm run dev` for development with automatic server restart
- **Testing**: Jest test suite with game rules validation tests in `tests/`
- **Linting**: ESLint with consistent code style rules
- **Logging**: Structured logging system in `server/logger.js`

### Completed Features
- ✅ **Complete card validation**: Full Guandan rules implemented in `server/gameRules.js`
- ✅ **Tribute system**: Tribute and return tribute with proper UI
- ✅ **Error handling**: Comprehensive client/server error feedback
- ✅ **Development tools**: Hot reload, testing, linting setup

### Incomplete Features
- **Bot players**: Framework exists but commented out in server code

### Client Architecture (Phaser.js)
- Responsive design with dynamic scaling
- Scene lifecycle: `preload` → `create` → `update`
- UI state management through Phaser game objects
- Card interaction via click/tap events with selection visual feedback
- Tribute buttons appear/disappear based on game phase

### Error Handling Patterns
- Server validates all moves and emits detailed error messages
- Client shows connection status and handles reconnection attempts
- Game recovery for player timeouts via automatic cleanup
- Structured logging for debugging and monitoring

When working with game logic, remember that the server maintains authoritative state and all game rule validation should happen server-side, with clients only handling UI and user input.

## Asset Management

### High-Quality Game Assets
- **Generated Assets**: All game assets are programmatically generated using Python/Pillow
- **Regeneration**: Run `python3 scripts/generate_assets.py` to regenerate all assets
- **Preview**: View `client/asset_preview.html` to preview all generated assets
- **Documentation**: See `ASSETS.md` for detailed asset documentation

### Asset Structure
```
client/assets/
├── cards.png          # 108-frame card spritesheet (840×635px)
├── card_back.png       # Card back texture (70×95px)
├── play_button.png     # Play button UI asset
├── pass_button.png     # Pass button UI asset
└── tribute_button.png  # Tribute button UI asset
```

### Asset Specifications
- **Card Spritesheet**: 12×9 grid, 70×95px per frame, 108 total frames
- **Card Mapping**: Frames 0-51 (deck 1), 52-103 (deck 2), 104-107 (jokers)
- **High-DPI**: Generated at 2x resolution then scaled for crisp rendering