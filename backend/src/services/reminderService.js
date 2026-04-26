'use strict';

/**
 * Reminder Service — Unpaid Fee Notifications
 *
 * Runs on a configurable interval and sends email reminders to parents
 * of students whose fees are unpaid. Respects a per-student cooldown
 * and a maximum reminder count to prevent inbox flooding.
 *
 * Config (all via environment variables):
 *   REMINDER_INTERVAL_MS     — how often the scheduler runs (default: 24h)
 *   REMINDER_COOLDOWN_HOURS  — min hours between reminders per student (default: 48h)
 *   REMINDER_MAX_COUNT       — stop reminding after N reminders (default: 5)
 */

const Student = require('../models/studentModel');
const School  = require('../models/schoolModel');
const { sendFeeReminder } = require('./notificationService');
const config = require('../config');
const logger = require('../utils/logger').child('ReminderService');

const {
  REMINDER_INTERVAL_MS,
  REMINDER_COOLDOWN_HOURS,
  REMINDER_MAX_COUNT,
} = config;

let _timer  = null;
let _running = false;

/**
 * Check if SMTP is properly configured
 */
function isSmtpConfigured() {
  return !!(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);
}

/**
 * Determine whether a student is eligible for a reminder right now.
 */
function isEligible(student) {
  if (student.feePaid)          return false;
  if (!student.parentEmail)     return false;
  if (student.reminderOptOut)   return false;
  if (student.reminderCount >= REMINDER_MAX_COUNT) return false;

  if (student.lastReminderSentAt) {
    const cooldownMs = REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000;
    const elapsed    = Date.now() - new Date(student.lastReminderSentAt).getTime();
    if (elapsed < cooldownMs) return false;
  }

  return true;
}

/**
 * Process all active schools and send reminders for eligible students.
 * Returns a summary object for logging / API response.
 */
async function processReminders() {
  // Skip if SMTP is not configured
  if (!isSmtpConfigured()) {
    logger.warn('SMTP not configured — skipping reminder run');
    return { schools: 0, eligible: 0, sent: 0, failed: 0, skipped: 0, smtpNotConfigured: true };
  }

  const summary = { schools: 0, eligible: 0, sent: 0, failed: 0, skipped: 0 };

  const schools = await School.find({ isActive: true }).lean();
  summary.schools = schools.length;

  for (const school of schools) {
    // Fetch all unpaid students in this school that have a parent email
    const unpaidStudents = await Student.find({
      schoolId:    school.schoolId,
      feePaid:     false,
      parentEmail: { $ne: null, $exists: true },
      reminderOptOut: { $ne: true },
    });

    for (const student of unpaidStudents) {
      if (!isEligible(student)) {
        summary.skipped++;
        continue;
      }

      summary.eligible++;

      try {
        const result = await sendFeeReminder({
          to:               student.parentEmail,
          studentName:      student.name,
          studentId:        student.studentId,
          className:        student.class,
          feeAmount:        student.feeAmount,
          remainingBalance: student.remainingBalance,
          schoolName:       school.name,
          reminderCount:    (student.reminderCount || 0) + 1,
        });

        // Only update tracking fields if email was actually sent
        if (result.sent) {
          await Student.findByIdAndUpdate(student._id, {
            $set: { lastReminderSentAt: new Date() },
            $inc: { reminderCount: 1 },
          });
          summary.sent++;
        } else {
          summary.skipped++;
        }
      } catch (err) {
        summary.failed++;
        logger.error('Failed to send reminder', {
          studentId: student.studentId,
          schoolId:  school.schoolId,
          error:     err.message,
        });
      }
    }
  }

  return summary;
}

/**
 * Single scheduler tick — wraps processReminders with error isolation.
 */
async function runReminders() {
  if (_running) {
    logger.warn('Previous reminder run still in progress — skipping tick');
    return;
  }
  _running = true;

  try {
    const summary = await processReminders();
    logger.info('Reminder run complete', summary);
  } catch (err) {
    logger.error('Reminder run failed', { error: err.message });
  } finally {
    _running = false;
  }
}

function startReminderScheduler() {
  if (_timer) return;
  
  if (!isSmtpConfigured()) {
    logger.warn('SMTP not configured — reminder scheduler will not start. Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable.');
    return;
  }
  
  logger.info(`Starting — interval: ${REMINDER_INTERVAL_MS}ms, cooldown: ${REMINDER_COOLDOWN_HOURS}h, maxCount: ${REMINDER_MAX_COUNT}`);
  // Do NOT run immediately on startup — wait for the first interval so the
  // server has time to fully initialise and we don't blast emails on every restart.
  _timer = setInterval(runReminders, REMINDER_INTERVAL_MS);
  _timer.unref(); // don't block process exit
}

function stopReminderScheduler() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    logger.info('Stopped');
  }
}

module.exports = { startReminderScheduler, stopReminderScheduler, processReminders };
