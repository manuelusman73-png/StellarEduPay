'use strict';

const express = require('express');
const router = express.Router();
const { createRule, listRules, updateRule, deleteRule } = require('../controllers/feeAdjustmentController');
const { resolveSchool } = require('../middleware/schoolContext');
const { requireAdminAuth } = require('../middleware/auth');

router.use(resolveSchool);

router.post('/',     requireAdminAuth, createRule);
router.get('/',      listRules);
router.put('/:id',   requireAdminAuth, updateRule);
router.delete('/:id', requireAdminAuth, deleteRule);

module.exports = router;
