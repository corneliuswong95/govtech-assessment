const fsPromises = require('fs').promises;
const { InternalServerError } = require('../utils/errors');

class LocalTeamMemberCountRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.counts = {}; // In-memory cache {teamName: memberCount}
  }

  /**
   * Initialize repository - load counts from file
   */
  async initialize() {
    try {
      const data = await fsPromises.readFile(this.filePath, 'utf8');
      const items = JSON.parse(data);
      // Convert array format to object if needed
      if (Array.isArray(items)) {
        this.counts = items.reduce((acc, item) => {
          acc[item.team_name] = item.member_count;
          return acc;
        }, {});
      } else {
        this.counts = items;
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start with empty object
        this.counts = {};
        await this.save();
      } else {
        throw new InternalServerError(`Failed to initialize team member count repository: ${error.message}`);
      }
    }
  }

  /**
   * Save counts to file
   */
  async save() {
    try {
      // Save as array format matching DynamoDB structure
      const items = Object.entries(this.counts).map(([teamName, memberCount]) => ({
        team_name: teamName,
        member_count: memberCount,
        updated_at: Date.now()
      }));
      await fsPromises.writeFile(this.filePath, JSON.stringify(items, null, 2), 'utf8');
    } catch (error) {
      throw new InternalServerError(`Failed to save team member counts to file: ${error.message}`);
    }
  }

  /**
   * Get team member count
   */
  async getTeamMemberCount(teamName) {
    const count = this.counts[teamName];
    return count !== undefined ? { team_name: teamName, member_count: count } : null;
  }

  /**
   * Get all team member counts
   */
  async getAllTeamCounts() {
    return Object.entries(this.counts).map(([teamName, memberCount]) => ({
      team_name: teamName,
      member_count: memberCount
    }));
  }

  /**
   * Initialize or create team count
   */
  async initializeTeamCount(teamName, memberCount = 0) {
    if (this.counts[teamName] !== undefined) {
      return { success: false, reason: 'TEAM_EXISTS' };
    }

    this.counts[teamName] = memberCount;
    await this.save();
    return { success: true };
  }

  /**
   * Increment team member count
   */
  async incrementTeamCount(teamName) {
    if (this.counts[teamName] === undefined) {
      this.counts[teamName] = 0;
    }
    this.counts[teamName]++;
    await this.save();
    return { success: true };
  }

  /**
   * Decrement team member count
   */
  async decrementTeamCount(teamName) {
    if (this.counts[teamName] === undefined) {
      this.counts[teamName] = 0;
    }
    if (this.counts[teamName] > 0) {
      this.counts[teamName]--;
    }
    await this.save();
    return { success: true };
  }

  /**
   * Set team member count
   */
  async setTeamCount(teamName, memberCount) {
    this.counts[teamName] = memberCount;
    await this.save();
    return { success: true };
  }
}

module.exports = LocalTeamMemberCountRepository;
