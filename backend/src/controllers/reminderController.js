'use strict';

/**
 * Reminder Controller
 *
 * Exposes admin endpoints to:
 *   POST /api/reminders/trigger  — manually fire a reminder run
 *   GET  /api/reminders/preview  — list students who would receive a reminder
 *   POST /api/reminders/opt-out  — opt a student's parent out of reminders
 *   GET  /api/reminders/unsubscribe — public endpoint to unsubscribe via token
 *   POST /api/students/:studentId/reminders/resubscribe — admin endpoint to re-enable reminders
 */

const Student = require('../models/studentModel');
const { processReminders } = require('../services/reminderService');
const { generateUnsubscribeToken, verifyUnsubscribeToken } = require('../utils/unsubscribeToken');
const config = require('../config');
const logger = require('../utils/logger').child('ReminderController');

const { REMINDER_COOLDOWN_HOURS, REMINDER_MAX_COUNT, JWT_SECRET } = config;

/**
 * POST /api/reminders/trigger
 * Manually trigger a reminder run for all schools (or a specific school via body).
 */
async function triggerReminders(req, res, next) {
  try {
    logger.info('Manual reminder trigger', { triggeredBy: req.admin?.id || 'unknown' });
    const summary = await processReminders();
    res.json({ message: 'Reminder run complete', summary });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reminders/preview
 * Returns the list of students who are currently eligible for a reminder,
 * without actually sending anything. Useful for admin review.
 */
async function previewReminders(req, res, next) {
  try {
    const { schoolId } = req; // injected by resolveSchool middleware

    const query = {
      feePaid:        false,
      parentEmail:    { $ne: null, $exists: true },
      reminderOptOut: { $ne: true },
      reminderCount:  { $lt: REMINDER_MAX_COUNT },
    };

    if (schoolId) query.schoolId = schoolId;

    const cooldownCutoff = new Date(Date.now() - REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000);

    // Students who have never been reminded OR whose cooldown has expired
    query.$or = [
      { lastReminderSentAt: null },
      { lastReminderSentAt: { $lte: cooldownCutoff } },
    ];

    const students = await Student.find(query)
      .select('studentId name class feeAmount remainingBalance parentEmail lastReminderSentAt reminderCount schoolId')
      .lean();

    res.json({
      count: students.length,
      cooldownHours: REMINDER_COOLDOWN_HOURS,
      maxReminders: REMINDER_MAX_COUNT,
      students,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/reminders/opt-out
 * Body: { studentId, optOut: true|false }
 * Allows a parent (or admin on their behalf) to opt out of reminders.
 */
async function setOptOut(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId, optOut } = req.body;

    if (!studentId || optOut === undefined) {
      return res.status(400).json({ error: 'studentId and optOut (boolean) are required', code: 'VALIDATION_ERROR' });
    }

    const student = await Student.findOneAndUpdate(
      { schoolId, studentId },
      { $set: { reminderOptOut: Boolean(optOut) } },
      { new: true }
    ).select('studentId name reminderOptOut');

    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }

    res.json({ studentId: student.studentId, name: student.name, reminderOptOut: student.reminderOptOut });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/reminders/unsubscribe?token=<token>
 * Public endpoint (no auth required) to unsubscribe from reminders via signed token.
 * Returns HTML confirmation page or JSON response.
 */
async function unsubscribeViaToken(req, res, next) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'token query parameter is required', code: 'VALIDATION_ERROR' });
    }

    const verification = verifyUnsubscribeToken(token, JWT_SECRET);
    if (!verification.valid) {
      return res.status(400).json({ error: verification.error, code: 'INVALID_TOKEN' });
    }

    const { studentId, schoolId } = verification;
    const student = await Student.findOneAndUpdate(
      { schoolId, studentId },
      { $set: { reminderOptOut: true } },
      { new: true }
    ).select('studentId name reminderOptOut');

    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }

    // Return HTML confirmation page
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .success { color: green; }
        </style>
      </head>
      <body>
        <h1 class="success">✓ Unsubscribed</h1>
        <p>You have been unsubscribed from fee reminders for student <strong>${student.name}</strong> (ID: ${student.studentId}).</p>
        <p>You can resubscribe at any time by contacting your school administrator.</p>
      </body>
      </html>
    `;
    res.type('text/html').send(html);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/students/:studentId/reminders/resubscribe
 * Admin-only endpoint to re-enable reminders for a student.
 */
async function resubscribeReminders(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.params;

    const student = await Student.findOneAndUpdate(
      { schoolId, studentId },
      { $set: { reminderOptOut: false } },
      { new: true }
    ).select('studentId name reminderOptOut');

    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }

    res.json({ studentId: student.studentId, name: student.name, reminderOptOut: student.reminderOptOut });
  } catch (err) {
    next(err);
  }
}

module.exports = { triggerReminders, previewReminders, setOptOut, unsubscribeViaToken, resubscribeReminders };
