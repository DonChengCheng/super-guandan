const { 
  getCardInfo, 
  isLevelCard, 
  getCardSortValue, 
  getHandType, 
  compareHands, 
  isValidPlay,
  HAND_TYPES 
} = require('../server/gameRules');

describe('Game Rules', () => {
  describe('getCardInfo', () => {
    test('should correctly identify regular cards', () => {
      const card = getCardInfo(0); // 2 of spades
      expect(card.rank).toBe(2);
      expect(card.suit).toBe('spades');
      expect(card.isJoker).toBe(false);
    });

    test('should correctly identify jokers', () => {
      const blackJoker = getCardInfo(104);
      expect(blackJoker.rank).toBe(14);
      expect(blackJoker.isJoker).toBe(true);
      expect(blackJoker.isBlackJoker).toBe(true);

      const redJoker = getCardInfo(105);
      expect(redJoker.rank).toBe(15);
      expect(redJoker.isJoker).toBe(true);
      expect(redJoker.isRedJoker).toBe(true);
    });
  });

  describe('isLevelCard', () => {
    test('should identify level cards correctly', () => {
      expect(isLevelCard(0, 2)).toBe(true); // 2 of spades when level is 2
      expect(isLevelCard(4, 3)).toBe(true); // 3 of spades when level is 3
      expect(isLevelCard(104, 2)).toBe(false); // Jokers are not level cards
    });
  });

  describe('getHandType', () => {
    test('should identify single cards', () => {
      const hand = getHandType([0], 2); // 2 of spades, level 2
      expect(hand.type).toBe(HAND_TYPES.SINGLE);
      expect(hand.length).toBe(1);
    });

    test('should identify pairs', () => {
      const hand = getHandType([0, 1], 3); // Two 2s, level 3
      expect(hand.type).toBe(HAND_TYPES.PAIR);
      expect(hand.length).toBe(2);
    });

    test('should identify triples', () => {
      const hand = getHandType([0, 1, 2], 4); // Three 2s, level 4
      expect(hand.type).toBe(HAND_TYPES.TRIPLE);
      expect(hand.length).toBe(3);
    });

    test('should identify bombs', () => {
      const hand = getHandType([0, 1, 2, 3], 5); // Four 2s, level 5
      expect(hand.type).toBe(HAND_TYPES.BOMB);
      expect(hand.bombLevel).toBe(4);
    });

    test('should identify triple with pair', () => {
      const hand = getHandType([0, 1, 2, 4, 5], 6); // Three 2s + Two 3s, level 6
      expect(hand.type).toBe(HAND_TYPES.TRIPLE_PAIR);
      expect(hand.length).toBe(5);
    });

    test('should return null for invalid combinations', () => {
      const hand = getHandType([0, 4], 2); // 2 and 3, not a pair
      expect(hand).toBeNull();
    });
  });

  describe('compareHands', () => {
    test('should allow bombs to beat non-bombs', () => {
      const bomb = getHandType([0, 1, 2, 3], 5); // Four 2s
      const pair = getHandType([4, 5], 5); // Pair of 3s
      expect(compareHands(bomb, pair)).toBe(true);
    });

    test('should not allow non-bombs to beat bombs', () => {
      const pair = getHandType([4, 5], 5); // Pair of 3s
      const bomb = getHandType([0, 1, 2, 3], 5); // Four 2s
      expect(compareHands(pair, bomb)).toBe(false);
    });

    test('should compare same type hands by rank', () => {
      const lowPair = getHandType([4, 5], 5); // Pair of 3s
      const highPair = getHandType([8, 9], 5); // Pair of 4s
      expect(compareHands(highPair, lowPair)).toBe(true);
      expect(compareHands(lowPair, highPair)).toBe(false);
    });
  });

  describe('isValidPlay', () => {
    const testHand = [0, 1, 4, 5, 8, 9]; // 2,2,3,3,4,4
    
    test('should allow any valid play on empty table', () => {
      expect(isValidPlay([0, 1], testHand, [], 5)).toBe(true);
    });

    test('should reject if player doesn\'t have the cards', () => {
      expect(isValidPlay([20, 21], testHand, [], 5)).toBe(false);
    });

    test('should reject invalid hand types', () => {
      expect(isValidPlay([0, 4], testHand, [], 5)).toBe(false); // Not a pair
    });

    test('should allow stronger hands of same type', () => {
      const tableHand = [0, 1]; // Pair of 2s
      expect(isValidPlay([4, 5], testHand, tableHand, 5)).toBe(true); // Pair of 3s beats pair of 2s
    });
  });
});