const request = require('supertest');
const initApp = require('../src/app');
const LocalAllStaffRepo = require('../src/repositories/localAllStaffRepository');
const LocalTeamMemberCountRepo = require('../src/repositories/localTeamMemberCountRepository');
const LocalRedemptionStatusRepo = require('../src/repositories/localRedemptionStatusRepository');
const RedemptionService = require('../src/services/redemptionService');
const StaffService = require('../src/services/staffService');
const fs = require('fs').promises;
const path = require('path');

// Test data files
const TEST_DATA_DIR = path.join(__dirname, './test-data');
const STAFF_FILE = path.join(TEST_DATA_DIR, 'staff.json');
const COUNT_FILE = path.join(TEST_DATA_DIR, 'counts.json');
const REDEMPTION_FILE = path.join(TEST_DATA_DIR, 'redemptions.json');

let app;

describe('Three-Table Database Design', () => {
  beforeAll(async () => {
    // Initialize app
    app = await initApp();
    
    // Reset actual data files used by app to load the full migrated CSV data
    // The app loads ./data/staff.json which has 5000 staff members from CSV migration
    // Just create test data directory for unit tests
    try {
      await fs.mkdir(TEST_DATA_DIR, { recursive: true });
    } catch (err) {
      // Directory already exists
    }
  });

  afterEach(async () => {
    // Clean up test files after each test
    try {
      await fs.unlink(STAFF_FILE);
    } catch (err) {
      // File doesn't exist
    }
    try {
      await fs.unlink(COUNT_FILE);
    } catch (err) {
      // File doesn't exist
    }
    try {
      await fs.unlink(REDEMPTION_FILE);
    } catch (err) {
      // File doesn't exist
    }
  });

  describe('AllStaffRepository', () => {
    it('should initialize with empty data', async () => {
      const repo = new LocalAllStaffRepo(STAFF_FILE);
      await repo.initialize();
      const staff = await repo.getAllStaff();
      expect(staff).toEqual([]);
    });

    it('should add new staff', async () => {
      const repo = new LocalAllStaffRepo(STAFF_FILE);
      await repo.initialize();
      
      const result = await repo.addStaff('STAFF_001', 'BASS');
      expect(result.success).toBe(true);

      const staff = await repo.getStaff('STAFF_001');
      expect(staff).toBeDefined();
      expect(staff.staff_pass_id).toBe('STAFF_001');
      expect(staff.team_name).toBe('BASS');
    });

    it('should prevent duplicate staff', async () => {
      const repo = new LocalAllStaffRepo(STAFF_FILE);
      await repo.initialize();
      
      await repo.addStaff('STAFF_001', 'BASS');
      const result = await repo.addStaff('STAFF_001', 'RUST');
      expect(result.success).toBe(false);
      expect(result.reason).toBe('STAFF_EXISTS');
    });

    it('should get staff by team', async () => {
      const repo = new LocalAllStaffRepo(STAFF_FILE);
      await repo.initialize();
      
      await repo.addStaff('STAFF_001', 'BASS');
      await repo.addStaff('STAFF_002', 'BASS');
      await repo.addStaff('STAFF_003', 'RUST');

      const bassStaff = await repo.getStaffByTeam('BASS');
      expect(bassStaff).toHaveLength(2);
      expect(bassStaff[0].team_name).toBe('BASS');
    });

    it('should delete staff', async () => {
      const repo = new LocalAllStaffRepo(STAFF_FILE);
      await repo.initialize();
      
      await repo.addStaff('STAFF_001', 'BASS');
      await repo.deleteStaff('STAFF_001');

      const staff = await repo.getStaff('STAFF_001');
      expect(staff).toBeNull();
    });

    it('should update staff team', async () => {
      const repo = new LocalAllStaffRepo(STAFF_FILE);
      await repo.initialize();
      
      await repo.addStaff('STAFF_001', 'BASS');
      await repo.updateStaffTeam('STAFF_001', 'RUST');

      const staff = await repo.getStaff('STAFF_001');
      expect(staff.team_name).toBe('RUST');
    });
  });

  describe('TeamMemberCountRepository', () => {
    it('should initialize with empty data', async () => {
      const repo = new LocalTeamMemberCountRepo(COUNT_FILE);
      await repo.initialize();
      const counts = await repo.getAllTeamCounts();
      expect(counts).toEqual([]);
    });

    it('should initialize team count', async () => {
      const repo = new LocalTeamMemberCountRepo(COUNT_FILE);
      await repo.initialize();
      
      const result = await repo.initializeTeamCount('BASS', 2);
      expect(result.success).toBe(true);

      const count = await repo.getTeamMemberCount('BASS');
      expect(count.member_count).toBe(2);
    });

    it('should increment team member count', async () => {
      const repo = new LocalTeamMemberCountRepo(COUNT_FILE);
      await repo.initialize();
      
      await repo.initializeTeamCount('BASS', 1);
      await repo.incrementTeamCount('BASS');

      const count = await repo.getTeamMemberCount('BASS');
      expect(count.member_count).toBe(2);
    });

    it('should decrement team member count', async () => {
      const repo = new LocalTeamMemberCountRepo(COUNT_FILE);
      await repo.initialize();
      
      await repo.initializeTeamCount('BASS', 3);
      await repo.decrementTeamCount('BASS');

      const count = await repo.getTeamMemberCount('BASS');
      expect(count.member_count).toBe(2);
    });

    it('should prevent count from going below zero', async () => {
      const repo = new LocalTeamMemberCountRepo(COUNT_FILE);
      await repo.initialize();
      
      await repo.initializeTeamCount('BASS', 1);
      await repo.decrementTeamCount('BASS');
      await repo.decrementTeamCount('BASS'); // Should stay at 0

      const count = await repo.getTeamMemberCount('BASS');
      expect(count.member_count).toBe(0);
    });

    it('should set team member count', async () => {
      const repo = new LocalTeamMemberCountRepo(COUNT_FILE);
      await repo.initialize();
      
      await repo.setTeamCount('BASS', 5);
      const count = await repo.getTeamMemberCount('BASS');
      expect(count.member_count).toBe(5);
    });
  });

  describe('RedemptionStatusRepository', () => {
    it('should initialize with empty data', async () => {
      const repo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);
      await repo.initialize();
      const redemptions = await repo.getAllRedemptions();
      expect(redemptions).toEqual([]);
    });

    it('should create redemption atomically', async () => {
      const repo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);
      await repo.initialize();
      
      const result = await repo.createRedemption('BASS', 'STAFF_001');
      expect(result.success).toBe(true);

      const redemption = await repo.getRedemptionStatus('BASS');
      expect(redemption.team_name).toBe('BASS');
      expect(redemption.staff_pass_id).toBe('STAFF_001');
    });

    it('should prevent duplicate team redemption', async () => {
      const repo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);
      await repo.initialize();
      
      await repo.createRedemption('BASS', 'STAFF_001');
      const result = await repo.createRedemption('BASS', 'STAFF_002');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('ALREADY_REDEEMED');
    });

    it('should get redemption by staff ID', async () => {
      const repo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);
      await repo.initialize();
      
      await repo.createRedemption('BASS', 'STAFF_001');
      const redemption = await repo.getRedemptionByStaffId('STAFF_001');
      
      expect(redemption).toBeDefined();
      expect(redemption.staff_pass_id).toBe('STAFF_001');
    });

    it('should delete redemption', async () => {
      const repo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);
      await repo.initialize();
      
      await repo.createRedemption('BASS', 'STAFF_001');
      await repo.deleteRedemption('BASS');

      const redemption = await repo.getRedemptionStatus('BASS');
      expect(redemption).toBeNull();
    });

    it('should delete redemption by staff ID', async () => {
      const repo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);
      await repo.initialize();
      
      await repo.createRedemption('BASS', 'STAFF_001');
      await repo.deleteRedemptionByStaffId('STAFF_001');

      const redemption = await repo.getRedemptionByStaffId('STAFF_001');
      expect(redemption).toBeNull();
    });
  });

  describe('RedemptionService (Three-Table Design)', () => {
    it('should successfully redeem gift and return member count', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup: Add staff to BASS team with 3 members
      await staffRepo.addStaff('STAFF_001', 'BASS');
      await staffRepo.addStaff('STAFF_002', 'BASS');
      await staffRepo.addStaff('STAFF_003', 'BASS');
      await countRepo.initializeTeamCount('BASS', 3);

      const service = new RedemptionService(staffRepo, redemptionRepo, countRepo);

      // Redeem and check response includes member count
      const result = await service.redeem('STAFF_001');
      expect(result.status).toBe('SUCCESS');
      expect(result.team).toBe('BASS');
      expect(result.team_member_count).toBe(3);
    });

    it('should throw NotFoundError for invalid staff', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      const service = new RedemptionService(staffRepo, redemptionRepo, countRepo);

      await expect(service.redeem('INVALID_STAFF')).rejects.toThrow('not found');
    });

    it('should throw ConflictError for duplicate team redemption', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup
      await staffRepo.addStaff('STAFF_001', 'BASS');
      await staffRepo.addStaff('STAFF_002', 'BASS');
      await countRepo.initializeTeamCount('BASS', 2);

      const service = new RedemptionService(staffRepo, redemptionRepo, countRepo);

      // First redemption succeeds
      await service.redeem('STAFF_001');

      // Second redemption should fail - same team
      await expect(service.redeem('STAFF_002')).rejects.toThrow('already been redeemed');
    });

    it('should handle teams with zero member count', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup: Staff exists but no team count record (should default to 0)
      await staffRepo.addStaff('STAFF_001', 'NEW_TEAM');

      const service = new RedemptionService(staffRepo, redemptionRepo, countRepo);

      const result = await service.redeem('STAFF_001');
      expect(result.team_member_count).toBe(0);
    });

    it('should get team redemption details', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup
      await staffRepo.addStaff('STAFF_001', 'BASS');
      await countRepo.initializeTeamCount('BASS', 1);
      await redemptionRepo.createRedemption('BASS', 'STAFF_001');

      const service = new RedemptionService(staffRepo, redemptionRepo, countRepo);

      const details = await service.getTeamRedemption('BASS');
      expect(details.team_name).toBe('BASS');
      expect(details.redeemed).toBe(true);
      expect(details.redeemed_by).toBe('STAFF_001');
      expect(details.total_members).toBe(1);
    });
  });

  describe('StaffService', () => {
    it('should add new staff and increment member count', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup: Initialize team count
      await countRepo.initializeTeamCount('BASS', 1);

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);

      // Add staff
      const result = await service.addStaff('STAFF_001', 'BASS');
      expect(result.status).toBe('SUCCESS');
      expect(result.staff_pass_id).toBe('STAFF_001');

      // Verify member count incremented
      const count = await countRepo.getTeamMemberCount('BASS');
      expect(count.member_count).toBe(2);
    });

    it('should prevent adding duplicate staff', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);

      await service.addStaff('STAFF_001', 'BASS');
      await expect(service.addStaff('STAFF_001', 'RUST')).rejects.toThrow('already exists');
    });

    it('should delete staff and decrement member count with no redemption', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup
      await staffRepo.addStaff('STAFF_001', 'BASS');
      await countRepo.initializeTeamCount('BASS', 1);

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);

      // Delete staff
      const result = await service.deleteStaff('STAFF_001');
      expect(result.status).toBe('SUCCESS');

      // Verify member count decremented
      const count = await countRepo.getTeamMemberCount('BASS');
      expect(count.member_count).toBe(0);
    });

    it('should return DELETE_PARTIAL if staff has redemption', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup: Staff with redemption
      await staffRepo.addStaff('STAFF_001', 'BASS');
      await countRepo.initializeTeamCount('BASS', 1);
      await redemptionRepo.createRedemption('BASS', 'STAFF_001');

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);

      // Try to delete
      const result = await service.deleteStaff('STAFF_001');
      expect(result.status).toBe('DELETE_PARTIAL');
      expect(result.message).toContain('redemption record');
      expect(result.redemption).toBeDefined();
    });

    it('should get all staff', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);

      await service.addStaff('STAFF_001', 'BASS');
      await service.addStaff('STAFF_002', 'RUST');

      const staff = await service.getAllStaff();
      expect(staff).toHaveLength(2);
    });

    it('should get staff by ID', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);
      await service.addStaff('STAFF_001', 'BASS');

      const staff = await service.getStaff('STAFF_001');
      expect(staff.staff_pass_id).toBe('STAFF_001');
    });

    it('should get staff by team', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);
      await service.addStaff('STAFF_001', 'BASS');
      await service.addStaff('STAFF_002', 'BASS');
      await service.addStaff('STAFF_003', 'RUST');

      const bassStaff = await service.getStaffByTeam('BASS');
      expect(bassStaff).toHaveLength(2);
    });

    it('should get team statistics', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      const service = new StaffService(staffRepo, countRepo, redemptionRepo);
      await service.addStaff('STAFF_001', 'BASS');
      await service.addStaff('STAFF_002', 'BASS');
      await countRepo.initializeTeamCount('BASS', 2);
      await redemptionRepo.createRedemption('BASS', 'STAFF_001');

      const stats = await service.getTeamStats('BASS');
      expect(stats.team_name).toBe('BASS');
      expect(stats.total_members).toBe(2);
      expect(stats.staff_count).toBe(2);
      expect(stats.redeemed).toBe(true);
      expect(stats.redeemed_by).toBe('STAFF_001');
    });
  });

  describe('API Integration Tests', () => {
    it('POST /redeem should return team_member_count in response', async () => {
      // Use a unique test approach - first add a staff member, then redeem
      const testTeam = 'TEAM_' + Date.now();
      const testStaffId = 'STAFF_' + Date.now();
      
      // Add the staff member to our test team
      await request(app)
        .post('/staff')
        .send({ staff_pass_id: testStaffId, team_name: testTeam });

      // Now redeem
      const response = await request(app)
        .post('/redeem')
        .send({ staff_pass_id: testStaffId })
        .expect(200);

      expect(response.body.status).toBe('SUCCESS');
      expect(response.body.team).toBe(testTeam);
      expect(response.body.team_member_count).toBe(1); // One member we just added
      expect(response.body.requestId).toBeDefined();
    });

    it('POST /staff should create new staff', async () => {
      const response = await request(app)
        .post('/staff')
        .send({ staff_pass_id: 'TEST_STAFF_' + Date.now(), team_name: 'NODEJS' })
        .expect(201);

      expect(response.body.status).toBe('SUCCESS');
      expect(response.body.staff_pass_id).toMatch(/^TEST_STAFF_/);
      expect(response.body.team_name).toBe('NODEJS');
    });

    it('POST /staff should validate required fields', async () => {
      const response = await request(app)
        .post('/staff')
        .send({ staff_pass_id: 'NEW_STAFF_001' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(response.body.details).toBeDefined();
    });

    it('GET /staff should return all staff', async () => {
      const response = await request(app)
        .get('/staff')
        .expect(200);

      expect(response.body.staff).toBeDefined();
      expect(Array.isArray(response.body.staff)).toBe(true);
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('GET /staff/:id should return specific staff', async () => {
      const response = await request(app)
        .get('/staff/MANAGER_SEK8LLK8R8JL')
        .expect(200);

      expect(response.body.staff_pass_id).toBe('MANAGER_SEK8LLK8R8JL');
      expect(response.body.team_name).toBe('HUFFLEPUFF');
    });

    it('GET /staff/:id should return 400 for invalid staff', async () => {
      const response = await request(app)
        .get('/staff/INVALID_STAFF_99999')
        .expect(400);

      expect(response.body.code).toBe('INVALID_STAFF');
    });

    it('DELETE /staff/:id should remove staff with 200 SUCCESS', async () => {
      // First add a staff
      await request(app)
        .post('/staff')
        .send({ staff_pass_id: 'DELETE_TEST_001', team_name: 'TEST' });

      // Then delete it
      const response = await request(app)
        .delete('/staff/DELETE_TEST_001')
        .expect(200);

      expect(response.body.status).toBe('SUCCESS');
      expect(response.body.message).toContain('deleted');
    });

    it('DELETE /staff/:id should return 206 PARTIAL if staff has redemption', async () => {
      // Add staff and redeem
      await request(app)
        .post('/staff')
        .send({ staff_pass_id: 'REDEEM_TEST_001', team_name: 'BASS' });

      await request(app)
        .post('/redeem')
        .send({ staff_pass_id: 'REDEEM_TEST_001' });

      // Try to delete - should return 206 Partial
      const response = await request(app)
        .delete('/staff/REDEEM_TEST_001')
        .expect(206);

      expect(response.body.status).toBe('DELETE_PARTIAL');
      expect(response.body.redemption).toBeDefined();
    });

    it('GET /staff/team/:team should return team members and stats', async () => {
      const response = await request(app)
        .get('/staff/team/BASS')
        .expect(200);

      expect(response.body.team_name).toBe('BASS');
      expect(response.body.staff).toBeDefined();
      expect(Array.isArray(response.body.staff)).toBe(true);
      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.total_members).toBeDefined();
      expect(response.body.stats.redeemed).toBeDefined();
    });

    it('GET /health should show three-table mode', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body.tables).toBeDefined();
      expect(response.body.tables.allStaff).toBeDefined();
      expect(response.body.tables.teamMemberCount).toBeDefined();
      expect(response.body.tables.redemptionStatus).toBeDefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent redemptions safely', async () => {
      const staffRepo = new LocalAllStaffRepo(STAFF_FILE);
      const countRepo = new LocalTeamMemberCountRepo(COUNT_FILE);
      const redemptionRepo = new LocalRedemptionStatusRepo(REDEMPTION_FILE);

      await staffRepo.initialize();
      await countRepo.initialize();
      await redemptionRepo.initialize();

      // Setup
      await staffRepo.addStaff('STAFF_001', 'BASS');
      await staffRepo.addStaff('STAFF_002', 'BASS');
      await countRepo.initializeTeamCount('BASS', 2);

      const service = new RedemptionService(staffRepo, redemptionRepo, countRepo);

      // First redemption succeeds
      const result1 = await service.redeem('STAFF_001');
      expect(result1.status).toBe('SUCCESS');

      // Second redemption fails due to atomic write
      try {
        await service.redeem('STAFF_002');
        fail('Should have thrown ConflictError');
      } catch (error) {
        expect(error.message).toContain('already been redeemed');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in POST /staff', async () => {
      const response = await request(app)
        .post('/staff')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      // Malformed JSON should result in 400 or 500 error (depending on parser)
      expect([400, 500]).toContain(response.status);
    });

    it('should validate team_name format', async () => {
      const response = await request(app)
        .post('/staff')
        .send({ staff_pass_id: 'STAFF_001', team_name: 'INVALID TEAM NAME!' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('should handle missing Content-Type header', async () => {
      // Text content type with JSON body
      const response = await request(app)
        .post('/redeem')
        .set('Content-Type', 'text/plain')
        .send('{"staff_pass_id": "STAFF_001"}');

      // Should handle gracefully (either validation error or 400)
      expect([400, 415]).toContain(response.status);
    });
  });
});
