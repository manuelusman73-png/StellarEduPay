'use strict';

const express = require('express');
const router  = express.Router();

const { flagDispute, getDisputes, getDisputeById, resolveDispute } = require('../controllers/dispute.controller');
const { resolveSchool } = require('../middleware/schoolContext');
const { requireAdminAuth } = require('../middleware/auth');

// All dispute routes require school context
router.use(resolveSchool);

// Anyone with school context can raise or view disputes
router.post('/',        flagDispute);
router.get('/',         getDisputes);
router.get('/:id',      getDisputeById);

// Only admins can update dispute status / resolve
router.patch('/:id/resolve', requireAdminAuth, resolveDispute);

module.exports = router;
