/**
 * Local development cron runner.
 * Uses node-cron to run jobs on a schedule identical to Vercel Cron config.
 *
 * This file is only used when running `node server.js` locally.
 * In production (Vercel), cron jobs are triggered via HTTP by Vercel's cron infrastructure.
 */

const cron = require('node-cron');
const { runCallScheduler } = require('./callScheduler');
const { runReminderJob } = require('./reminderJob');

function startJobs() {
  console.log('⏱  Starting local cron jobs...');

  // Every minute — call scheduler
  cron.schedule('* * * * *', async () => {
    try {
      const result = await runCallScheduler();
      if (result.processed > 0) {
        console.log(`[cron] callScheduler: processed=${result.processed}, failed=${result.failed}`);
      }
    } catch (err) {
      console.error('[cron] callScheduler error:', err.message);
    }
  });

  // Every hour — appointment reminders
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await runReminderJob();
      console.log(
        `[cron] reminderJob: 1day=${result.sent_1day}, 3hr=${result.sent_3hr}, errors=${result.errors}`
      );
    } catch (err) {
      console.error('[cron] reminderJob error:', err.message);
    }
  });

  console.log('✓  Cron jobs scheduled (callScheduler: every minute, reminders: every hour)');
}

module.exports = { startJobs };
