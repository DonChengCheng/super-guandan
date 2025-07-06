# Coding Conventions

## Style Guidelines
- ESLint configuration in `.eslintrc.js`
- Consistent naming conventions
- Server-side authoritative game logic
- Client-side UI and user input handling only

## Code Organization
- Server logic in `server/server.js`
- Game rules in `server/gameRules.js`
- Client logic in `client/main.js`
- Assets in `client/assets/`

## Communication Pattern
- Socket.IO events for client-server communication
- Server validates all moves and game state
- Client receives state updates and reflects them in UI
- Error handling with structured logging

## Testing Approach
- Jest for unit tests
- Separate test files for different components
- Game rules validation tests