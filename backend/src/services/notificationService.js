'use strict';

/**
 * Notification Service
 *
 * Sends fee reminder emails to parents via SMTP (nodemailer).
 * Falls back to console logging when SMTP is not configured — useful
 * for development and environments without email infrastructure.
 */

const config = require('../config');
const logger = require('../utils/logger').child('NotificationService');

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
 * Build the reminder email body.
 */
function buildReminderEmail({ studentName, studentId, className, feeAmount, remainingBalance, schoolName, reminderCount }) {
  const outstanding = remainingBalance != null ? remainingBalance : feeAmount;
  const subject = `[${schoolName}] Fee Payment Reminder — ${studentName}`;

  const text = [
    `Dear Parent/Guardian,`,
    ``,
    `This is a reminder that school fees for ${studentName} (ID: ${studentId}, Class: ${className}) are outstanding.`,
    ``,
    `  School       : ${schoolName}`,
    `  Fee Amount   : ${feeAmount}`,
    `  Amount Due   : ${outstanding}`,
    ``,
    `Please arrange payment at your earliest convenience to avoid any disruption to your child's education.`,
    ``,
    reminderCount > 1 ? `Note: This is reminder #${reminderCount}. If you have already paid, please disregard this message.` : '',
    ``,
    `Thank you,`,
    `${schoolName} Administration`,
  ].filter(line => line !== undefined).join('\n');

  const html = `
    <p>Dear Parent/Guardian,</p>
    <p>This is a reminder that school fees for <strong>${studentName}</strong> (ID: <code>${studentId}</code>, Class: <strong>${className}</strong>) are outstanding.</p>
    <table style="border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#555;">School</td><td><strong>${schoolName}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Fee Amount</td><td>${feeAmount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#555;">Amount Due</td><td><strong>${outstanding}</strong></td></tr>
    </table>
    <p>Please arrange payment at your earliest convenience to avoid any disruption to your child's education.</p>
    ${reminderCount > 1 ? `<p><em>Note: This is reminder #${reminderCount}. If you have already paid, please disregard this message.</em></p>` : ''}
    <p>Thank you,<br/><strong>${schoolName} Administration</strong></p>
  `;

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
