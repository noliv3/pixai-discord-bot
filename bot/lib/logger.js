const fs = require('fs');
const path = require('path');

const LEVELS = ['error', 'warn', 'info', 'debug'];

function timestamp() {
  return new Date().toISOString();
}

function normalizeLevel(level) {
  if (!level) return 'info';
  const idx = LEVELS.indexOf(String(level).toLowerCase());
  return idx === -1 ? 'info' : LEVELS[idx];
}

module.exports = function createLogger(options = {}) {
  const logLevel = normalizeLevel(options.level);
  const logDir = options.directory || path.join(__dirname, '..', 'data', 'logs');
  const logFile = options.file || 'bot.log';

  fs.mkdirSync(logDir, { recursive: true });

  const filePath = path.join(logDir, logFile);

  function shouldLog(level) {
    return LEVELS.indexOf(level) <= LEVELS.indexOf(logLevel);
  }

  function write(level, message, meta) {
    if (!shouldLog(level)) return;
    const payload = {
      level,
      time: timestamp(),
      message,
      ...(meta ? { meta } : {})
    };
    const line = JSON.stringify(payload);
    fs.appendFile(filePath, line + '\n', () => {});
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[${payload.time}] [${level.toUpperCase()}] ${message}` + (meta ? ` ${JSON.stringify(meta)}` : ''));
  }

  function buildLogger(boundMeta = {}) {
    return {
      level: logLevel,
      info: (msg, meta) => write('info', msg, meta ? { ...boundMeta, ...meta } : boundMeta),
      warn: (msg, meta) => write('warn', msg, meta ? { ...boundMeta, ...meta } : boundMeta),
      error: (msg, meta) => write('error', msg, meta ? { ...boundMeta, ...meta } : boundMeta),
      debug: (msg, meta) => write('debug', msg, meta ? { ...boundMeta, ...meta } : boundMeta),
      child: (childMeta = {}) => buildLogger({ ...boundMeta, ...childMeta })
    };
  }

  return buildLogger();
};
