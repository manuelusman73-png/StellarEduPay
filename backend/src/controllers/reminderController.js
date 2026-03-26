'use strict';

/**
 * Reminder Controller
 *
 * Exposes admin endpoints to:
 *   POST /api/reminders/trigger  — manually fire a reminder run
 *   GET  /api/reminders/preview  — list students who would receive a reminder
 *   POST /api/reminders/opt-out  — opt a student's parent out of reminders
 */

const Student = require('../models/studentModel');
const { processReminders } = require('../services/reminderService');
const config = require('../config');
const logger = require('../utils/logger').child('ReminderController');

const { REMINDER_COOLDOWN_HOURS, REMINDER_MAX_COUNT } = config;

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

module.exports = { triggerReminders, previewReminders, setOptOut };
