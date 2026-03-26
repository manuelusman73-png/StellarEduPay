'use strict';

const express = require('express');
const router = express.Router();
const {
  createSchool,
  getAllSchools,
  getSchool,
  updateSchool,
  deactivateSchool,
} = require('../controllers/schoolController');
const { requireAdminAuth } = require('../middleware/auth');

// Public read endpoints
router.get('/',                 getAllSchools);
router.get('/:schoolId',        getSchool);

// Admin-only write endpoints — require JWT auth
router.post('/',                requireAdminAuth, createSchool);
router.patch('/:schoolId',      requireAdminAuth, updateSchool);
router.delete('/:schoolId',     requireAdminAuth, deactivateSchool);

module.exports = router;
