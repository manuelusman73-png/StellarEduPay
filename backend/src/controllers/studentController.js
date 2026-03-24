const Student = require('../models/studentModel');
const FeeStructure = require('../models/feeStructureModel');

// POST /api/students
async function registerStudent(req, res, next) {
  try {
    const { studentId, name, class: className, feeAmount } = req.body;

    let assignedFee = feeAmount;
    if (assignedFee == null && className) {
      const feeStructure = await FeeStructure.findOne({ className, isActive: true });
      if (feeStructure) assignedFee = feeStructure.feeAmount;
    }

    if (assignedFee == null) {
      const err = new Error(`No fee amount provided and no fee structure found for class "${className}". Please create a fee structure first or provide feeAmount.`);
      err.code = 'VALIDATION_ERROR';
      return next(err);
    }

    const student = await Student.create({ studentId, name, class: className, feeAmount: assignedFee });
    res.status(201).json(student);
  } catch (err) {
    next(err);
  }
}

// GET /api/students
async function getAllStudents(req, res, next) {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    next(err);
  }
}

// GET /api/students/:studentId
async function getStudent(req, res, next) {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
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

module.exports = { registerStudent, getAllStudents, getStudent };
