'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  registerStudent,
  getAllStudents,
  getStudent,
  updateStudent,
  deleteStudent,
  getPaymentSummary,
  bulkImportStudents,
  getOverdueStudents,
  resetPayment,
} = require('../controllers/studentController');
const { validateRegisterStudent, validateStudentIdParam } = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');
const { requireAdminAuth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(resolveSchool);

// Admin-only routes
router.post('/', requireAdminAuth, validateRegisterStudent, registerStudent);
router.post('/bulk', requireAdminAuth, upload.single('file'), bulkImportStudents);
router.get('/', requireAdminAuth, getAllStudents);

// Public routes
router.get('/summary', getPaymentSummary);
router.get('/overdue', getOverdueStudents);
router.get('/:studentId', validateStudentIdParam, getStudent);
router.put('/:studentId', requireAdminAuth, validateStudentIdParam, updateStudent);
router.delete('/:studentId', requireAdminAuth, validateStudentIdParam, deleteStudent);
router.post('/:studentId/reset-payment', requireAdminAuth, validateStudentIdParam, resetPayment);

module.exports = router;
