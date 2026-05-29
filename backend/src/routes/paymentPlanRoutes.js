'use strict';

const express = require('express');
const router = express.Router();
const {
  createPaymentPlan,
  getPaymentPlan,
  updateInstallmentStatus,
  cancelPaymentPlan,
} = require('../controllers/paymentPlanController');
const { resolveSchool } = require('../middleware/schoolContext');
const { requireAdminAuth } = require('../middleware/auth');
const { auditContext } = require('../middleware/auditContext');
const { validateStudentIdParam } = require('../middleware/validate');

router.use(resolveSchool);

router.post('/:studentId', requireAdminAuth, auditContext, validateStudentIdParam, createPaymentPlan);
router.get('/:studentId', validateStudentIdParam, getPaymentPlan);
router.patch('/:studentId/installment/:installmentIndex', requireAdminAuth, auditContext, validateStudentIdParam, updateInstallmentStatus);
router.delete('/:studentId', requireAdminAuth, auditContext, validateStudentIdParam, cancelPaymentPlan);

module.exports = router;
