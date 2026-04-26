const Student = require('../models/studentModel');

/**
 * Generate a unique student ID of the form STU-XXXXXX (6 random uppercase alphanumeric chars).
 * Retries up to `maxAttempts` times to avoid collisions.
 * 
 * @param {number} maxAttempts - Maximum number of retry attempts (default: 10)
 * @returns {Promise<string>} Unique student ID
 * @throws {Error} If unable to generate unique ID after maxAttempts
 */
async function generateStudentId(maxAttempts = 10) {
  if (maxAttempts < 1) {
    throw Object.assign(new Error('maxAttempts must be at least 1'), { code: 'ID_GENERATION_FAILED' });
  }
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < maxAttempts; i++) {
    const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const id = `STU-${suffix}`;
    const exists = await Student.exists({ studentId: id });
    if (!exists) return id;
  }
  throw Object.assign(new Error(`Failed to generate a unique student ID after ${maxAttempts} attempts`), { code: 'ID_GENERATION_FAILED' });
}

module.exports = { generateStudentId };
