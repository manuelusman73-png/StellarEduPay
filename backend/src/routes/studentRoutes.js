'use strict';

const express = require('express');
const router = express.Router();
const { registerStudent, getAllStudents, getStudent, getPaymentSummary, bulkImportStudents } = require('../controllers/studentController');
const multer = require('multer');
const { validateRegisterStudent, validateStudentIdParam } = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');

// Multer configured for in-memory CSV uploads (max 5 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All student routes require school context
router.use(resolveSchool);

router.post('/',             validateRegisterStudent, registerStudent);
router.get('/summary',       getPaymentSummary);
router.post('/bulk',         upload.single('file'),   bulkImportStudents);
router.get('/',              getAllStudents);
router.get('/:studentId',    validateStudentIdParam, getStudent);

module.exports = router;
