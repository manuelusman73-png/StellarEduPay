'use strict';

const express = require('express');
const router = express.Router();
const { getAuditLogsEndpoint, getRecentAuditLogsEndpoint } = require('../controllers/auditController');
const { resolveSchool } = require('../middleware/schoolContext');
const { requireAdminAuth } = require('../middleware/auth');

// All audit routes require school context and admin authentication
router.use(resolveSchool);
router.use(requireAdminAuth);

router.get('/',       getAuditLogsEndpoint);
router.get('/recent', getRecentAuditLogsEndpoint);

module.exports = router;
