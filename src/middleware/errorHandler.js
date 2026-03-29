const logger = require('../utils/logger');
const { AppError, ValidationError } = require('../utils/errors');

/**
 * Global error handling middleware
 * Maps application errors to appropriate HTTP responses
 */
module.exports = (err, req, res, next) => {
  const requestId = req.id || 'unknown';
  
  // Determine status code and response structure
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let details = null;
  
  if (err instanceof ValidationError) {
    statusCode = err.statusCode || 400;
    code = err.code;
    details = err.details;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode || 500;
    code = err.code;
  }
  
  // Prepare response
  const errorResponse = {
    status: 'FAILED',
    code,
    message: err.message || 'An error occurred',
    requestId,
    timestamp: new Date().toISOString(),
  };
  
  if (details) {
    errorResponse.details = details;
  }
  
  // Log error with context
  const logContext = {
    requestId,
    statusCode,
    errorCode: code,
    errorMessage: err.message,
    path: req.path,
    method: req.method,
    staffPassId: req.body?.staff_pass_id,
  };
  
  if (statusCode >= 500) {
    logger.error(`Error processing request: ${err.message}`, {
      ...logContext,
      stack: err.stack,
    });
  } else {
    logger.info(`Request validation or business logic error: ${code}`, logContext);
  }
  
  // Add Retry-After header for conflict responses
  if (statusCode === 409) {
    res.set('Retry-After', '5');
  }
  
  res.status(statusCode).json(errorResponse);
};
