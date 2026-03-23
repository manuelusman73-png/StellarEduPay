const { server, SCHOOL_WALLET, TRANSACTION_TIME_WINDOW_MS } = require('../config/stellarConfig');
const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');

// Helper to check if a transaction is within the accepted time window
function isWithinTimeWindow(createdAt) {
  const txDate = new Date(createdAt);
  const now = new Date();
  return (now - txDate) <= TRANSACTION_TIME_WINDOW_MS;
}

// Fetch recent transactions to the school wallet and record new payments
async function syncPayments() {
  const transactions = await server
    .transactions()
    .forAccount(SCHOOL_WALLET)
    .order('desc')
    .limit(20)
    .call();

  for (const tx of transactions.records) {
    const memo = tx.memo;
    if (!memo) continue;

    // Reject outdated transactions
    if (!isWithinTimeWindow(tx.created_at)) continue;

    const exists = await Payment.findOne({ txHash: tx.hash });
    if (exists) continue;

    const ops = await tx.operations();
    const payOp = ops.records.find(op => op.type === 'payment' && op.to === SCHOOL_WALLET);
    if (!payOp) continue;

    const student = await Student.findOne({ studentId: memo });
    if (!student) continue;

    await Payment.create({
      studentId: memo,
      txHash: tx.hash,
      amount: parseFloat(payOp.amount),
      memo,
      confirmedAt: new Date(tx.created_at),
    });

    await Student.findOneAndUpdate({ studentId: memo }, { feePaid: true });
  }
}

// Verify a single transaction hash against the school wallet
async function verifyTransaction(txHash) {
  const tx = await server.transactions().transaction(txHash).call();
  const ops = await tx.operations();
  const payOp = ops.records.find(op => op.type === 'payment' && op.to === SCHOOL_WALLET);
  if (!payOp) return null;

  // Reject outdated transactions
  if (!isWithinTimeWindow(tx.created_at)) {
    throw new Error('Transaction is too old and cannot be processed.');
  }

  return { hash: tx.hash, memo: tx.memo, amount: parseFloat(payOp.amount), date: tx.created_at };
}

module.exports = { syncPayments, verifyTransaction };
