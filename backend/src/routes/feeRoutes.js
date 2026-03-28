'use strict';

const express = require('express');
const router = express.Router();
const { createFeeStructure, getAllFeeStructures, getFeeByClass, deleteFeeStructure } = require('../controllers/feeController');
const { validateFeeStructure } = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');

// All fee routes require school context
router.use(resolveSchool);

router.post('/',              validateFeeStructure, createFeeStructure);
router.get('/',               getAllFeeStructures);
router.get('/:className',         getFeeByClass);
router.delete('/:className',      deleteFeeStructure);

module.exports = router;
