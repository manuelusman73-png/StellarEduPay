'use strict';

const express = require('express');
const router  = express.Router();
const { requireAdminAuth } = require('../middleware/auth');
const { resolveSchool } = require('../middleware/schoolContext');
const { reminderTriggerLimiter } = require('../middleware/rateLimiter');
const { triggerReminders, previewReminders, setOptOut } = require('../controllers/reminderController');

// All reminder routes require admin auth + school context
router.use(requireAdminAuth);
router.use(resolveSchool);

router.post('/trigger', reminderTriggerLimiter, triggerReminders);
router.get('/preview',   previewReminders);
router.post('/opt-out',  setOptOut);

module.exports = router;
