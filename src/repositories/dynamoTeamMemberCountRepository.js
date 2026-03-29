const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, get, scan, put, update } = require('@aws-sdk/lib-dynamodb');
const { InternalServerError } = require('../utils/errors');
const { retryWithBackoff, RetryConfig } = require('../utils/retry');

class DynamoTeamMemberCountRepository {
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
   * Get team member count
   */
  async getTeamMemberCount(teamName) {
    const operation = async () => {
      const result = await this.client.send(get({
        TableName: this.table,
        Key: { team_name: teamName }
      }));
      return result.Item || null;
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getTeamMemberCount: ${teamName}`);
    } catch (error) {
      throw new InternalServerError(`Failed to get team member count: ${error.message}`);
    }
  }

  /**
   * Get all team member counts
   */
  async getAllTeamCounts() {
    const operation = async () => {
      const result = await this.client.send(scan({
        TableName: this.table
      }));
      return result.Items || [];
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB getAllTeamCounts`);
    } catch (error) {
      throw new InternalServerError(`Failed to scan team member counts: ${error.message}`);
    }
  }

  /**
   * Initialize or create team count
   */
  async initializeTeamCount(teamName, memberCount = 0) {
    const operation = async () => {
      const existing = await this.getTeamMemberCount(teamName);
      if (existing) {
        return { success: false, reason: 'TEAM_EXISTS' };
      }

      await this.client.send(put({
        TableName: this.table,
        Item: {
          team_name: teamName,
          member_count: memberCount,
          updated_at: Date.now()
        },
        ConditionExpression: 'attribute_not_exists(team_name)'
      }));

      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB initializeTeamCount: ${teamName}`);
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return { success: false, reason: 'TEAM_EXISTS' };
      }
      throw new InternalServerError(`Failed to initialize team count: ${error.message}`);
    }
  }

  /**
   * Increment team member count
   */
  async incrementTeamCount(teamName) {
    const operation = async () => {
      await this.client.send(update({
        TableName: this.table,
        Key: { team_name: teamName },
        UpdateExpression: 'SET member_count = if_not_exists(member_count, :zero) + :one, updated_at = :ts',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
          ':ts': Date.now()
        }
      }));
      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB incrementTeamCount: ${teamName}`);
    } catch (error) {
      throw new InternalServerError(`Failed to increment team count: ${error.message}`);
    }
  }

  /**
   * Decrement team member count
   */
  async decrementTeamCount(teamName) {
    const operation = async () => {
      await this.client.send(update({
        TableName: this.table,
        Key: { team_name: teamName },
        UpdateExpression: 'SET member_count = MAX(:zero, member_count - :one), updated_at = :ts',
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
          ':ts': Date.now()
        }
      }));
      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB decrementTeamCount: ${teamName}`);
    } catch (error) {
      throw new InternalServerError(`Failed to decrement team count: ${error.message}`);
    }
  }

  /**
   * Set team member count
   */
  async setTeamCount(teamName, memberCount) {
    const operation = async () => {
      await this.client.send(update({
        TableName: this.table,
        Key: { team_name: teamName },
        UpdateExpression: 'SET member_count = :count, updated_at = :ts',
        ExpressionAttributeValues: {
          ':count': memberCount,
          ':ts': Date.now()
        }
      }));
      return { success: true };
    };

    try {
      return await retryWithBackoff(operation, this.retryConfig, `DynamoDB setTeamCount: ${teamName}`);
    } catch (error) {
      throw new InternalServerError(`Failed to set team count: ${error.message}`);
    }
  }
}

module.exports = DynamoTeamMemberCountRepository;
