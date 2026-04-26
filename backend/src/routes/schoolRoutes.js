'use strict';

const express = require('express');
const router = express.Router();
const {
  createSchool,
  getAllSchools,
  getSchool,
  updateSchool,
  deactivateSchool,
  deactivateSchoolEndpoint,
  activateSchool,
} = require('../controllers/schoolController');
const { requireAdminAuth } = require('../middleware/auth');
const { auditContext } = require('../middleware/auditContext');

// Public read endpoints
router.get('/',                 getAllSchools);
router.get('/:schoolId',        getSchool);

// Admin-only write endpoints — require JWT auth
router.post('/',                requireAdminAuth, auditContext, createSchool);
router.patch('/:schoolId',      requireAdminAuth, auditContext, updateSchool);
router.delete('/:schoolId',     requireAdminAuth, auditContext, deactivateSchool);

// Explicit activate / deactivate endpoints
router.patch('/:schoolId/deactivate', requireAdminAuth, auditContext, deactivateSchoolEndpoint);
router.patch('/:schoolId/activate',   requireAdminAuth, auditContext, activateSchool);

module.exports = router;
