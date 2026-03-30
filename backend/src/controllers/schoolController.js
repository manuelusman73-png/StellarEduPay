'use strict';

const crypto = require('crypto');
const School = require('../models/schoolModel');
const { logAudit } = require('../services/auditService');

// POST /api/schools
async function createSchool(req, res, next) {
  try {
    const { name, slug, stellarAddress, network, adminEmail, address } = req.body;

    const errors = [];
    if (!name || typeof name !== 'string' || !name.trim())
      errors.push('name is required');
    if (!slug || !/^[a-z0-9-]{2,60}$/.test(slug.trim().toLowerCase()))
      errors.push('slug must be 2–60 lowercase alphanumeric characters or hyphens');
    if (!stellarAddress || !/^G[A-Z2-7]{55}$/.test(stellarAddress))
      errors.push('stellarAddress must be a valid Stellar public key (starts with G, 56 chars)');
    if (network && !['testnet', 'mainnet'].includes(network))
      errors.push('network must be "testnet" or "mainnet"');
    if (errors.length) return res.status(400).json({ errors, code: 'VALIDATION_ERROR' });

    const schoolId = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const school = await School.create({
      schoolId,
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      stellarAddress,
      network: network || 'testnet',
      adminEmail: adminEmail || null,
      address: address || null,
    });

    // Audit log
    if (req.auditContext) {
      await logAudit({
        schoolId,
        action: 'school_create',
        performedBy: req.auditContext.performedBy,
        targetId: schoolId,
        targetType: 'school',
        details: { name, slug, stellarAddress, network: network || 'testnet' },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.status(201).json(school);
  } catch (err) {
    if (err.code === 11000) {
      const field = err.message.includes('slug') ? 'slug' : 'schoolId';
      const e = new Error(`A school with this ${field} already exists`);
      e.code = 'DUPLICATE_SCHOOL';
      e.status = 409;
      return next(e);
    }
    next(err);
  }
}

// GET /api/schools
async function getAllSchools(req, res, next) {
  try {
    const schools = await School.find({ isActive: true }).sort({ name: 1 }).lean();
    res.json(schools);
  } catch (err) {
    next(err);
  }
}

// GET /api/schools/:schoolSlug
async function getSchool(req, res, next) {
  try {
    const school = await School.findOne({
      slug: req.params.schoolSlug.toLowerCase(),
      isActive: true,
    }).lean();
    if (!school) {
      const e = new Error('School not found');
      e.code = 'NOT_FOUND';
      return next(e);
    }
    res.json(school);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/schools/:schoolSlug
async function updateSchool(req, res, next) {
  try {
    const allowed = ['name', 'stellarAddress', 'network', 'adminEmail', 'address'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    const original = await School.findOne({ slug: req.params.schoolSlug.toLowerCase(), isActive: true }).lean();
    if (!original) {
      const e = new Error('School not found');
      e.code = 'NOT_FOUND';
      return next(e);
    }

    const school = await School.findOneAndUpdate(
      { slug: req.params.schoolSlug.toLowerCase(), isActive: true },
      updates,
      { new: true, runValidators: true }
    );

    // Audit log
    if (req.auditContext) {
      await logAudit({
        schoolId: school.schoolId,
        action: 'school_update',
        performedBy: req.auditContext.performedBy,
        targetId: school.schoolId,
        targetType: 'school',
        details: { before: original, after: updates },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json(school);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/schools/:schoolSlug  (soft-delete)
async function deactivateSchool(req, res, next) {
  try {
    const school = await School.findOneAndUpdate(
      { slug: req.params.schoolSlug.toLowerCase() },
      { isActive: false },
      { new: true }
    );
    if (!school) {
      const e = new Error('School not found');
      e.code = 'NOT_FOUND';
      return next(e);
    }

    // Audit log
    if (req.auditContext) {
      await logAudit({
        schoolId: school.schoolId,
        action: 'school_deactivate',
        performedBy: req.auditContext.performedBy,
        targetId: school.schoolId,
        targetType: 'school',
        details: { name: school.name, slug: school.slug },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json({ message: `School "${school.name}" deactivated` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createSchool, getAllSchools, getSchool, updateSchool, deactivateSchool };
