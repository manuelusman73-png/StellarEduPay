// Alphanumeric student IDs, 3–20 chars
const STUDENT_ID_RE = /^[A-Za-z0-9_-]{3,20}$/;

function validStudentId(id) {
  return typeof id === 'string' && STUDENT_ID_RE.test(id);
}

function validPositiveNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0;
}

// Middleware: validate :studentId route param
function validateStudentIdParam(req, res, next) {
  if (!validStudentId(req.params.studentId)) {
    return res.status(400).json({ error: 'Invalid studentId format' });
  }
  next();
}

// Middleware: validate POST /api/students body
function validateRegisterStudent(req, res, next) {
  const { studentId, name, class: className } = req.body;
  const errors = [];

  if (!validStudentId(studentId)) errors.push('studentId must be 3–20 alphanumeric characters');
  if (!name || typeof name !== 'string' || !name.trim()) errors.push('name is required');
  if (!className || typeof className !== 'string' || !className.trim()) errors.push('class is required');
  if (req.body.feeAmount != null && !validPositiveNumber(req.body.feeAmount)) {
    errors.push('feeAmount must be a positive number');
  }

  if (errors.length) return res.status(400).json({ errors });
  next();
}

// Middleware: validate POST /api/payments/verify body
function validateVerifyPayment(req, res, next) {
  const { txHash } = req.body;
  if (!txHash || typeof txHash !== 'string' || !/^[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'txHash must be a 64-character hex string' });
  }
  next();
}

// Middleware: validate POST /api/fees body
function validateFeeStructure(req, res, next) {
  const { className, feeAmount } = req.body;
  const errors = [];

  if (!className || typeof className !== 'string' || !className.trim()) errors.push('className is required');
  if (!validPositiveNumber(feeAmount)) errors.push('feeAmount must be a positive number');

  if (errors.length) return res.status(400).json({ errors });
  next();
}

module.exports = {
  validateStudentIdParam,
  validateRegisterStudent,
  validateVerifyPayment,
  validateFeeStructure,
};
