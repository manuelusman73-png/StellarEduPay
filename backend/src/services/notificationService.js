'use strict';

/**
 * Notification Service
 *
 * Sends fee reminder emails to parents via SMTP (nodemailer).
 * Falls back to console logging when SMTP is not configured — useful
 * for development and environments without email infrastructure.
 *
 * Email bodies are loaded from:
 *   backend/src/templates/reminderEmail.txt  (plain-text)
 *   backend/src/templates/reminderEmail.html (HTML)
 *
 * Supported placeholders: {{studentName}}, {{studentId}}, {{className}},
 * {{schoolName}}, {{feeAmount}}, {{outstanding}}, {{reminderNote}}
 * The {{#if reminderNote}}…{{/if}} block is stripped when reminderNote is empty.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger').child('NotificationService');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

function loadTemplate(filename) {
  return fs.readFileSync(path.join(TEMPLATES_DIR, filename), 'utf8');
}

function renderTemplate(template, vars) {
  // Replace {{#if key}}…{{/if}} blocks — include content only when key is truthy
  let out = template.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) =>
    vars[key] ? inner : ''
  );
  // Replace {{key}} placeholders
  return out.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? vars[key] : ''));
}

let _transporter = null;

/**
 * Lazily initialise the nodemailer transporter.
 * Returns null (and logs a warning) when SMTP is not configured.
 */
function getTransporter() {
  if (_transporter) return _transporter;

  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) {
    logger.warn('SMTP not configured — reminder emails will be logged only. Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable sending.');
    return null;
  }

  // Lazy require — only load nodemailer when SMTP is actually configured.
  // This prevents a crash at startup when the package is not yet installed.
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    logger.warn('nodemailer is not installed — run `npm install` in the backend directory.');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host:   config.SMTP_HOST,
    port:   config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Build the reminder email body from external template files.
 */
function buildReminderEmail({ studentName, studentId, className, feeAmount, remainingBalance, schoolName, reminderCount }) {
  const outstanding = remainingBalance != null ? remainingBalance : feeAmount;
  const subject = `[${schoolName}] Fee Payment Reminder — ${studentName}`;
  const reminderNote = reminderCount > 1
    ? `Note: This is reminder #${reminderCount}. If you have already paid, please disregard this message.`
    : '';

  const vars = { studentName, studentId, className, feeAmount, outstanding, schoolName, reminderNote };

  const text = renderTemplate(loadTemplate('reminderEmail.txt'), vars);
  const html = renderTemplate(loadTemplate('reminderEmail.html'), vars);

  return { subject, text, html };
}

/**
 * Send a fee reminder to a parent.
 *
 * @param {object} opts
 * @param {string} opts.to            - Parent email address
 * @param {string} opts.studentName
 * @param {string} opts.studentId
 * @param {string} opts.className
 * @param {number} opts.feeAmount
 * @param {number|null} opts.remainingBalance
 * @param {string} opts.schoolName
 * @param {number} opts.reminderCount
 * @returns {Promise<{sent: boolean, messageId?: string, preview?: string}>}
 */
async function sendFeeReminder(opts) {
  const { subject, text, html } = buildReminderEmail(opts);
  const transporter = getTransporter();

  if (!transporter) {
    // Dev/no-SMTP fallback — log the reminder so it's not silently dropped
    logger.info('REMINDER (no SMTP)', {
      to: opts.to,
      subject,
      studentId: opts.studentId,
      reminderCount: opts.reminderCount,
    });
    return { sent: false, preview: text };
  }

  const info = await transporter.sendMail({
    from:    config.SMTP_FROM,
    to:      opts.to,
    subject,
    text,
    html,
  });

  logger.info('Reminder email sent', {
    messageId:    info.messageId,
    to:           opts.to,
    studentId:    opts.studentId,
    reminderCount: opts.reminderCount,
  });

  return { sent: true, messageId: info.messageId };
}

module.exports = { sendFeeReminder };
