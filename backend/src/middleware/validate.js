'use strict';

const Joi = require('joi');

const {
  createPaymentIntentSchema,
  submitTransactionSchema,
  verifyPaymentSchema,
} = require('./schemas/paymentSchemas');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      convert:    true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field:   detail.context?.key || detail.path.join('.') || 'unknown',
        message: detail.message,
      }));
      return res.status(400).json({ errors });
    }

    req[source] = value;
    return next();
  };
}

const validateCreatePaymentIntent = validate(createPaymentIntentSchema, 'body');
const validateSubmitTransaction = validate(submitTransactionSchema, 'body');
const validateVerifyPayment = validate(verifyPaymentSchema, 'body');

const STUDENT_ID_RE = /^[A-Za-z0-9_-]{3,20}$/;

function validStudentId(id) {
  return typeof id === 'string' && STUDENT_ID_RE.test(id);
}

function validPositiveNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0;
}

function validTxHash(hash) {
  return typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash);
}

/** Middleware: validate :studentId URL param */
function validateStudentIdParam(req, res, next) {
  if (!validStudentId(req.params.studentId)) {
    return res.status(400).json({ errors: [{ field: 'studentId', message: 'Invalid studentId format' }] });
  }
  return next();
}

/** Middleware: validate :txHash URL param */
function validateTxHashParam(req, res, next) {
  if (!validTxHash(req.params.txHash)) {
    return res.status(400).json({ errors: [{ field: 'txHash', message: 'Invalid txHash format' }] });
  }
  return next();
}

/** Middleware: validate POST /api/students body */
function validateRegisterStudent(req, res, next) {
  const { studentId, name, class: className, feeAmount } = req.body;
  const errors = [];

  if (studentId != null && !validStudentId(studentId)) {
    errors.push('studentId must be 3–20 alphanumeric characters');
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    errors.push('name is required');
  }
  if (!className || typeof className !== 'string' || !className.trim()) {
    errors.push('class is required');
  }
  if (feeAmount != null && !validPositiveNumber(feeAmount)) {
    errors.push('feeAmount must be a positive number');
  }

  if (errors.length) return res.status(400).json({ errors });
  return next();
}

function validateFeeStructure(req, res, next) {
  const { className, feeAmount } = req.body;
  const errors = [];

  if (!className || typeof className !== 'string' || !className.trim()) errors.push('className is required');
  if (!validPositiveNumber(feeAmount)) errors.push('feeAmount must be a positive number');

  if (errors.length) return res.status(400).json({ errors });
  return next();
}

module.exports = {
  validate,
  validateCreatePaymentIntent,
  validateSubmitTransaction,
  validateVerifyPayment,
  validateStudentIdParam,
  validateTxHashParam,
  validateRegisterStudent,
  validateFeeStructure,
};
