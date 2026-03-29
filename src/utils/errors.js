/**
 * Custom application error classes
 * Each error maps to specific HTTP status code and business logic
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * ValidationError (400)
 * Thrown when request input validation fails
 */
class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details; // Array of field errors: [{field, message}]
  }
}

/**
 * NotFoundError (404)
 * Staff ID doesn't exist in system
 */
class NotFoundError extends AppError {
  constructor(message = 'Staff ID not found', code = 'INVALID_STAFF') {
    super(message, 400, code);
  }
}

/**
 * ConflictError (409)
 * Team has already been redeemed
 */
class ConflictError extends AppError {
  constructor(message = 'Team has already been redeemed', team = null) {
    super(message, 409, 'ALREADY_REDEEMED');
    this.team = team;
  }
}

/**
 * RetryableError (500)
 * Transient failure that can be retried (e.g., DynamoDB throttling)
 */
class RetryableError extends AppError {
  constructor(message, originalError = null, retryAfterMs = 1000) {
    super(message, 500, 'RETRYABLE_ERROR');
    this.originalError = originalError;
    this.retryAfterMs = retryAfterMs;
    this.isRetryable = true;
  }
}

/**
 * InternalServerError (500)
 * Non-transient server error
 */
class InternalServerError extends AppError {
  constructor(message = 'Internal server error', originalError = null) {
    super(message, 500, 'INTERNAL_ERROR');
    this.originalError = originalError;
    this.isRetryable = false;
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RetryableError,
  InternalServerError,
};
