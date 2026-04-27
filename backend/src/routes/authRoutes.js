'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { handleLogin } = require('../controllers/authController');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
});

router.post('/login', loginLimiter, handleLogin);

module.exports = router;
