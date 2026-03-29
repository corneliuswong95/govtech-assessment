const { NotFoundError, ConflictError, InternalServerError } = require('../utils/errors');
const logger = require('../utils/logger');

class StaffService {
  constructor(allStaffRepo, teamCountRepo, redemptionStatusRepo) {
    this.allStaffRepo = allStaffRepo;
    this.teamCountRepo = teamCountRepo;
    this.redemptionStatusRepo = redemptionStatusRepo;
  }

  /**
   * Get all staff
   */
  async getAllStaff() {
    try {
      return await this.allStaffRepo.getAllStaff();
    } catch (error) {
      logger.error(`Error getting all staff: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get staff by ID
   */
  async getStaff(staffPassId) {
    try {
      const staff = await this.allStaffRepo.getStaff(staffPassId);
      if (!staff) {
        throw new NotFoundError(`Staff ID "${staffPassId}" not found`);
      }
      return staff;
    } catch (error) {
      logger.error(`Error getting staff ${staffPassId}: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Get staff by team
   */
  async getStaffByTeam(teamName) {
    try {
      return await this.allStaffRepo.getStaffByTeam(teamName);
    } catch (error) {
      logger.error(`Error getting staff for team ${teamName}: ${error.message}`, { error });
      throw error;
    }
  }

  /**
   * Add new staff
   */
  async addStaff(staffPassId, teamName) {
    try {
      // Check if staff already exists
      const existingStaff = await this.allStaffRepo.getStaff(staffPassId);
      if (existingStaff) {
        logger.warn(`Staff already exists: ${staffPassId}`, { staffPassId, teamName });
        throw new ConflictError(`Staff ID "${staffPassId}" already exists`);
      }

      // Add staff to all_staff table
      const addResult = await this.allStaffRepo.addStaff(staffPassId, teamName);
      if (!addResult.success) {
        logger.warn(`Failed to add staff: ${addResult.reason}`, { staffPassId, teamName });
        throw new ConflictError(`Staff ID "${staffPassId}" already exists`);
      }

      // Increment team member count
      await this.teamCountRepo.incrementTeamCount(teamName);

      logger.info(`Staff added successfully: ${staffPassId} -> ${teamName}`, { staffPassId, teamName });
      return { status: 'SUCCESS', staff_pass_id: staffPassId, team_name: teamName };
    } catch (error) {
      logger.error(`Error adding staff ${staffPassId}: ${error.message}`, { error, staffPassId, teamName });
      throw error;
    }
  }

  /**
   * Delete staff (with special handling for existing redemptions)
   */
  async deleteStaff(staffPassId) {
    try {
      // Check if staff exists
      const staff = await this.allStaffRepo.getStaff(staffPassId);
      if (!staff) {
        throw new NotFoundError(`Staff ID "${staffPassId}" not found`);
      }

      const teamName = staff.team_name;

      // Check if staff has an existing redemption
      const existingRedemption = await this.redemptionStatusRepo.getRedemptionByStaffId(staffPassId);
      if (existingRedemption) {
        logger.warn(`Staff has existing redemption, returning STAFF_HAS_REDEMPTION: ${staffPassId}`, { staffPassId, existingRedemption });
        // Return special status instead of throwing error
        return { status: 'DELETE_PARTIAL', message: `Staff "${staffPassId}" has an existing redemption record and cannot be fully deleted`, redemption: existingRedemption };
      }

      // Delete staff from all_staff table
      await this.allStaffRepo.deleteStaff(staffPassId);

      // Decrement team member count
      await this.teamCountRepo.decrementTeamCount(teamName);

      logger.info(`Staff deleted successfully: ${staffPassId}`, { staffPassId, teamName });
      return { status: 'SUCCESS', staff_pass_id: staffPassId, message: 'Staff deleted successfully' };
    } catch (error) {
      logger.error(`Error deleting staff ${staffPassId}: ${error.message}`, { error, staffPassId });
      throw error;
    }
  }

  /**
   * Bulk add staff from CSV data
   */
  async bulkAddStaff(staffList) {
    const results = {
      successful: [],
      failed: []
    };

    for (const staff of staffList) {
      try {
        await this.addStaff(staff.staff_pass_id, staff.team_name);
        results.successful.push(staff.staff_pass_id);
      } catch (error) {
        results.failed.push({
          staff_pass_id: staff.staff_pass_id,
          error: error.message
        });
      }
    }

    logger.info(`Bulk add staff completed: ${results.successful.length} succeeded, ${results.failed.length} failed`);
    return results;
  }

  /**
   * Get team statistics
   */
  async getTeamStats(teamName) {
    try {
      const staff = await this.allStaffRepo.getStaffByTeam(teamName);
      const count = await this.teamCountRepo.getTeamMemberCount(teamName);
      const redemption = await this.redemptionStatusRepo.getRedemptionStatus(teamName);

      return {
        team_name: teamName,
        total_members: count ? count.member_count : 0,
        staff_count: staff.length,
        redeemed: !!redemption,
        redeemed_by: redemption ? redemption.staff_pass_id : null,
        redeemed_at: redemption ? redemption.redeemed_at : null
      };
    } catch (error) {
      logger.error(`Error getting stats for team ${teamName}: ${error.message}`, { error });
      throw error;
    }
  }
}

module.exports = StaffService;
