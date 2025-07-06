# Super Guandan - Project Overview

## Purpose
Real-time multiplayer card game (掼蛋/Guandan) built with Node.js/Express server and Phaser.js client.

## Tech Stack
- **Server**: Node.js, Express, Socket.IO
- **Client**: Phaser.js, Socket.IO client
- **Testing**: Jest, Supertest
- **Development**: Nodemon for hot reload
- **Linting**: ESLint

## Architecture
- Authoritative server-side game state
- Real-time Socket.IO communication
- 4-player positions (0-3) with teams A (0,2) vs B (1,3)
- 108-card deck (dual deck), 27 cards per player
- Comprehensive Guandan rules in `server/gameRules.js`