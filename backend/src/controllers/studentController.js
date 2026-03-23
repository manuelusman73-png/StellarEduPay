const Student = require('../models/studentModel');
const FeeStructure = require('../models/feeStructureModel');

// POST /api/students — register a new student, auto-assign fee from fee structure
async function registerStudent(req, res) {
  try {
    const { studentId, name, class: className, feeAmount } = req.body;

    // If feeAmount is not explicitly provided, look up the fee structure for the class
    let assignedFee = feeAmount;
    if (assignedFee == null && className) {
      const feeStructure = await FeeStructure.findOne({ className, isActive: true });
      if (feeStructure) {
        assignedFee = feeStructure.feeAmount;
      }
    }

    if (assignedFee == null) {
      return res.status(400).json({
        error: `No fee amount provided and no fee structure found for class "${className}". Please create a fee structure first or provide feeAmount.`,
      });
    }

    const student = await Student.create({
      studentId,
      name,
      class: className,
      feeAmount: assignedFee,
    });
    res.status(201).json(student);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /api/students
async function getAllStudents(req, res) {
  try {
    const students = await Student.find().sort({ createdAt: -1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/students/:studentId
async function getStudent(req, res) {
  try {
    const student = await Student.findOne({ studentId: req.params.studentId });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { registerStudent, getAllStudents, getStudent };
