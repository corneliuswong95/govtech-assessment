const express = require('express');
const bodyParser = require('body-parser');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const requestIdMiddleware = require('./middleware/requestId');
const { redeemValidationRules, handleValidationErrors, staffValidationRules } = require('./middleware/validation');
const { ConflictError, NotFoundError } = require('./utils/errors');

// Three-table design repositories
const DynamoAllStaffRepo = require('./repositories/dynamoAllStaffRepository');
const LocalAllStaffRepo = require('./repositories/localAllStaffRepository');
const DynamoTeamMemberCountRepo = require('./repositories/dynamoTeamMemberCountRepository');
const LocalTeamMemberCountRepo = require('./repositories/localTeamMemberCountRepository');
const DynamoRedemptionStatusRepo = require('./repositories/dynamoRedemptionStatusRepository');
const LocalRedemptionStatusRepo = require('./repositories/localRedemptionStatusRepository');

// Services
const RedemptionService = require('./services/redemptionService');
const StaffService = require('./services/staffService');

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(requestIdMiddleware);

const STORAGE_MODE = process.env.STORAGE_MODE || 'local';

async function init() {
  // Initialize repositories based on storage mode
  let allStaffRepo, teamCountRepo, redemptionStatusRepo;

  if (STORAGE_MODE === 'dynamo') {
    allStaffRepo = new DynamoAllStaffRepo(process.env.DYNAMO_ALL_STAFF_TABLE || 'all_staff');
    teamCountRepo = new DynamoTeamMemberCountRepo(process.env.DYNAMO_TEAM_COUNT_TABLE || 'team_member_count');
    redemptionStatusRepo = new DynamoRedemptionStatusRepo(process.env.DYNAMO_REDEMPTION_STATUS_TABLE || 'redemption_status');
  } else {
    // Local storage mode
    allStaffRepo = new LocalAllStaffRepo('./data/staff.json');
    await allStaffRepo.initialize();

    teamCountRepo = new LocalTeamMemberCountRepo('./data/team_counts.json');
    await teamCountRepo.initialize();

    redemptionStatusRepo = new LocalRedemptionStatusRepo('./data/redemptions.json');
    await redemptionStatusRepo.initialize();
  }

  // Initialize services with three-table design
  const redemptionService = new RedemptionService(allStaffRepo, redemptionStatusRepo, teamCountRepo);
  const staffService = new StaffService(allStaffRepo, teamCountRepo, redemptionStatusRepo);

  /**
   * POST /redeem
   * Redeems a gift for a staff member
   * Queries three tables and returns team member count
   * 
   * Request: { staff_pass_id: string }
   * Response: { status: 'SUCCESS', team: string, team_member_count: number, requestId, timestamp }
   * Error: 400/409/500 with error details
   */
  app.post(
    '/redeem',
    redeemValidationRules(),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { staff_pass_id } = req.body;

        logger.info('Redeem request received', {
          requestId: req.id,
          staffPassId: staff_pass_id,
        });

        const result = await redemptionService.redeem(staff_pass_id);

        // Successful redemption with team member count
        const response = {
          status: result.status,
          team: result.team,
          team_member_count: result.team_member_count,
          requestId: req.id,
          timestamp: new Date().toISOString(),
        };

        logger.info('Redemption processed successfully', {
          requestId: req.id,
          staffPassId: staff_pass_id,
          team: result.team,
          teamMemberCount: result.team_member_count,
        });

        res.status(200).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /staff
   * Add a new staff member to the system
   * Also increments the team member count
   * 
   * Request: { staff_pass_id: string, team_name: string }
   * Response: { status: 'SUCCESS', staff_pass_id, team_name, requestId, timestamp }
   */
  app.post(
    '/staff',
    staffValidationRules(),
    handleValidationErrors,
    async (req, res, next) => {
      try {
        const { staff_pass_id, team_name } = req.body;

        logger.info('Add staff request received', {
          requestId: req.id,
          staffPassId: staff_pass_id,
          teamName: team_name,
        });

        const result = await staffService.addStaff(staff_pass_id, team_name);

        const response = {
          status: result.status,
          staff_pass_id: result.staff_pass_id,
          team_name: result.team_name,
          requestId: req.id,
          timestamp: new Date().toISOString(),
        };

        logger.info('Staff added successfully', {
          requestId: req.id,
          staffPassId: staff_pass_id,
          teamName: team_name,
        });

        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /staff
   * Get all staff members
   * 
   * Response: { staff: [...], total: number, requestId, timestamp }
   */
  app.get('/staff', async (req, res, next) => {
    try {
      logger.info('Get all staff request received', {
        requestId: req.id,
      });

      const staff = await staffService.getAllStaff();

      const response = {
        staff,
        total: staff.length,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /staff/:id
   * Get specific staff member details
   * 
   * Response: { staff_pass_id, team_name, created_at, requestId, timestamp }
   */
  app.get('/staff/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      logger.info('Get staff request received', {
        requestId: req.id,
        staffPassId: id,
      });

      const staff = await staffService.getStaff(id);

      const response = {
        ...staff,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  });

  /**
   * DELETE /staff/:id
   * Delete a staff member
   * If staff has existing redemption, returns DELETE_PARTIAL with redemption record
   * 
   * Response: { status: 'SUCCESS' or 'DELETE_PARTIAL', message, redemption?, requestId, timestamp }
   */
  app.delete('/staff/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      logger.info('Delete staff request received', {
        requestId: req.id,
        staffPassId: id,
      });

      const result = await staffService.deleteStaff(id);

      const statusCode = result.status === 'SUCCESS' ? 200 : 206; // 206 Partial Content for DELETE_PARTIAL
      const response = {
        status: result.status,
        message: result.message,
        ...(result.redemption && { redemption: result.redemption }),
        requestId: req.id,
        timestamp: new Date().toISOString(),
      };

      logger.info('Staff deletion processed', {
        requestId: req.id,
        staffPassId: id,
        status: result.status,
      });

      res.status(statusCode).json(response);
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /staff/team/:teamName
   * Get all staff in a team and team statistics
   * 
   * Response: { team_name, staff: [...], stats: {total_members, redeemed, ...}, requestId, timestamp }
   */
  app.get('/staff/team/:team', async (req, res, next) => {
    try {
      const { team } = req.params;

      logger.info('Get team staff request received', {
        requestId: req.id,
        teamName: team,
      });

      const staff = await staffService.getStaffByTeam(team);
      const stats = await staffService.getTeamStats(team);

      const response = {
        team_name: team,
        staff,
        stats,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      mode: STORAGE_MODE,
      tables: {
        allStaff: STORAGE_MODE === 'dynamo' ? 'all_staff' : 'staff.json',
        teamMemberCount: STORAGE_MODE === 'dynamo' ? 'team_member_count' : 'team_counts.json',
        redemptionStatus: STORAGE_MODE === 'dynamo' ? 'redemption_status' : 'redemptions.json'
      }
    });
  });

  // Global error handler (must be last middleware)
  app.use(errorHandler);

  return app;
}

// Export the init function and let consumers decide when to listen
module.exports = init;
module.exports.init = init;
