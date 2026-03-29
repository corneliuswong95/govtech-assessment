const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, get, scan, query, put, delete: deleteCommand, update } = require('@aws-sdk/lib-dynamodb');
const { InternalServerError } = require('../utils/errors');
const { retryWithBackoff, RetryConfig } = require('../utils/retry');

class DynamoAllStaffRepository {
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
   * Get staff by pass ID
   */
  async getStaff(staffPassId) {
    const operation = async () => {
      const result = await this.client.send(get({
        TableName: this.table,
        Key: { staff_pass_id: staffPassId }
      }));
      return result.Item || null;
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getStaff: ${staffPassId}`);
    } catch (error) {
      throw new InternalServerError(`Failed to get staff from DynamoDB: ${error.message}`);
    }
  }

  /**
   * Get all staff
   */
  async getAllStaff() {
    const operation = async () => {
      const result = await this.client.send(scan({
        TableName: this.table
      }));
      return result.Items || [];
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getAllStaff`);
    } catch (error) {
      throw new InternalServerError(`Failed to scan staff from DynamoDB: ${error.message}`);
    }
  }

  /**
   * Get staff by team
   */
  async getStaffByTeam(teamName) {
    const operation = async () => {
      const result = await this.client.send(query({
        TableName: this.table,
        IndexName: 'team_name-index',
        KeyConditionExpression: 'team_name = :team',
        ExpressionAttributeValues: { ':team': teamName }
      }));
      return result.Items || [];
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getStaffByTeam: ${teamName}`);
    } catch (error) {
      throw new InternalServerError(`Failed to query staff by team: ${error.message}`);
    }
  }

  /**
   * Add new staff
   */
  async addStaff(staffPassId, teamName) {
    const operation = async () => {
      // Check if staff already exists
      const existing = await this.getStaff(staffPassId);
      if (existing) {
        return { success: false, reason: 'STAFF_EXISTS' };
      }

      // Add new staff
      await this.client.send(put({
        TableName: this.table,
        Item: {
          staff_pass_id: staffPassId,
          team_name: teamName,
          created_at: Date.now()
        },
        ConditionExpression: 'attribute_not_exists(staff_pass_id)'
      }));

      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB addStaff: ${staffPassId}`);
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return { success: false, reason: 'STAFF_EXISTS' };
      }
      throw new InternalServerError(`Failed to add staff to DynamoDB: ${error.message}`);
    }
  }

  /**
   * Delete staff
   */
  async deleteStaff(staffPassId) {
    const operation = async () => {
      await this.client.send(deleteCommand({
        TableName: this.table,
        Key: { staff_pass_id: staffPassId }
      }));
      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB deleteStaff: ${staffPassId}`);
    } catch (error) {
      throw new InternalServerError(`Failed to delete staff from DynamoDB: ${error.message}`);
    }
  }

  /**
   * Update staff team
   */
  async updateStaffTeam(staffPassId, teamName) {
    const operation = async () => {
      await this.client.send(update({
        TableName: this.table,
        Key: { staff_pass_id: staffPassId },
        UpdateExpression: 'SET team_name = :team, updated_at = :ts',
        ExpressionAttributeValues: {
          ':team': teamName,
          ':ts': Date.now()
        }
      }));
      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB updateStaffTeam: ${staffPassId}`);
    } catch (error) {
      throw new InternalServerError(`Failed to update staff in DynamoDB: ${error.message}`);
    }
  }
}

module.exports = DynamoAllStaffRepository;
