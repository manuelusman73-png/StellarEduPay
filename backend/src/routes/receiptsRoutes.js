'use strict';

const express = require('express');
const router = express.Router();
const { getReceipt } = require('../controllers/receiptsController');
const { resolveSchool } = require('../middleware/schoolContext');
const { validateTxHashParam } = require('../middleware/validate');

router.use(resolveSchool);
router.get('/:txHash', validateTxHashParam, getReceipt);

module.exports = router;
