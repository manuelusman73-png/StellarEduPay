'use strict';

const { getReceiptByTxHash } = require('../services/receiptService');

// GET /api/receipts/:txHash
async function getReceipt(req, res, next) {
  try {
    const receipt = await getReceiptByTxHash(req.params.txHash, req.schoolId);
    if (!receipt) {
      const err = new Error('Receipt not found for this transaction');
      err.code = 'NOT_FOUND';
      return next(err);
    }
    res.json(receipt);
  } catch (err) {
    next(err);
  }
}

module.exports = { getReceipt };
