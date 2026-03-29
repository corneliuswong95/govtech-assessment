const { NotFoundError, ConflictError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * RedemptionService
 * Orchestrates gift redemption logic across three tables:
 * 1. AllStaffRepository - Get team name by staff ID
 * 2. RedemptionStatusRepository - Check if team already redeemed, create redemption record
 * 3. TeamMemberCountRepository - Get team member count for response
 */
class RedemptionService {
  constructor(allStaffRepo, redemptionStatusRepo, teamCountRepo) {
    this.allStaffRepo = allStaffRepo;
    this.redemptionStatusRepo = redemptionStatusRepo;
    this.teamCountRepo = teamCountRepo;
  }

  /**
   * Redeem a gift for a staff member
   * Flow:
   * 1. Query allStaffRepo to get team name by staff_pass_id
   * 2. Query redemptionStatusRepo to check if team already redeemed
   * 3. Create redemption record in redemptionStatusRepo
   * 4. Query teamCountRepo to get member count
   * 5. Return {status: 'SUCCESS', team: string, team_member_count: number}
   * 
   * @param {string} staffPassId - Staff member's pass ID
   * @returns {Promise<{status: 'SUCCESS', team: string, team_member_count: number}>}
   * @throws {NotFoundError} - Staff ID not found
   * @throws {ConflictError} - Team already redeemed
   * @throws {Error} - Other unexpected errors
   */
  async redeem(staffPassId) {
    // Step 1: Query AllStaffRepository to get team name
    const staff = await this.allStaffRepo.getStaff(staffPassId);

    if (!staff) {
      logger.warn('Redemption attempt with invalid staff ID', {
        staffPassId,
      });
      throw new NotFoundError(`Staff ID "${staffPassId}" not found`);
    }

    const team = staff.team_name;

    // Step 2: Check if team already redeemed
    const existingRedemption = await this.redemptionStatusRepo.getRedemptionStatus(team);
    if (existingRedemption) {
      logger.warn('Duplicate redemption attempt', {
        staffPassId,
        team,
        previousStaffId: existingRedemption.staff_pass_id,
        redeemedAt: existingRedemption.redeemed_at,
      });
      throw new ConflictError(
        `Team "${team}" has already been redeemed`,
        team
      );
    }

    // Step 3: Create redemption record
    const redemptionResult = await this.redemptionStatusRepo.createRedemption(team, staffPassId);

    if (!redemptionResult.success) {
      logger.warn('Failed to create redemption (potential race condition)', {
        staffPassId,
        team,
        reason: redemptionResult.reason,
      });
      throw new ConflictError(
        `Team "${team}" has already been redeemed`,
        team
      );
    }

    // Step 4: Query TeamMemberCountRepository to get member count
    const teamCount = await this.teamCountRepo.getTeamMemberCount(team);
    const memberCount = teamCount ? teamCount.member_count : 0;

    logger.info('Redemption successful', {
      staffPassId,
      team,
      teamMemberCount: memberCount,
    });

    //Step 5: Return response with member count
    return {
      status: 'SUCCESS',
      team,
      team_member_count: memberCount
    };
  }

  /**
   * Get redemption details for a team
   */
  async getTeamRedemption(teamName) {
    try {
      const redemption = await this.redemptionStatusRepo.getRedemptionStatus(teamName);
      const teamCount = await this.teamCountRepo.getTeamMemberCount(teamName);
      const staff = await this.allStaffRepo.getStaffByTeam(teamName);

      if (!redemption) {
        return {
          team_name: teamName,
          redeemed: false,
          total_members: teamCount ? teamCount.member_count : 0,
          staff_count: staff.length
        };
      }

      return {
        team_name: teamName,
        redeemed: true,
        redeemed_by: redemption.staff_pass_id,
        redeemed_at: redemption.redeemed_at,
        total_members: teamCount ? teamCount.member_count : 0,
        staff_count: staff.length
      };
    } catch (error) {
      logger.error(`Error getting redemption details for team ${teamName}: ${error.message}`, { error });
      throw error;
    }
  }
}

module.exports = RedemptionService;
