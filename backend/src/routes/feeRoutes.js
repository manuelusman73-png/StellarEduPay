const express = require('express');
const router = express.Router();
const { createFeeStructure, getAllFeeStructures, getFeeByClass, deleteFeeStructure } = require('../controllers/feeController');

router.post('/', createFeeStructure);
router.get('/', getAllFeeStructures);
router.get('/:className', getFeeByClass);
router.delete('/:className', deleteFeeStructure);

module.exports = router;
