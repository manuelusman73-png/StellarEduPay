'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { handleLogin, handleRefresh, handleLogout, handleMe } = require('../controllers/authController');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});

router.post('/login', loginLimiter, handleLogin);
router.post('/refresh', handleRefresh);
router.post('/logout', handleLogout);
router.get('/me', requireAdminAuth, handleMe);

module.exports = router;
