/**
 * Request ID middleware
 * Adds unique request ID to each request for traceability
 */

const { v4: uuidv4 } = require('uuid');

const requestIdMiddleware = (req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.set('X-Request-ID', req.id);
  next();
};

module.exports = requestIdMiddleware;
