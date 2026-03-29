const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, get, put, delete: deleteCommand } = require('@aws-sdk/lib-dynamodb');
const logger = require('../utils/logger');
const { retryWithBackoff, RetryConfig } = require('../utils/retry');
const { InternalServerError, RetryableError } = require('../utils/errors');

/**
 * DynamoRedemptionRepository
 * Persists redemption records to DynamoDB
 * 
 * Schema:
 * - Partition Key: team_name (string)
 * - Attributes:
 *   - redeemed_at: Unix timestamp when redeemed
 *   - staff_pass_id: ID of staff member who redeemed
 */
class DynamoRedemptionRepository {
  constructor(tableName, config = {}) {
    this.table = tableName || process.env.DYNAMO_TABLE || 'redemptions';
    
    const dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    
    this.retryConfig = new RetryConfig({
      maxAttempts: config.maxAttempts || 3,
      initialDelayMs: config.initialDelayMs || 100,
      maxDelayMs: config.maxDelayMs || 5000,
    });
  }

  /**
   * Create a redemption record (atomic, prevents duplicates via conditional write)
   * @param {string} team - Team name to redeem
   * @param {string} staffPassId - Staff member's pass ID
   * @returns {Promise<{success: boolean, reason?: string}>} - Result object
   * @throws {InternalServerError} - On non-transient failures
   * @throws {RetryableError} - On transient failures
   */
  async createRedemption(team, staffPassId) {
    const operation = async () => {
      try {
        await this.client.send(put({
          TableName: this.table,
          Item: {
            team_name: team,
            redeemed_at: Date.now(),
            staff_pass_id: staffPassId,
          },
          /**
           * Atomic conditional write:
           * Only succeeds if team_name doesn't already exist
           * If it does, DynamoDB throws ConditionalCheckFailedException
           */
          ConditionExpression: 'attribute_not_exists(team_name)',
        }));

        logger.info('DynamoDB: Redemption created successfully', {
          team,
          staffPassId,
        });

        return { success: true };
      } catch (err) {
        // Duplicate redemption - this is expected behavior, not an error
        if (err.name === 'ConditionalCheckFailedException') {
          logger.info('DynamoDB: Duplicate redemption attempt (conditional write failed)', {
            team,
          });
          return { success: false, reason: 'ALREADY_REDEEMED' };
        }

        // Re-throw for retry handling
        throw err;
      }
    };

    try {
      return await retryWithBackoff(
        operation,
        this.retryConfig,
        `DynamoDB createRedemption for team: ${team}`
      );
    } catch (err) {
      logger.error('DynamoDB: Failed to create redemption after retries', {
        team,
        staffPassId,
        errorCode: err.name,
        errorMessage: err.message,
      });

      throw new InternalServerError(
        `Failed to save redemption to database: ${err.message}`,
        err
      );
    }
  }

  /**
   * Check if a team has been redeemed
   * @param {string} team - Team name
   * @returns {Promise<boolean>}
   */
  async exists(team) {
    try {
      const result = await retryWithBackoff(
        () => this.client.send(get({
          TableName: this.table,
          Key: { team_name: team },
        })),
        this.retryConfig,
        `DynamoDB exists check for team: ${team}`
      );

      return !!result.Item;
    } catch (err) {
      logger.error('DynamoDB: Failed to check redemption existence', {
        team,
        errorCode: err.name,
      });
      throw new InternalServerError('Failed to check redemption status', err);
    }
  }
}

module.exports = DynamoRedemptionRepository;
