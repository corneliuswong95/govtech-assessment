const fs = require('fs');
const fsPromises = require('fs').promises;
const logger = require('../utils/logger');
const { InternalServerError } = require('../utils/errors');

/**
 * LocalRedemptionRepository
 * Persists redemption records to a local JSON file
 * 
 * Data format: JSON array of team names that have been redeemed
 * File: data/redemptions.json
 * 
 * NOTE: This module is designed for development/testing only.
 * Production should use DynamoDB for proper concurrency handling.
 */
class LocalRedemptionRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = new Set();
    this.isInitialized = false;
  }

  /**
   * Initialize repository by loading existing redemptions from file
   */
  async initialize() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = await fsPromises.readFile(this.filePath, 'utf-8');
        const teams = JSON.parse(raw);
        teams.forEach(t => this.data.add(t));
        logger.info('LocalRedemptionRepository initialized', {
          filePath: this.filePath,
          recordCount: teams.length,
        });
      } else {
        logger.info('LocalRedemptionRepository: Creating new redemptions file', {
          filePath: this.filePath,
        });
        await this._save();
      }
      this.isInitialized = true;
    } catch (err) {
      logger.error('LocalRedemptionRepository initialization failed', {
        filePath: this.filePath,
        errorMessage: err.message,
      });
      throw new InternalServerError(`Failed to initialize local storage: ${err.message}`, err);
    }
  }

  /**
   * Save redemptions to file (async)
   * @private
   */
  async _save() {
    try {
      const data = JSON.stringify([...this.data], null, 2);
      await fsPromises.writeFile(this.filePath, data, 'utf-8');
    } catch (err) {
      logger.error('Failed to save redemptions to file', {
        filePath: this.filePath,
        errorMessage: err.message,
      });
      throw new InternalServerError(`Failed to save redemptions: ${err.message}`, err);
    }
  }

  /**
   * Create a redemption record
   * @param {string} team - Team name to redeem
   * @param {string} staffPassId - Staff member's pass ID (unused in local storage)
   * @returns {Promise<{success: boolean, reason?: string}>}
   */
  async createRedemption(team, staffPassId) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      if (this.data.has(team)) {
        logger.info('LocalRedemptionRepository: Duplicate redemption attempt detected', {
          team,
        });
        return { success: false, reason: 'ALREADY_REDEEMED' };
      }

      this.data.add(team);
      await this._save();

      logger.info('LocalRedemptionRepository: Redemption created successfully', {
        team,
        staffPassId,
      });

      return { success: true };
    } catch (err) {
      logger.error('LocalRedemptionRepository: Failed to create redemption', {
        team,
        errorMessage: err.message,
      });
      throw err; // Re-throw to be caught by service layer
    }
  }

  /**
   * Check if a team has been redeemed
   * @param {string} team - Team name
   * @returns {Promise<boolean>}
   */
  async exists(team) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.data.has(team);
  }
}

module.exports = LocalRedemptionRepository;
