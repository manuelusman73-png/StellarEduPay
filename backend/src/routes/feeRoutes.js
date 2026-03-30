'use strict';

const express = require('express');
const router = express.Router();
const { createFeeStructure, getAllFeeStructures, getFeeByClass, deleteFeeStructure } = require('../controllers/feeController');
const { validateFeeStructure } = require('../middleware/validate');
const { resolveSchool } = require('../middleware/schoolContext');
const { requireAdminAuth } = require('../middleware/auth');
const { auditContext } = require('../middleware/auditContext');

// All fee routes require school context
router.use(resolveSchool);

router.post('/',              requireAdminAuth, auditContext, validateFeeStructure, createFeeStructure);
router.get('/',               getAllFeeStructures);
router.get('/:className',         getFeeByClass);
router.delete('/:className',      requireAdminAuth, auditContext, deleteFeeStructure);

module.exports = router;
