const express = require('express');
const router = express.Router();
const { registerStudent, getAllStudents, getStudent } = require('../controllers/studentController');
const { validateRegisterStudent, validateStudentIdParam } = require('../middleware/validate');

router.post('/', validateRegisterStudent, registerStudent);
router.get('/', getAllStudents);
router.get('/:studentId', validateStudentIdParam, getStudent);

module.exports = router;
