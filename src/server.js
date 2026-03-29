/**
 * Server entry point - starts the Express server on port 3000
 * This is only used when running the application directly, not during tests
 */

const initApp = require('./app');
const logger = require('./utils/logger');

const STORAGE_MODE = process.env.STORAGE_MODE || 'local';

initApp().then(app => {
  app.listen(3000, () => {
    logger.info('Server running on port 3000 with three-table database design', {
      storageMode: STORAGE_MODE,
      tables: ['all_staff', 'team_member_count', 'redemption_status']
    });
  });
}).catch(err => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
