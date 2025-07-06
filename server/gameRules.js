// 掼蛋游戏规则模块
// 包含牌型识别、验证和比较逻辑

// 牌型常量
const HAND_TYPES = {
  SINGLE: 'single',           // 单牌
  PAIR: 'pair',              // 对子
  TRIPLE: 'triple',          // 三张
  TRIPLE_PAIR: 'triple_pair', // 三带二
  STRAIGHT: 'straight',       // 顺子
  PAIR_STRAIGHT: 'pair_straight', // 连对
  TRIPLE_STRAIGHT: 'triple_straight', // 飞机
  PLATE: 'plate',            // 钢板（三连对）
  BOMB: 'bomb',              // 炸弹
  JOKER_BOMB: 'joker_bomb'   // 同花顺或王炸
};

// 获取卡牌信息
function getCardInfo(frame) {
  if (frame >= 104) {
    // 大小王
    return {
      rank: frame === 104 ? 14 : 15, // 小王14，大王15
      suit: 'joker',
      isJoker: true,
      isRedJoker: frame === 105,
      isBlackJoker: frame === 104
    };
  }

  const rank = Math.floor(frame / 4) + 2; // 2-14 (A=14)
  const suit = ['spades', 'hearts', 'diamonds', 'clubs'][frame % 4];

  return {
    rank,
    suit,
    isJoker: false,
    isRedJoker: false,
    isBlackJoker: false
  };
}

// 检查是否为级牌
function isLevelCard(frame, level) {
  const cardInfo = getCardInfo(frame);
  if (cardInfo.isJoker) return false;
  return cardInfo.rank === level;
}

// 获取卡牌实际排序值（考虑级牌）
function getCardSortValue(frame, level) {
  const cardInfo = getCardInfo(frame);

  if (cardInfo.isJoker) {
    return cardInfo.isBlackJoker ? 100 : 101; // 小王100，大王101
  }

  if (cardInfo.rank === level) {
    return 99; // 级牌排在王之前
  }

  // A特殊处理：A在级牌为A时是级牌，否则是最大的非级牌
  if (cardInfo.rank === 14 && level !== 14) {
    return 98; // A排在级牌之前
  }

  return cardInfo.rank;
}

// 识别牌型
function getHandType(cards, level) {
  if (!cards || cards.length === 0) return null;

  const cardInfos = cards.map(frame => ({
    frame,
    ...getCardInfo(frame),
    sortValue: getCardSortValue(frame, level)
  }));

  // 按排序值排序
  cardInfos.sort((a, b) => a.sortValue - b.sortValue);

  const length = cards.length;

  // 检查单牌
  if (length === 1) {
    return {
      type: HAND_TYPES.SINGLE,
      rank: cardInfos[0].sortValue,
      cards: cards,
      length: 1
    };
  }

  // 检查对子
  if (length === 2) {
    if (cardInfos[0].sortValue === cardInfos[1].sortValue) {
      return {
        type: HAND_TYPES.PAIR,
        rank: cardInfos[0].sortValue,
        cards: cards,
        length: 2
      };
    }
    return null; // 不是有效牌型
  }

  // 检查三张
  if (length === 3) {
    if (cardInfos[0].sortValue === cardInfos[1].sortValue &&
        cardInfos[1].sortValue === cardInfos[2].sortValue) {
      return {
        type: HAND_TYPES.TRIPLE,
        rank: cardInfos[0].sortValue,
        cards: cards,
        length: 3
      };
    }
    return null;
  }

  // 检查炸弹（4张或以上相同）
  if (length >= 4) {
    const allSame = cardInfos.every(card => card.sortValue === cardInfos[0].sortValue);
    if (allSame) {
      return {
        type: HAND_TYPES.BOMB,
        rank: cardInfos[0].sortValue,
        cards: cards,
        length: length,
        bombLevel: length // 炸弹等级
      };
    }
  }

  // 检查三带二
  if (length === 5) {
    const counts = {};
    cardInfos.forEach(card => {
      counts[card.sortValue] = (counts[card.sortValue] || 0) + 1;
    });

    const countValues = Object.values(counts).sort((a, b) => b - a);
    if (countValues[0] === 3 && countValues[1] === 2) {
      const tripleRank = Object.keys(counts).find(rank => counts[rank] === 3);
      return {
        type: HAND_TYPES.TRIPLE_PAIR,
        rank: parseInt(tripleRank),
        cards: cards,
        length: 5
      };
    }
  }

  // 检查顺子（5张或以上连续）
  if (length >= 5) {
    const straightResult = checkStraight(cardInfos, level);
    if (straightResult) return straightResult;
  }

  // 检查连对（3对或以上连续对子）
  if (length >= 6 && length % 2 === 0) {
    const pairStraightResult = checkPairStraight(cardInfos, level);
    if (pairStraightResult) return pairStraightResult;
  }

  // 检查飞机（2个或以上连续三张）
  if (length >= 6 && length % 3 === 0) {
    const tripleStraightResult = checkTripleStraight(cardInfos, level);
    if (tripleStraightResult) return tripleStraightResult;
  }

  // 检查钢板（3连对，即3个连续对子）
  if (length === 6) {
    const plateResult = checkPlate(cardInfos, level);
    if (plateResult) return plateResult;
  }

  return null; // 不是有效牌型
}

// 检查顺子
function checkStraight(cardInfos, level) {
  // 顺子不能包含2、级牌、王
  const validCards = cardInfos.filter(card =>
    !card.isJoker &&
    card.rank !== 2 &&
    card.rank !== level
  );

  if (validCards.length !== cardInfos.length) return null;

  // 检查是否连续
  for (let i = 1; i < validCards.length; i++) {
    if (validCards[i].sortValue !== validCards[i - 1].sortValue + 1) {
      return null;
    }
  }

  return {
    type: HAND_TYPES.STRAIGHT,
    rank: validCards[validCards.length - 1].sortValue,
    cards: cardInfos.map(c => c.frame),
    length: cardInfos.length
  };
}

// 检查连对
function checkPairStraight(cardInfos, level) {
  if (cardInfos.length % 2 !== 0) return null;

  const pairs = [];
  for (let i = 0; i < cardInfos.length; i += 2) {
    if (cardInfos[i].sortValue !== cardInfos[i + 1].sortValue) {
      return null; // 不是对子
    }
    pairs.push(cardInfos[i].sortValue);
  }

  // 检查对子是否连续
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i] !== pairs[i - 1] + 1) {
      return null;
    }
  }

  // 连对不能包含2、级牌、王
  if (pairs.some(rank => rank === 2 || rank === level || rank >= 100)) {
    return null;
  }

  return {
    type: HAND_TYPES.PAIR_STRAIGHT,
    rank: pairs[pairs.length - 1],
    cards: cardInfos.map(c => c.frame),
    length: cardInfos.length
  };
}

// 检查飞机
function checkTripleStraight(cardInfos, level) {
  if (cardInfos.length % 3 !== 0) return null;

  const triples = [];
  for (let i = 0; i < cardInfos.length; i += 3) {
    if (cardInfos[i].sortValue !== cardInfos[i + 1].sortValue ||
        cardInfos[i + 1].sortValue !== cardInfos[i + 2].sortValue) {
      return null; // 不是三张
    }
    triples.push(cardInfos[i].sortValue);
  }

  // 检查三张是否连续
  for (let i = 1; i < triples.length; i++) {
    if (triples[i] !== triples[i - 1] + 1) {
      return null;
    }
  }

  // 飞机不能包含2、级牌、王
  if (triples.some(rank => rank === 2 || rank === level || rank >= 100)) {
    return null;
  }

  return {
    type: HAND_TYPES.TRIPLE_STRAIGHT,
    rank: triples[triples.length - 1],
    cards: cardInfos.map(c => c.frame),
    length: cardInfos.length
  };
}

// 检查钢板
function checkPlate(cardInfos, level) {
  if (cardInfos.length !== 6) return null;

  const pairStraightResult = checkPairStraight(cardInfos, level);
  if (pairStraightResult && pairStraightResult.length === 6) {
    return {
      ...pairStraightResult,
      type: HAND_TYPES.PLATE
    };
  }

  return null;
}

// 比较两个牌型
function compareHands(playedHand, tableHand) {
  if (!playedHand || !tableHand) return false;

  // 炸弹可以打任何非炸弹牌型
  if (playedHand.type === HAND_TYPES.BOMB && tableHand.type !== HAND_TYPES.BOMB) {
    return true;
  }

  // 非炸弹不能打炸弹
  if (playedHand.type !== HAND_TYPES.BOMB && tableHand.type === HAND_TYPES.BOMB) {
    return false;
  }

  // 炸弹对炸弹：比较炸弹等级，然后比较rank
  if (playedHand.type === HAND_TYPES.BOMB && tableHand.type === HAND_TYPES.BOMB) {
    if (playedHand.bombLevel !== tableHand.bombLevel) {
      return playedHand.bombLevel > tableHand.bombLevel;
    }
    return playedHand.rank > tableHand.rank;
  }

  // 相同牌型：比较长度和rank
  if (playedHand.type === tableHand.type) {
    if (playedHand.length !== tableHand.length) {
      return false; // 长度必须相同
    }
    return playedHand.rank > tableHand.rank;
  }

  return false; // 不同牌型不能比较
}

// 主验证函数
function isValidPlay(cards, hand, table, level) {
  console.log(`Validating play: Cards=${JSON.stringify(cards)}, Hand length=${hand?.length}, Table length=${table?.length}, Level=${level}`);

  // 基本检查
  if (!cards || cards.length === 0) {
    console.log('Validation Fail: No cards played');
    return false;
  }

  if (!hand || !cards.every(c => hand.includes(c))) {
    console.log('Validation Fail: Player doesn\'t have the cards');
    return false;
  }

  // 获取出牌牌型
  const playedHand = getHandType(cards, level);
  if (!playedHand) {
    console.log('Validation Fail: Invalid hand type');
    return false;
  }

  console.log(`Played hand type: ${playedHand.type}, rank: ${playedHand.rank}`);

  // 如果桌面为空，任何有效牌型都可以出
  if (!table || table.length === 0) {
    console.log('Validation Pass: Table empty, valid hand type');
    return true;
  }

  // 获取桌面牌型
  const tableHand = getHandType(table, level);
  if (!tableHand) {
    console.log('Validation Pass: Table hand invalid, allowing play');
    return true;
  }

  console.log(`Table hand type: ${tableHand.type}, rank: ${tableHand.rank}`);

  // 比较牌型
  const canPlay = compareHands(playedHand, tableHand);
  console.log(`Can play: ${canPlay}`);

  return canPlay;
}

module.exports = {
  HAND_TYPES,
  getCardInfo,
  isLevelCard,
  getCardSortValue,
  getHandType,
  compareHands,
  isValidPlay
};
