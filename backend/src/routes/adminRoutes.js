'use strict';

const express = require('express');
const router = express.Router();
const { setLogLevel } = require('../controllers/adminController');
const { requireAdminAuth } = require('../middleware/auth');
const { auditContext } = require('../middleware/auditContext');

// POST /api/admin/log-level — change log level at runtime
router.post('/log-level', requireAdminAuth, auditContext, setLogLevel);

module.exports = router;
