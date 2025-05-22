# Manual Testing Guide for Player Leaving Scenarios

This guide outlines the steps to manually test various scenarios related to players disconnecting, timing out, and rejoining the game. It assumes the server is running and you can open multiple client browser windows/tabs to simulate multiple players.

**Key things to observe:**
*   **Server Logs:** Keep an eye on the server console for log messages indicating player disconnections, timeouts, event emissions, and game state changes.
*   **Client UI:** Observe the UI on all connected clients. Pay attention to:
    *   Player status indicators (e.g., "Disconnected", "Left Game").
    *   Card displays (hands, table).
    *   Turn indicators and game status messages (e.g., "Game Paused", "Your Turn", "Round Over").
    *   Button states (Play/Pass enabled/disabled).
*   **`RECONNECT_TIMEOUT`:** This is set to 30 seconds in `server.js`. Time your actions accordingly.

---

## Scenario 1: Player disconnects and reconnects within timeout.

**Objective:** Verify that a player can seamlessly rejoin the game if they reconnect before the timeout period expires and that the game state is correctly restored and unpaused.

**Steps:**

1.  **Start Game:** Open 4 browser windows/tabs and connect them to the server to start a game. Ensure all 4 players are in and the game has begun.
2.  **Note Game State:** Observe whose turn it is and the general game state.
3.  **Disconnect Player:** Choose one player (e.g., Player 2). Simulate a disconnection by:
    *   Closing their browser tab/window.
    *   OR, if your browser's dev tools allow, simulate network offline for that tab.
4.  **Observe Other Clients:**
    *   The server should log that Player 2 has disconnected.
    *   Other clients should receive a `playerDisconnected` event.
    *   The UI for Player 2 on other clients should change (e.g., show "Disconnected" status).
    *   The game should pause (`gameState.paused` becomes true). The main status text should indicate "Game Paused".
    *   Server should log "Pausing game."
5.  **Reconnect Player:** Before the 30-second `RECONNECT_TIMEOUT` expires:
    *   Reopen the closed browser tab for Player 2 and navigate to the game URL.
    *   OR, if you simulated network offline, bring the tab back online.
    *   The client will attempt to reconnect using its stored `uniquePlayerId`.
6.  **Observe Reconnection:**
    *   **Server:**
        *   Should log the player's reconnection attempt and successful reconnection.
        *   Should emit `playerReconnected`.
        *   Should emit `updateGame` with the game unpaused (`gameState.paused = false`).
    *   **Player 2's Client (Reconnected):**
        *   Should receive `assignPlayer` and then `updateGame`.
        *   Their hand should be restored.
        *   The game view should match the current state.
    *   **Other Clients:**
        *   Should receive `playerReconnected`.
        *   Should receive `updateGame`.
        *   Player 2's status should return to normal.
        *   The game should unpause, and the turn indicator should be correct. Game play should resume.

**Expected Outcome:**
*   The reconnected player seamlessly rejoins the game with their previous state (hand, position).
*   The game unpauses automatically once all disconnected non-bot players have reconnected.
*   Game play continues from where it left off (or with the correct current turn).

---

## Scenario 2: Player disconnects and times out (permanent removal).

**Objective:** Verify that a player who disconnects and does not rejoin within the timeout is permanently removed from the game, and all clients reflect this change.

**Steps:**

1.  **Start Game:** Open 4 browser windows/tabs and start a game.
2.  **Note Player:** Identify a player to disconnect (e.g., Player 3). Note if they are the `lastPlayerId` to have played cards to the table.
3.  **Disconnect Player:** Close Player 3's browser tab.
4.  **Observe Initial Disconnect:**
    *   Server logs disconnection.
    *   Game pauses. Other clients show Player 3 as "Disconnected".
5.  **Wait for Timeout:** Wait for more than 30 seconds (the `RECONNECT_TIMEOUT`).
6.  **Observe Timeout Process:**
    *   **Server:**
        *   `checkReconnectionTimeout` function should trigger for Player 3.
        *   Server logs should indicate Player 3 is being removed permanently.
        *   Player 3 should be removed from the `players` array in `gameState`.
        *   Player 3's hand should be deleted from `gameState.hands`.
        *   `playerRemoved` event emitted with Player 3's data (`id`, `position`, `uniquePlayerId`).
        *   If Player 3 was `gameState.lastPlayerId`, `gameState.table` should be cleared.
        *   The game should remain active with 3 players (if it was active). `gameState.paused` might become `false` if the timeout logic unpauses, or it might remain paused if `advanceTurn` logic is waiting. The game should adjust based on the remaining players. (The current `checkReconnectionTimeout` logic *does not* automatically unpause if players > 0; it relies on `advanceTurn` or further interaction).
        *   An `updateGame` event is emitted.
    *   **Other Clients (Players 1, 2, 4):**
        *   Receive `playerRemoved` event for Player 3.
        *   Player 3's UI area should update to "Left Game" (or similar).
        *   Any cards representing Player 3 (e.g., card backs for their hand) should be removed.
        *   The main status area might show a temporary message like "Player at position 3 has left."
        *   The game should continue with the remaining 3 players if the turn was advanced correctly. The table should be clear if Player 3 was the last to play.
    *   **Player 3's Client (if tab is reopened *after* timeout):**
        *   Upon connecting, they should *not* be able to rejoin the ongoing game with their old `uniquePlayerId`.
        *   Ideally, they should be treated as a new player if the game has space or shown a message like "You were removed from the game" or "Game not found." (Current server logic will treat them as a new player if there is space).

**Expected Outcome:**
*   Player 3 is permanently removed from the game on the server.
*   All other clients correctly reflect Player 3's removal in their UI.
*   The game continues with the remaining players if possible. The table is cleared if the removed player was the last to play.

---

## Scenario 3: Current player disconnects and times out.

**Objective:** Verify that if the player whose turn it is disconnects and times out, the turn correctly passes to the next active player.

**Steps:**

1.  **Start Game:** Open 4 browser windows/tabs and start a game.
2.  **Identify Current Player:** Wait for a player's turn (e.g., Player 1). Player 1 might play some cards or pass.
3.  **Disconnect Current Player:** Close Player 1's browser tab.
4.  **Observe Initial Disconnect & Pause:**
    *   Game pauses. Other clients show Player 1 as "Disconnected".
    *   Server logs show Player 1 disconnected.
    *   If Player 1 was the current turn, the server *should not* advance the turn immediately on disconnect, but rather when `checkReconnectionTimeout` eventually processes the permanent removal (or if all players reconnect). The `disconnect` handler pauses the game and *may* advance the turn if it was the active player.
        *   *Correction from code review:* The `disconnect` handler *does* advance the turn if the leaving player was current and the game was active. So, the turn *will* advance, and the game will be paused.
5.  **Wait for Timeout:** Wait for > 30 seconds.
6.  **Observe Timeout Process:**
    *   **Server:**
        *   `checkReconnectionTimeout` triggers for Player 1.
        *   Player 1 is removed (hand cleared, `playerRemoved` emitted).
        *   Since Player 1 was the current turn when they disconnected (and the turn was advanced then), `checkReconnectionTimeout` will re-evaluate. If the new current turn player (e.g. Player 2) is still active, game continues.
        *   If Player 1 was `gameState.lastPlayerId`, `gameState.table` is cleared.
        *   `updateGame` is emitted.
    *   **Other Clients:**
        *   Receive `playerRemoved` for Player 1. UI updates to "Left Game".
        *   The game should now clearly show it's the next player's turn (e.g., Player 2).
        *   The game should be unpaused if there are enough players and the logic in `checkReconnectionTimeout` or subsequent `updateGame` allows it. (Current code: `checkReconnectionTimeout` does not explicitly unpause unless a game reset occurs. The game remains paused from the initial disconnect).
        *   If `gameState.table` was cleared, Player 2 should see an empty table.

**Expected Outcome:**
*   Player 1 is removed.
*   The turn correctly advanced to the next active player (Player 2) when Player 1 initially disconnected.
*   After Player 1 times out, the game state reflects their permanent removal.
*   The game should be playable by Player 2. The game should ideally unpause if it's playable. (This might require a slight logic adjustment if the expectation is for it to auto-unpause after timeout if players >= 4).
    *   *Note on current implementation:* The game will remain paused from the initial disconnect. A reconnected player unpauses it, or a game reset. Manual unpausing isn't a feature.

---

## Scenario 4: Game ends due to insufficient players after a timeout.

**Objective:** Verify that if a player's timeout results in fewer than the minimum required players (e.g., < 4), the game round ends and resets.

**Steps:**

1.  **Start Game:** Open 4 browser windows/tabs and start a game.
2.  **Disconnect One Player:** Choose one player (e.g., Player 4) and close their browser tab.
3.  **Wait for Timeout:** Wait for > 30 seconds for Player 4 to time out.
4.  **Observe Timeout and Game End:**
    *   **Server:**
        *   `checkReconnectionTimeout` triggers for Player 4. Player 4 is removed.
        *   The server now detects only 3 players remaining.
        *   The server should log that the game cannot continue and is resetting.
        *   `gameState.roundActive` should be set to `false`.
        *   `gameState.paused` should be set to `false`.
        *   A `gameReset` event (or similar, like `endRound` then `gameReset`) should be emitted. The `checkReconnectionTimeout` function directly emits `gameReset` if `<4` players.
    *   **Remaining Clients (Players 1, 2, 3):**
        *   Receive `playerRemoved` for Player 4. UI updates.
        *   Subsequently, receive `gameReset` (or `updateGame` reflecting `roundActive: false`).
        *   The UI should indicate the round/game has ended (e.g., "Game Reset: Not enough players", "Waiting for new game...").
        *   Table should be cleared, hands may be cleared or irrelevant.
        *   Players might be put back into a lobby state or see a message to wait for more players for a new game.

**Expected Outcome:**
*   After Player 4 times out, the server detects insufficient players.
*   The current round is terminated, and `gameState.roundActive` becomes `false`.
*   A `gameReset` event is emitted.
*   Clients display a message indicating the game has reset due to insufficient players and are ready for a new game to start (potentially after more players join, though the current server logic would just idle until a manual restart or new connections form a full game).

---

This guide should help in thoroughly testing the player leaving and reconnection logic. Remember to check both server logs and client UIs for comprehensive verification.
