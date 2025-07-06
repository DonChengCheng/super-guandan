// Simple logging utility
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LOG_COLORS = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[36m',  // Cyan
  DEBUG: '\x1b[90m', // Gray
  RESET: '\x1b[0m'   // Reset
};

class Logger {
  constructor(level = 'INFO') {
    this.level = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const color = LOG_COLORS[level];
    const reset = LOG_COLORS.RESET;

    let formattedMessage = `${color}[${timestamp}] ${level}: ${message}${reset}`;

    if (data) {
      formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
    }

    return formattedMessage;
  }

  error(message, data = null) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.error(this.formatMessage('ERROR', message, data));
    }
  }

  warn(message, data = null) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.warn(this.formatMessage('WARN', message, data));
    }
  }

  info(message, data = null) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log(this.formatMessage('INFO', message, data));
    }
  }

  debug(message, data = null) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log(this.formatMessage('DEBUG', message, data));
    }
  }

  game(message, data = null) {
    // Special logging for game events
    this.info(`GAME: ${message}`, data);
  }

  player(playerId, message, data = null) {
    // Special logging for player events
    this.info(`PLAYER[${playerId}]: ${message}`, data);
  }
}

module.exports = new Logger(process.env.LOG_LEVEL || 'INFO');
