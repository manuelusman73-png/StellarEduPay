'use strict';

const Payment = require('../models/paymentModel');
const Student = require('../models/studentModel');
const FeeStructure = require('../models/feeStructureModel');

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

  // Per-class breakdown: total collected, paid/unpaid student counts, payment count
  const byClass = await Payment.aggregate([
    { $match: { ...match, studentId: { $exists: true } } },
    {
      $lookup: {
        from: 'students',
        localField: 'studentId',
        foreignField: 'studentId',
        as: 'student',
      },
    },
    { $unwind: { path: '$student', preserveNullAndEmpty: false } },
    {
      $group: {
        _id: '$student.class',
        totalCollected: { $sum: '$amount' },
        paymentCount: { $sum: 1 },
        paidStudentIds: { $addToSet: { $cond: ['$student.feePaid', '$studentId', '$$REMOVE'] } },
        unpaidStudentIds: { $addToSet: { $cond: ['$student.feePaid', '$$REMOVE', '$studentId'] } },
      },
    },
    {
      $project: {
        _id: 0,
        className: '$_id',
        totalCollected: { $round: ['$totalCollected', 7] },
        paymentCount: 1,
        paidCount: { $size: '$paidStudentIds' },
        unpaidCount: { $size: '$unpaidStudentIds' },
      },
    },
    { $sort: { className: 1 } },
  ]);

  return {
    generatedAt: new Date().toISOString(),
    schoolId,
    period: { startDate: startDate || null, endDate: endDate || null },
    summary: { ...totals, fullyPaidStudentCount: fullyPaidCount },
    byDate,
    byClass,
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
  if (report.byClass && report.byClass.length > 0) {
    lines.push('');
    lines.push('--- Class Breakdown ---');
    lines.push('Class,Total Collected,Payment Count,Paid Students,Unpaid Students');
    for (const row of report.byClass) {
      lines.push([row.className, row.totalCollected, row.paymentCount, row.paidCount, row.unpaidCount].join(','));
    }
  }
  return lines.join('\n');
}

/**
 * Aggregate dashboard metrics for a school.
 * @param {{ schoolId: string }} options
 */
async function getDashboardMetrics({ schoolId } = {}) {
  const now = new Date();
  const startOfToday = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');

  const [
    totalStudents,
    paidStudents,
    overdueStudents,
    paymentTotals,
    todayTotals,
    byClass,
    recentPayments,
  ] = await Promise.all([
    Student.countDocuments({ schoolId }),
    Student.countDocuments({ schoolId, feePaid: true }),
    Student.countDocuments({ schoolId, feePaid: false, paymentDeadline: { $lt: now, $ne: null } }),

    // All-time confirmed payment totals
    Payment.aggregate([
      { $match: { schoolId, status: 'SUCCESS' } },
      { $group: { _id: null, totalCollected: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Today's payments
    Payment.aggregate([
      { $match: { schoolId, status: 'SUCCESS', confirmedAt: { $gte: startOfToday } } },
      { $group: { _id: null, totalCollected: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Per-class breakdown
    Student.aggregate([
      { $match: { schoolId } },
      {
        $group: {
          _id: '$class',
          totalStudents:  { $sum: 1 },
          paidStudents:   { $sum: { $cond: ['$feePaid', 1, 0] } },
          totalFees:      { $sum: '$feeAmount' },
          totalPaid:      { $sum: '$totalPaid' },
        },
      },
      {
        $project: {
          _id: 0,
          class: '$_id',
          totalStudents: 1,
          paidStudents: 1,
          unpaidStudents: { $subtract: ['$totalStudents', '$paidStudents'] },
          totalFees:  { $round: ['$totalFees', 7] },
          totalPaid:  { $round: ['$totalPaid', 7] },
          outstanding: { $round: [{ $subtract: ['$totalFees', '$totalPaid'] }, 7] },
        },
      },
      { $sort: { class: 1 } },
    ]),

    // 5 most recent successful payments
    Payment.find({ schoolId, status: 'SUCCESS' })
      .sort({ confirmedAt: -1 })
      .limit(5)
      .select('txHash studentId amount feeValidationStatus confirmedAt')
      .lean(),
  ]);

  const collected = paymentTotals[0] || { totalCollected: 0, count: 0 };
  const today     = todayTotals[0]   || { totalCollected: 0, count: 0 };

  // Expected total fees across all students
  const feeAgg = await Student.aggregate([
    { $match: { schoolId } },
    { $group: { _id: null, totalExpected: { $sum: '$feeAmount' }, totalPaid: { $sum: '$totalPaid' } } },
  ]);
  const feeRow = feeAgg[0] || { totalExpected: 0, totalPaid: 0 };

  return {
    generatedAt: now.toISOString(),
    students: {
      total:   totalStudents,
      paid:    paidStudents,
      unpaid:  totalStudents - paidStudents,
      overdue: overdueStudents,
    },
    fees: {
      totalExpected:   parseFloat(feeRow.totalExpected.toFixed(7)),
      totalCollected:  parseFloat(collected.totalCollected.toFixed(7)),
      outstanding:     parseFloat(Math.max(0, feeRow.totalExpected - feeRow.totalPaid).toFixed(7)),
      collectionRate:  feeRow.totalExpected > 0
        ? parseFloat((feeRow.totalPaid / feeRow.totalExpected * 100).toFixed(2))
        : 0,
    },
    today: {
      totalCollected: parseFloat(today.totalCollected.toFixed(7)),
      paymentCount:   today.count,
    },
    byClass,
    recentPayments,
  };
}

module.exports = { generateReport, aggregateByDate, reportToCsv, getDashboardMetrics };
