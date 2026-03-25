'use strict';

const Student = require('../models/studentModel');
const FeeStructure = require('../models/feeStructureModel');
const csv = require('csv-parser');
const { Readable } = require('stream');

// POST /api/students
async function registerStudent(req, res, next) {
  try {
    const { schoolId } = req;
    const { schoolId } = req; // injected by resolveSchool middleware
    let { studentId, name, class: className, feeAmount } = req.body;
    if (!studentId) {
      const { generateStudentId } = require('../utils/generateStudentId');
      studentId = await generateStudentId();
    }

    // Exact duplicate check by studentId (school-scoped)
    const existingStudent = await Student.findOne({ schoolId, studentId });
    if (existingStudent) {
      const err = new Error(`A student with ID "${studentId}" already exists`);
      err.code = 'DUPLICATE_STUDENT';
      return next(err);
    }

    // Fuzzy duplicate check (same name + class, case-insensitive, school-scoped)
    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const similarStudent = await Student.findOne({
      schoolId,
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
      class: className,
    });

    let assignedFee = feeAmount;
    if (assignedFee == null && className) {
      const feeStructure = await FeeStructure.findOne({ schoolId, className, isActive: true });
      if (feeStructure) assignedFee = feeStructure.feeAmount;
    }

    if (assignedFee == null) {
      const err = new Error(
        `No fee amount provided and no fee structure found for class "${className}" in this school. ` +
        `Please create a fee structure first or provide feeAmount.`
      );
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }

    const student = await Student.create({ schoolId, studentId, name, class: className, feeAmount: assignedFee });
    res.status(201).json(student);

    // Invalidate student list cache since a new student was added
    del(KEYS.studentsAll());

    const response = student.toObject ? student.toObject() : { ...student };
    if (similarStudent) {
      response.warning = `A student named "${similarStudent.name}" already exists in class ${className} with ID "${similarStudent.studentId}". This may be a duplicate.`;
    }
    res.status(201).json(response);
  } catch (err) {
    if (err.code === 11000) {
      const e = new Error('Student ID already exists in this school');
      e.code = 'DUPLICATE_STUDENT';
      e.status = 409;
      return next(e);
    }
    next(err);
  }
}

// GET /api/students
async function getAllStudents(req, res, next) {
  try {
    const cacheKey = KEYS.studentsAll();
    const cached = get(cacheKey);
    if (cached !== undefined) return res.json(cached);

    const students = await Student.find({ schoolId: req.schoolId }).sort({ createdAt: -1 });
    set(cacheKey, students, TTL.STUDENTS);
    res.json(students);
  } catch (err) {
    next(err);
  }
}

// GET /api/students/:studentId
async function getStudent(req, res, next) {
  try {
    const student = await Student.findOne({ schoolId: req.schoolId, studentId: req.params.studentId });
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
    res.json(student);
  } catch (err) {
    next(err);
  }
}

// ── Helpers for bulk import ─────────────────────────────────────────────────────

/**
 * Parse a CSV buffer into an array of row objects.
 * Expected columns: studentId, name, class, feeAmount
 */
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

function validateStudentRow(row, index) {
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

/**
 * POST /api/students/bulk
 *
 * Accepts either:
 *   - A CSV file upload (multipart/form-data, field name "file")
 *   - A JSON body with { students: [...] }
 *
 * Returns per-record results detailing successes and failures.
 */
async function bulkImportStudents(req, res, next) {
  try {
    const { schoolId } = req;
    let rows;

    // ── Determine input format ────────────────────────────────────────────────
    if (req.file) {
      // CSV file upload via multer
      rows = await parseCsvBuffer(req.file.buffer);
    } else if (req.body && Array.isArray(req.body.students)) {
      // JSON array in body
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
      const validationErrors = validateStudentRow(row, i);

      if (validationErrors.length > 0) {
        results.failed++;
        results.details.push({ index: i, studentId: row.studentId || null, status: 'failed', errors: validationErrors });
        continue;
      }

      // Resolve fee from fee structure if not provided
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

    res.status(results.failed === results.total ? 400 : 201).json(results);
  } catch (err) {
    next(err);
  }
}

module.exports = { registerStudent, getAllStudents, getStudent, bulkImportStudents };
