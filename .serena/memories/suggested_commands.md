# Suggested Commands

## Development Commands
- `npm start` - Start the game server on http://localhost:3000
- `npm run dev` - Start server with hot reload (recommended for development)
- `npm run dev:clean` - Clean development start
- `npm run kill-port` - Kill processes on port 3000

## Testing Commands
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode

## Code Quality Commands
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues automatically

## Asset Generation
- `python3 scripts/generate_assets.py` - Regenerate all game assets

## Debugging
- `node test_startround.js` - Test startRound event handling
- `node debug_client.js` - Debug client connections
- `node debug_game_state.js` - Debug game state