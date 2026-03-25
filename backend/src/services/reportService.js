'use strict';

const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');

/**
 * Aggregate confirmed payments grouped by date (YYYY-MM-DD), scoped to a school.
 *
 * @param {{ schoolId: string, startDate?: string, endDate?: string }} options
 */
async function aggregateByDate({ schoolId, startDate, endDate } = {}) {
  const match = { schoolId, status: 'confirmed' };

  if (startDate || endDate) {
    match.confirmedAt = {};
    if (startDate) match.confirmedAt.$gte = new Date(startDate + 'T00:00:00.000Z');
    if (endDate)   match.confirmedAt.$lte = new Date(endDate   + 'T23:59:59.999Z');
  }

  const rows = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$confirmedAt' } },
        totalAmount:   { $sum: '$amount' },
        paymentCount:  { $sum: 1 },
        validCount:    { $sum: { $cond: [{ $eq: ['$feeValidationStatus', 'valid'] }, 1, 0] } },
        overpaidCount: { $sum: { $cond: [{ $eq: ['$feeValidationStatus', 'overpaid'] }, 1, 0] } },
        underpaidCount:{ $sum: { $cond: [{ $eq: ['$feeValidationStatus', 'underpaid'] }, 1, 0] } },
        uniqueStudents:{ $addToSet: '$studentId' },
      },
    },
    {
      $project: {
        _id: 0,
        date: '$_id',
        totalAmount: { $round: ['$totalAmount', 7] },
        paymentCount: 1,
        validCount: 1,
        overpaidCount: 1,
        underpaidCount: 1,
        uniqueStudentCount: { $size: '$uniqueStudents' },
      },
    },
    { $sort: { date: 1 } },
  ]);

  return rows;
}

/**
 * Build a full summary report for one school.
 *
 * @param {{ schoolId: string, startDate?: string, endDate?: string }} options
 */
async function generateReport({ schoolId, startDate, endDate } = {}) {
  const byDate = await aggregateByDate({ schoolId, startDate, endDate });

  const totals = byDate.reduce(
    (acc, row) => {
      acc.totalAmount    = parseFloat((acc.totalAmount + row.totalAmount).toFixed(7));
      acc.paymentCount  += row.paymentCount;
      acc.validCount    += row.validCount;
      acc.overpaidCount += row.overpaidCount;
      acc.underpaidCount+= row.underpaidCount;
      return acc;
    },
    { totalAmount: 0, paymentCount: 0, validCount: 0, overpaidCount: 0, underpaidCount: 0 }
  );

  // Count students who have fully paid within the period
  const match = { schoolId, status: 'confirmed' };
  if (startDate || endDate) {
    match.confirmedAt = {};
    if (startDate) match.confirmedAt.$gte = new Date(startDate + 'T00:00:00.000Z');
    if (endDate)   match.confirmedAt.$lte = new Date(endDate   + 'T23:59:59.999Z');
  }

  const paidStudentIds = await Payment.distinct('studentId', match);
  const fullyPaidCount = await Student.countDocuments({
    schoolId,
    studentId: { $in: paidStudentIds },
    feePaid: true,
  });

  return {
    generatedAt: new Date().toISOString(),
    schoolId,
    period: { startDate: startDate || null, endDate: endDate || null },
    summary: { ...totals, fullyPaidStudentCount: fullyPaidCount },
    byDate,
  };
}

/**
 * Convert a report object to CSV string.
 */
function reportToCsv(report) {
  const lines = [];
  lines.push(`Generated At,${report.generatedAt}`);
  lines.push(`School ID,${report.schoolId}`);
  lines.push(`Period Start,${report.period.startDate || 'all time'}`);
  lines.push(`Period End,${report.period.endDate || 'all time'}`);
  lines.push('');
  lines.push('--- Summary ---');
  lines.push(`Total Amount,${report.summary.totalAmount}`);
  lines.push(`Total Payments,${report.summary.paymentCount}`);
  lines.push(`Valid Payments,${report.summary.validCount}`);
  lines.push(`Overpaid,${report.summary.overpaidCount}`);
  lines.push(`Underpaid,${report.summary.underpaidCount}`);
  lines.push(`Fully Paid Students,${report.summary.fullyPaidStudentCount}`);
  lines.push('');
  lines.push('--- Daily Breakdown ---');
  lines.push('Date,Total Amount,Payment Count,Valid,Overpaid,Underpaid,Unique Students');
  for (const row of report.byDate) {
    lines.push([row.date, row.totalAmount, row.paymentCount, row.validCount, row.overpaidCount, row.underpaidCount, row.uniqueStudentCount].join(','));
  }
  return lines.join('\n');
}

module.exports = { generateReport, aggregateByDate, reportToCsv };
