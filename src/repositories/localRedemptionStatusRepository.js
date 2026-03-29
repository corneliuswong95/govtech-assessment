const fsPromises = require('fs').promises;
const { InternalServerError } = require('../utils/errors');

class LocalRedemptionStatusRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.redemptions = {}; // In-memory cache {teamName: {team_name, staff_pass_id, redeemed_at}}
  }

  /**
   * Initialize repository - load redemptions from file
   */
  async initialize() {
    try {
      const data = await fsPromises.readFile(this.filePath, 'utf8');
      const items = JSON.parse(data);
      // Convert array to object for O(1) lookup
      this.redemptions = Array.isArray(items)
        ? items.reduce((acc, item) => {
            acc[item.team_name] = item;
            return acc;
          }, {})
        : items;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start with empty object
        this.redemptions = {};
        await this.save();
      } else {
        throw new InternalServerError(`Failed to initialize redemption status repository: ${error.message}`);
      }
    }
  }

  /**
   * Save redemptions to file
   */
  async save() {
    try {
      // Save as array format
      const items = Object.values(this.redemptions);
      await fsPromises.writeFile(this.filePath, JSON.stringify(items, null, 2), 'utf8');
    } catch (error) {
      throw new InternalServerError(`Failed to save redemptions to file: ${error.message}`);
    }
  }

  /**
   * Get redemption status for a team
   */
  async getRedemptionStatus(teamName) {
    return this.redemptions[teamName] || null;
  }

  /**
   * Get all redemption statuses
   */
  async getAllRedemptions() {
    return Object.values(this.redemptions);
  }

  /**
   * Check if staff has already redeemed
   */
  async getRedemptionByStaffId(staffPassId) {
    const redemption = Object.values(this.redemptions).find(r => r.staff_pass_id === staffPassId);
    return redemption || null;
  }

  /**
   * Create redemption record (atomic - ensures only one per team)
   */
  async createRedemption(teamName, staffPassId) {
    if (this.redemptions[teamName]) {
      return { success: false, reason: 'ALREADY_REDEEMED' };
    }

    this.redemptions[teamName] = {
      team_name: teamName,
      staff_pass_id: staffPassId,
      redeemed_at: Date.now()
    };

    await this.save();
    return { success: true };
  }

  /**
   * Delete redemption (when staff is deleted)
   */
  async deleteRedemption(teamName) {
    if (this.redemptions[teamName]) {
      delete this.redemptions[teamName];
      await this.save();
    }
    return { success: true };
  }

  /**
   * Delete by staff ID (search and delete)
   */
  async deleteRedemptionByStaffId(staffPassId) {
    const teamName = Object.keys(this.redemptions).find(
      team => this.redemptions[team].staff_pass_id === staffPassId
    );
    
    if (teamName) {
      delete this.redemptions[teamName];
      await this.save();
    }

    return { success: true };
  }
}

module.exports = LocalRedemptionStatusRepository;
