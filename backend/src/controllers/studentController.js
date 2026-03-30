'use strict';

const Student = require('../models/studentModel');
const FeeStructure = require('../models/feeStructureModel');
const { get, set, del, KEYS, TTL } = require('../cache');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { logAudit } = require('../services/auditService');

async function registerStudent(req, res, next) {
  try {
    const { schoolId } = req;
    let { studentId, name, class: className, feeAmount, parentEmail, parentPhone } = req.body;

    if (!studentId) {
      const { generateStudentId } = require('../utils/generateStudentId');
      studentId = await generateStudentId();
    }

    const existingStudent = await Student.findOne({ schoolId, studentId });
    if (existingStudent) {
      const err = new Error(`A student with ID "${studentId}" already exists`);
      err.code = 'DUPLICATE_STUDENT';
      return next(err);
    }

    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const similarStudent = await Student.findOne({
      schoolId,
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
      class: className,
    });

    let assignedFee = feeAmount;
    let assignedDeadline = null;
    if (assignedFee == null && className) {
      const feeStructure = await FeeStructure.findOne({ schoolId, className, isActive: true });
      if (feeStructure) {
        assignedFee = feeStructure.feeAmount;
        assignedDeadline = feeStructure.paymentDeadline || null;
      }
    }

    if (assignedFee == null) {
      const err = new Error(
        `No fee amount provided and no fee structure found for class "${className}" in this school. ` +
        `Please create a fee structure first or provide feeAmount.`
      );
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }

    const student = await Student.create({ schoolId, studentId, name, class: className, feeAmount: assignedFee, paymentDeadline: assignedDeadline, parentEmail: parentEmail || null, parentPhone: parentPhone || null });

    del(KEYS.studentsAll());

    // Audit log
    if (req.auditContext) {
      await logAudit({
        schoolId,
        action: 'student_create',
        performedBy: req.auditContext.performedBy,
        targetId: studentId,
        targetType: 'student',
        details: { name, class: className, feeAmount: assignedFee },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    const response = student.toObject ? student.toObject() : { ...student };
    if (similarStudent) {
      response.warning = `A student named "${similarStudent.name}" already exists in class ${className} with ID "${similarStudent.studentId}". This may be a duplicate.`;
    }
    res.status(201).json(response);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    }
    if (err.code === 11000) {
      const e = new Error('Student ID already exists in this school');
      e.code = 'DUPLICATE_STUDENT';
      e.status = 409;
      return next(e);
    }
    next(err);
  }
}

async function getAllStudents(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);
    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      Student.find({ schoolId: req.schoolId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Student.countDocuments({ schoolId: req.schoolId }),
    ]);

    res.json({ students, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

async function deleteStudent(req, res, next) {
  try {
    const { studentId } = req.params;
    const student = await Student.findOneAndDelete({ schoolId: req.schoolId, studentId });
    if (!student) {
      const err = new Error('Student not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }
    del(KEYS.student(studentId));

    // Audit log
    if (req.auditContext) {
      await logAudit({
        schoolId: req.schoolId,
        action: 'student_delete',
        performedBy: req.auditContext.performedBy,
        targetId: studentId,
        targetType: 'student',
        details: { name: student.name, class: student.class },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json({ message: `Student ${studentId} deleted` });
  } catch (err) {
    next(err);
  }
}

async function updateStudent(req, res, next) {
  try {
    const { studentId } = req.params;
    const { name, class: className, feeAmount } = req.body;

    const original = await Student.findOne({ schoolId: req.schoolId, studentId }).lean();
    if (!original) {
      const err = new Error('Student not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (className !== undefined) update.class = className;
    if (feeAmount !== undefined) update.feeAmount = feeAmount;

    const student = await Student.findOneAndUpdate(
      { schoolId: req.schoolId, studentId },
      update,
      { new: true, runValidators: true },
    );

    del(KEYS.student(studentId));

    // Audit log
    if (req.auditContext) {
      await logAudit({
        schoolId: req.schoolId,
        action: 'student_update',
        performedBy: req.auditContext.performedBy,
        targetId: studentId,
        targetType: 'student',
        details: {
          before: { name: original.name, class: original.class, feeAmount: original.feeAmount },
          after: { name: student.name, class: student.class, feeAmount: student.feeAmount },
        },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json(student);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message, code: 'VALIDATION_ERROR' });
    }
    next(err);
  }
}

async function getStudent(req, res, next) {
  try {
    const { studentId } = req.params;
    const cacheKey = KEYS.student(studentId);
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const student = await Student.findOne({ schoolId: req.schoolId, studentId });
    if (!student) {
      const err = new Error('Student not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }

    set(cacheKey, student, TTL.STUDENT);
    res.json(student);
  } catch (err) {
    next(err);
  }
}

async function getPaymentSummary(req, res, next) {
  try {
    const Payment = require('../models/paymentModel');

    const [students, payments] = await Promise.all([
      Student.find({ schoolId: req.schoolId }).lean(),
      Payment.aggregate([
        { $match: { schoolId: req.schoolId, status: 'SUCCESS', isSuspicious: { $ne: true } } },
        { $group: { _id: '$studentId', totalPaid: { $sum: '$amount' } } },
      ]),
    ]);

    const paidMap = Object.fromEntries(payments.map(p => [p._id, p.totalPaid]));

    const summary = students.map(s => {
      const totalPaid = parseFloat((paidMap[s.studentId] || 0).toFixed(7));
      const remaining = parseFloat(Math.max(0, s.feeAmount - totalPaid).toFixed(7));
      const status = totalPaid === 0 ? 'unpaid'
        : totalPaid < s.feeAmount ? 'partial'
          : totalPaid > s.feeAmount ? 'overpaid'
            : 'paid';

      return {
        studentId: s.studentId,
        name: s.name,
        class: s.class,
        feeAmount: s.feeAmount,
        totalPaid,
        remaining,
        status,
      };
    });

    const counts = summary.reduce((acc, s) => { acc[s.status] = (acc[s.status] || 0) + 1; return acc; }, {});

    res.json({ total: students.length, counts, students: summary });
  } catch (err) {
    next(err);
  }
}

// ── Helpers for bulk import ──────────────────────────────────────────────────

function parseCsvBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer);
    stream
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', (err) => reject(err));
  });
}

const STUDENT_ID_RE = /^[A-Za-z0-9_-]{3,20}$/;

function validateStudentRow(row) {
  const errors = [];
  if (!row.studentId || !STUDENT_ID_RE.test(row.studentId)) {
    errors.push('studentId must be 3–20 alphanumeric characters');
  }
  if (!row.name || typeof row.name !== 'string' || !row.name.trim()) {
    errors.push('name is required');
  }
  if (!row.class || typeof row.class !== 'string' || !row.class.trim()) {
    errors.push('class is required');
  }
  if (row.feeAmount != null && row.feeAmount !== '') {
    const n = Number(row.feeAmount);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('feeAmount must be a positive number');
    }
  }
  return errors;
}

// POST /api/students/bulk
async function bulkImportStudents(req, res, next) {
  try {
    const { schoolId } = req;
    let rows;

    if (req.file) {
      rows = await parseCsvBuffer(req.file.buffer);
    } else if (req.body && Array.isArray(req.body.students)) {
      rows = req.body.students;
    } else {
      return res.status(400).json({
        error: 'Provide a CSV file (field "file") or a JSON body with { "students": [...] }',
        code: 'VALIDATION_ERROR',
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No student records found in input', code: 'VALIDATION_ERROR' });
    }

    const results = { total: rows.length, created: 0, failed: 0, details: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const validationErrors = validateStudentRow(row);

      if (validationErrors.length > 0) {
        results.failed++;
        results.details.push({ index: i, studentId: row.studentId || null, status: 'failed', errors: validationErrors });
        continue;
      }

      let assignedFee = row.feeAmount != null && row.feeAmount !== '' ? Number(row.feeAmount) : null;
      if (assignedFee == null && row.class) {
        const feeStructure = await FeeStructure.findOne({ schoolId, className: row.class.trim(), isActive: true });
        if (feeStructure) assignedFee = feeStructure.feeAmount;
      }

      if (assignedFee == null) {
        results.failed++;
        results.details.push({
          index: i,
          studentId: row.studentId,
          status: 'failed',
          errors: [`No feeAmount provided and no fee structure found for class "${row.class}"`],
        });
        continue;
      }

      try {
        const student = await Student.create({
          schoolId,
          studentId: row.studentId.trim(),
          name: row.name.trim(),
          class: row.class.trim(),
          feeAmount: assignedFee,
          parentEmail: row.parentEmail ? row.parentEmail.trim().toLowerCase() : null,
          parentPhone: row.parentPhone ? row.parentPhone.trim() : null,
        });
        results.created++;
        results.details.push({ index: i, studentId: student.studentId, status: 'created', _id: student._id });
      } catch (err) {
        results.failed++;
        const message = err.code === 11000
          ? 'Student ID already exists in this school'
          : err.message;
        results.details.push({ index: i, studentId: row.studentId, status: 'failed', errors: [message] });
      }
    }

    del(KEYS.studentsAll());

    // Audit log for bulk import
    if (req.auditContext) {
      await logAudit({
        schoolId,
        action: 'student_bulk_import',
        performedBy: req.auditContext.performedBy,
        targetId: 'bulk',
        targetType: 'student',
        details: { total: results.total, created: results.created, failed: results.failed },
        result: results.created > 0 ? 'success' : 'failure',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.status(results.failed === results.total ? 400 : 201).json(results);
  } catch (err) {
    next(err);
  }
}

async function getOverdueStudents(req, res, next) {
  try {
    const now = new Date();
    const students = await Student.find({
      schoolId: req.schoolId,
      feePaid: false,
      paymentDeadline: { $lt: now, $ne: null },
    }).lean();
    res.json(students.map(s => ({ ...s, isOverdue: true })));
  } catch (err) {
    next(err);
  }
}

async function resetPayment(req, res, next) {
  try {
    const { studentId } = req.params;
    const { deletePayments = false } = req.body;
    const schoolId = req.schoolId;

    // Find the student
    const student = await Student.findOne({ schoolId, studentId });
    if (!student) {
      const err = new Error('Student not found');
      err.code = 'NOT_FOUND';
      return next(err);
    }

    // Reset feePaid status
    student.feePaid = false;
    student.totalPaid = 0;
    student.remainingBalance = student.feeAmount;
    await student.save();

    // Log the reset action
    const logger = require('../utils/logger');
    logger.info('Payment status reset', {
      studentId,
      schoolId,
      adminId: req.user?.id,
      timestamp: new Date().toISOString(),
      deletePayments,
    });

    // Optionally delete associated payment records
    if (deletePayments) {
      const Payment = require('../models/paymentModel');
      const deleteResult = await Payment.deleteMany({ schoolId, studentId });
      logger.info('Payment records deleted', {
        studentId,
        schoolId,
        adminId: req.user?.id,
        deletedCount: deleteResult.deletedCount,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      message: 'Payment status reset successfully',
      student: {
        studentId: student.studentId,
        name: student.name,
        feePaid: student.feePaid,
        totalPaid: student.totalPaid,
        remainingBalance: student.remainingBalance,
      },
      paymentsDeleted: deletePayments,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerStudent, getAllStudents, getStudent, updateStudent, deleteStudent, getPaymentSummary, bulkImportStudents, getOverdueStudents, resetPayment };
