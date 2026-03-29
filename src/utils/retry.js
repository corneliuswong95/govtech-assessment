/**
 * Retry utility with exponential backoff
 * Used for handling transient failures (e.g., DynamoDB throttling)
 */

const logger = require('./logger');

/**
 * Configuration for retry behavior
 */
class RetryConfig {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.initialDelayMs = options.initialDelayMs || 100;
    this.maxDelayMs = options.maxDelayMs || 10000;
    this.backoffMultiplier = options.backoffMultiplier || 2;
    this.jitterFactor = options.jitterFactor || 0.1; // 10% jitter
  }

  /**
   * Calculate delay for a given attempt number (0-indexed)
   */
  calculateDelay(attemptNumber) {
    const exponentialDelay = this.initialDelayMs * Math.pow(this.backoffMultiplier, attemptNumber);
    const cappedDelay = Math.min(exponentialDelay, this.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.jitterFactor * Math.random();
    
    return Math.round(cappedDelay + jitter);
  }
}

/**
 * Sleep utility for async delays
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determines if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} - True if error is transient/retryable
 */
function isRetryableError(error) {
  // DynamoDB transient errors
  if (error.code === 'ProvisionedThroughputExceededException') return true;
  if (error.code === 'ThrottlingException') return true;
  if (error.code === 'RequestLimitExceeded') return true;
  if (error.code === 'InternalServerError') return true;
  
  // Network timeouts
  if (error.code === 'RequestTimeout' || error.code === 'TimeoutError') return true;
  if (error.code === 'ECONNREFUSED') return true;
  if (error.code === 'ECONNRESET') return true;
  
  // Generic transient status codes
  if (error.statusCode === 503) return true; // Service Unavailable
  if (error.statusCode === 429) return true; // Too Many Requests
  
  return false;
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} asyncFn - Async function to execute
 * @param {RetryConfig} config - Retry configuration
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise} - Result of asyncFn
 */
async function retryWithBackoff(asyncFn, config = new RetryConfig(), operationName = 'Operation') {
  let lastError;
  
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error;
      
      // If not retryable or last attempt, throw
      if (!isRetryableError(error) || attempt === config.maxAttempts - 1) {
        throw error;
      }
      
      // Calculate delay and log
      const delayMs = config.calculateDelay(attempt);
      logger.warn(`${operationName} failed (attempt ${attempt + 1}/${config.maxAttempts}), retrying in ${delayMs}ms`, {
        errorCode: error.code,
        errorMessage: error.message,
      });
      
      // Wait before retrying
      await sleep(delayMs);
    }
  }
  
  throw lastError;
}

module.exports = {
  RetryConfig,
  retryWithBackoff,
  isRetryableError,
  sleep,
};
