/**
 * Local development cron runner.
 * Uses node-cron to run jobs on a schedule identical to Vercel Cron config.
 *
 * This file is only used when running `node server.js` locally.
 * In production the GCP Pipecat VM polls /v1/internal/queue-worker every minute.
 */

const cron = require('node-cron');
const { runReminderJob } = require('./reminderJob');
const internal = require('../routes/internal');

function startJobs() {
  console.log('⏱  Starting local cron jobs...');

  cron.schedule('* * * * *', async () => {
    try {
      const result = await internal.runQueueWorker();
      if (result.processed > 0 || result.errors) {
        console.log(`[cron] queue-worker:`, result);
      }
    } catch (err) {
      console.error('[cron] queue-worker error:', err.message);
    }
  });

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

  console.log('✓  Cron jobs scheduled (queue-worker: every minute, reminders: every hour)');
}

module.exports = { startJobs };
