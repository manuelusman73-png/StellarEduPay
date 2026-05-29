'use strict';

const express = require('express');
const { registry } = require('../metrics');
const { metricsAuth } = require('../middleware/metricsAuth');

const router = express.Router();

router.get('/', metricsAuth, async (req, res, next) => {
  try {
    const output = await registry.metrics();
    res.set('Content-Type', registry.contentType);
    res.end(output);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
