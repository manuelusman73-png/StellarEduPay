'use strict';

const PaymentPlan = require('../models/paymentPlanModel');
const Student = require('../models/studentModel');
const { logAudit } = require('./auditService');

async function createPaymentPlan(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.params;
    const { installments } = req.body;

    if (!Array.isArray(installments) || installments.length === 0) {
      return res.status(400).json({ error: 'At least one installment is required', code: 'VALIDATION_ERROR' });
    }

    const student = await Student.findOne({ schoolId, studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student not found', code: 'NOT_FOUND' });
    }

    const totalAmount = installments.reduce((sum, inst) => sum + inst.amount, 0);

    const plan = await PaymentPlan.create({
      schoolId,
      studentId,
      totalAmount,
      installments: installments.map(inst => ({
        amount: inst.amount,
        dueDate: new Date(inst.dueDate),
        paid: false,
        paidAmount: 0,
      })),
    });

    if (req.auditContext) {
      await logAudit({
        schoolId,
        action: 'payment_plan_create',
        performedBy: req.auditContext.performedBy,
        targetId: studentId,
        targetType: 'payment_plan',
        details: { totalAmount, installmentCount: installments.length },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
}

async function getPaymentPlan(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.params;

    const plan = await PaymentPlan.findOne({ schoolId, studentId, deletedAt: null });
    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found', code: 'NOT_FOUND' });
    }

    res.json(plan);
  } catch (err) {
    next(err);
  }
}

async function updateInstallmentStatus(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId, installmentIndex } = req.params;
    const { paid, paidAmount } = req.body;

    const plan = await PaymentPlan.findOne({ schoolId, studentId, deletedAt: null });
    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found', code: 'NOT_FOUND' });
    }

    if (installmentIndex < 0 || installmentIndex >= plan.installments.length) {
      return res.status(400).json({ error: 'Invalid installment index', code: 'VALIDATION_ERROR' });
    }

    const installment = plan.installments[installmentIndex];
    installment.paid = paid;
    installment.paidAmount = paidAmount || installment.amount;
    if (paid) {
      installment.paidAt = new Date();
    }

    await plan.save();

    if (req.auditContext) {
      await logAudit({
        schoolId,
        action: 'installment_update',
        performedBy: req.auditContext.performedBy,
        targetId: studentId,
        targetType: 'payment_plan',
        details: { installmentIndex, paid, paidAmount },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json(plan);
  } catch (err) {
    next(err);
  }
}

async function cancelPaymentPlan(req, res, next) {
  try {
    const { schoolId } = req;
    const { studentId } = req.params;

    const plan = await PaymentPlan.findOne({ schoolId, studentId, deletedAt: null });
    if (!plan) {
      return res.status(404).json({ error: 'Payment plan not found', code: 'NOT_FOUND' });
    }

    plan.status = 'cancelled';
    plan.deletedAt = new Date();
    await plan.save();

    if (req.auditContext) {
      await logAudit({
        schoolId,
        action: 'payment_plan_cancel',
        performedBy: req.auditContext.performedBy,
        targetId: studentId,
        targetType: 'payment_plan',
        details: {},
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json({ message: 'Payment plan cancelled' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPaymentPlan,
  getPaymentPlan,
  updateInstallmentStatus,
  cancelPaymentPlan,
};
