/**
 * Application configuration
 * Loads from environment variables with sensible defaults
 */

const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',

  // Server
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    host: process.env.HOST || 'localhost',
  },

  // Storage
  storage: {
    mode: process.env.STORAGE_MODE || 'local', // 'local' or 'dynamo'
    local: {
      filePath: process.env.REDEMPTIONS_FILE_PATH || './data/redemptions.json',
    },
    dynamo: {
      table: process.env.DYNAMO_TABLE || 'redemptions',
      region: process.env.AWS_REGION || 'us-east-1',
    },
  },

  // Staff data
  staff: {
    csvPath: process.env.STAFF_CSV_PATH || './data/staff.csv',
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json', // 'json' or 'simple'
  },

  // Retry configuration
  retry: {
    maxAttempts: parseInt(process.env.RETRY_MAX_ATTEMPTS || '3', 10),
    initialDelayMs: parseInt(process.env.RETRY_INITIAL_DELAY_MS || '100', 10),
    maxDelayMs: parseInt(process.env.RETRY_MAX_DELAY_MS || '5000', 10),
    backoffMultiplier: parseFloat(process.env.RETRY_BACKOFF_MULTIPLIER || '2'),
  },

  // API Response settings
  api: {
    includeStackTrace: process.env.NODE_ENV !== 'production',
  },
};

/**
 * Validate required configuration values
 */
function validate() {
  const errors = [];

  if (!config.server.port) {
    errors.push('PORT must be a valid number');
  }

  if (!['local', 'dynamo'].includes(config.storage.mode)) {
    errors.push("STORAGE_MODE must be 'local' or 'dynamo'");
  }

  if (config.storage.mode === 'dynamo' && !process.env.DYNAMO_TABLE && !process.env.AWS_REGION) {
    if (config.env !== 'test') {
      console.warn('AWS_REGION not set, will use default region');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n- ${errors.join('\n- ')}`);
  }
}

// Validate on load
validate();

module.exports = config;
