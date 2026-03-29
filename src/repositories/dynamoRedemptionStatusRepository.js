const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, get, scan, put, delete: deleteCommand } = require('@aws-sdk/lib-dynamodb');
const { InternalServerError } = require('../utils/errors');
const { retryWithBackoff, RetryConfig } = require('../utils/retry');

class DynamoRedemptionStatusRepository {
  constructor(tableName, config = {}) {
    this.table = tableName;
    
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.client = DynamoDBDocumentClient.from(client);
    
    this.retryConfig = new RetryConfig({
      maxAttempts: config.maxAttempts || 3,
      initialDelayMs: config.initialDelayMs || 100,
      maxDelayMs: config.maxDelayMs || 5000
    });
  }

  /**
   * Get redemption status for a team
   */
  async getRedemptionStatus(teamName) {
    const operation = async () => {
      const result = await this.client.send(get({
        TableName: this.table,
        Key: { team_name: teamName }
      }));
      return result.Item || null;
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getRedemptionStatus: ${teamName}`);
    } catch (error) {
      throw new InternalServerError(`Failed to get redemption status: ${error.message}`);
    }
  }

  /**
   * Get all redemption statuses
   */
  async getAllRedemptions() {
    const operation = async () => {
      const result = await this.client.send(scan({
        TableName: this.table
      }));
      return result.Items || [];
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getAllRedemptions`);
    } catch (error) {
      throw new InternalServerError(`Failed to scan redemptions: ${error.message}`);
    }
  }

  /**
   * Check if staff has already redeemed using a redemption
   */
  async getRedemptionByStaffId(staffPassId) {
    const operation = async () => {
      const result = await this.client.send(scan({
        TableName: this.table,
        FilterExpression: 'staff_pass_id = :staffId',
        ExpressionAttributeValues: { ':staffId': staffPassId }
      }));
      return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getRedemptionByStaffId: ${staffPassId}`);
    } catch (error) {
      throw new InternalServerError(`Failed to check staff redemption: ${error.message}`);
    }
  }

  /**
   * Create redemption record (atomic - ensures only one redemption per team)
   */
  async createRedemption(teamName, staffPassId) {
    const operation = async () => {
      await this.client.send(put({
        TableName: this.table,
        Item: {
          team_name: teamName,
          staff_pass_id: staffPassId,
          redeemed_at: Date.now()
        },
        ConditionExpression: 'attribute_not_exists(team_name)' // Atomic: only if not exists
      }));
      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB createRedemption for team: ${teamName}`);
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return { success: false, reason: 'ALREADY_REDEEMED' };
      }
      throw new InternalServerError(`Failed to create redemption: ${error.message}`);
    }
  }

  /**
   * Delete redemption (when staff is deleted)
   */
  async deleteRedemption(teamName) {
    const operation = async () => {
      await this.client.send(deleteCommand({
        TableName: this.table,
        Key: { team_name: teamName }
      }));
      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB deleteRedemption: ${teamName}`);
    } catch (error) {
      throw new InternalServerError(`Failed to delete redemption: ${error.message}`);
    }
  }

  /**
   * Delete by staff ID (search and delete)
   */
  async deleteRedemptionByStaffId(staffPassId) {
    try {
      const redemption = await this.getRedemptionByStaffId(staffPassId);
      if (redemption) {
        return await this.deleteRedemption(redemption.team_name);
      }
      return { success: true };
    } catch (error) {
      throw new InternalServerError(`Failed to delete redemption by staff ID: ${error.message}`);
    }
  }
}

module.exports = DynamoRedemptionStatusRepository;
