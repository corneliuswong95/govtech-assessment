const fsPromises = require('fs').promises;
const path = require('path');
const { InternalServerError } = require('../utils/errors');

class LocalAllStaffRepository {
  constructor(filePath) {
    this.filePath = filePath;
    this.staff = []; // In-memory cache
  }

  /**
   * Initialize repository - load staff from file
   */
  async initialize() {
    try {
      const data = await fsPromises.readFile(this.filePath, 'utf8');
      this.staff = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, start with empty array
        this.staff = [];
        await this.save();
      } else {
        throw new InternalServerError(`Failed to initialize staff repository: ${error.message}`);
      }
    }
  }

  /**
   * Save staff to file
   */
  async save() {
    try {
      await fsPromises.writeFile(this.filePath, JSON.stringify(this.staff, null, 2), 'utf8');
    } catch (error) {
      throw new InternalServerError(`Failed to save staff to file: ${error.message}`);
    }
  }

  /**
   * Get staff by pass ID
   */
  async getStaff(staffPassId) {
    return this.staff.find(s => s.staff_pass_id === staffPassId) || null;
  }

  /**
   * Get all staff
   */
  async getAllStaff() {
    return [...this.staff];
  }

  /**
   * Get staff by team
   */
  async getStaffByTeam(teamName) {
    return this.staff.filter(s => s.team_name === teamName);
  }

  /**
   * Add new staff
   */
  async addStaff(staffPassId, teamName) {
    const existing = await this.getStaff(staffPassId);
    if (existing) {
      return { success: false, reason: 'STAFF_EXISTS' };
    }

    this.staff.push({
      staff_pass_id: staffPassId,
      team_name: teamName,
      created_at: Date.now()
    });

    await this.save();
    return { success: true };
  }

  /**
   * Delete staff
   */
  async deleteStaff(staffPassId) {
    const index = this.staff.findIndex(s => s.staff_pass_id === staffPassId);
    if (index === -1) {
      return { success: false, reason: 'NOT_FOUND' };
    }

    this.staff.splice(index, 1);
    await this.save();
    return { success: true };
  }

  /**
   * Update staff team
   */
  async updateStaffTeam(staffPassId, teamName) {
    const staff = await this.getStaff(staffPassId);
    if (!staff) {
      return { success: false, reason: 'NOT_FOUND' };
    }

    staff.team_name = teamName;
    staff.updated_at = Date.now();
    await this.save();
    return { success: true };
  }
}

module.exports = LocalAllStaffRepository;
