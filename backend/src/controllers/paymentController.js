const Payment = require('../models/paymentModel');
const { syncPayments, verifyTransaction, finalizeConfirmedPayments } = require('../services/stellarService');
const { SCHOOL_WALLET, ACCEPTED_ASSETS } = require('../config/stellarConfig');

// GET /api/payments/instructions/:studentId
async function getPaymentInstructions(req, res) {
  try {
    const { studentId } = req.params;
    res.json({
      walletAddress: SCHOOL_WALLET,
      memo: studentId,
      acceptedAssets: Object.values(ACCEPTED_ASSETS).map(a => ({
        code: a.code,
        type: a.type,
        displayName: a.displayName,
      })),
      note: 'Include the student ID exactly as the memo when sending payment. Only the listed assets are accepted.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/payments/verify
async function verifyPayment(req, res) {
  try {
    const { txHash } = req.body;
    const result = await verifyTransaction(txHash);
    if (!result) return res.status(404).json({ error: 'Payment not found or invalid' });
    if (result.error === 'unsupported_asset') {
      return res.status(400).json({
        error: `Unsupported asset: ${result.assetCode}. Accepted assets: ${Object.keys(ACCEPTED_ASSETS).join(', ')}`,
      });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/payments/sync
async function syncAllPayments(req, res) {
  try {
    await syncPayments();
    res.json({ message: 'Sync complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/payments/:studentId
async function getStudentPayments(req, res) {
  try {
    const payments = await Payment.find({ studentId: req.params.studentId }).sort({ confirmedAt: -1 });
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/payments/accepted-assets
async function getAcceptedAssets(req, res) {
  try {
    const assets = Object.values(ACCEPTED_ASSETS).map(a => ({
      code: a.code,
      type: a.type,
      displayName: a.displayName,
    }));
    res.json({ assets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/payments/overpayments
async function getOverpayments(req, res) {
  try {
    const overpayments = await Payment.find({ feeValidationStatus: 'overpaid' })
      .sort({ confirmedAt: -1 });
    const totalExcess = overpayments.reduce((sum, p) => sum + (p.excessAmount || 0), 0);
    res.json({ count: overpayments.length, totalExcess, overpayments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/payments/balance/:studentId
async function getStudentBalance(req, res) {
  try {
    const Student = require('../models/studentModel');
    const { studentId } = req.params;
    const student = await Student.findOne({ studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const result = await Payment.aggregate([
      { $match: { studentId } },
      { $group: { _id: null, totalPaid: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const totalPaid = result.length ? parseFloat(result[0].totalPaid.toFixed(7)) : 0;
    const remainingBalance = parseFloat(Math.max(0, student.feeAmount - totalPaid).toFixed(7));
    const excessAmount = totalPaid > student.feeAmount
      ? parseFloat((totalPaid - student.feeAmount).toFixed(7))
      : 0;

    res.json({
      studentId,
      feeAmount: student.feeAmount,
      totalPaid,
      remainingBalance,
      excessAmount,
      feePaid: totalPaid >= student.feeAmount,
      installmentCount: result.length ? result[0].count : 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/payments/suspicious
async function getSuspiciousPayments(req, res) {
  try {
    const suspicious = await Payment.find({ isSuspicious: true }).sort({ confirmedAt: -1 });
    res.json({ count: suspicious.length, suspicious });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/payments/pending
async function getPendingPayments(req, res) {
  try {
    const pending = await Payment.find({ confirmationStatus: 'pending_confirmation' }).sort({ confirmedAt: -1 });
    res.json({ count: pending.length, pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/payments/finalize
async function finalizePayments(req, res) {
  try {
    await finalizeConfirmedPayments();
    res.json({ message: 'Finalization complete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getPaymentInstructions, verifyPayment, syncAllPayments, getStudentPayments, getAcceptedAssets, getOverpayments, getStudentBalance, getSuspiciousPayments, getPendingPayments, finalizePayments };
