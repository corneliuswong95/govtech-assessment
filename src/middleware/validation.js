/**
 * Input validation middleware
 * Validates staff_pass_id, team_name, and other request parameters
 */

const { body, validationResult } = require('express-validator');
const { ValidationError } = require('../utils/errors');

/**
 * Validation rules for /redeem endpoint
 */
const redeemValidationRules = () => [
  body('staff_pass_id')
    .trim()
    .notEmpty()
    .withMessage('staff_pass_id is required')
    .isString()
    .withMessage('staff_pass_id must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('staff_pass_id must be between 1 and 100 characters'),
];

/**
 * Validation rules for POST /staff (add staff)
 */
const staffValidationRules = () => [
  body('staff_pass_id')
    .trim()
    .notEmpty()
    .withMessage('staff_pass_id is required')
    .isString()
    .withMessage('staff_pass_id must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('staff_pass_id must be between 1 and 100 characters'),
  body('team_name')
    .trim()
    .notEmpty()
    .withMessage('team_name is required')
    .isString()
    .withMessage('team_name must be a string')
    .isLength({ min: 1, max: 100 })
    .withMessage('team_name must be between 1 and 100 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('team_name must be alphanumeric with underscores or hyphens'),
];

/**
 * Middleware to handle validation errors
 * Run after validation rules
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const details = errors.array().map(err => ({
      field: err.param,
      message: err.msg,
      value: err.value,
    }));
    
    return next(new ValidationError(
      'Request validation failed',
      details
    ));
  }
  
  next();
};

module.exports = {
  redeemValidationRules,
  staffValidationRules,
  handleValidationErrors,
};
