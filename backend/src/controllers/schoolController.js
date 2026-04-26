'use strict';

const crypto = require('crypto');
const StellarSdk = require('@stellar/stellar-sdk');
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
    if (!stellarAddress)
      errors.push('stellarAddress is required');
    else if (!StellarSdk.StrKey.isValidEd25519PublicKey(stellarAddress))
      errors.push('stellarAddress must be a valid Stellar public key (Ed25519)');
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
    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ errors: validationErrors, code: 'VALIDATION_ERROR' });
    }
    next(err);
  }
}

// GET /api/schools
async function getAllSchools(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === 'true';

    // ?includeInactive=true is admin-only — verify JWT inline
    if (includeInactive) {
      const jwt = require('jsonwebtoken');
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required to include inactive schools.', code: 'MISSING_AUTH_TOKEN' });
      }
      try {
        const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
          return res.status(403).json({ error: 'Admin role required to include inactive schools.', code: 'INSUFFICIENT_ROLE' });
        }
      } catch {
        return res.status(401).json({ error: 'Invalid token.', code: 'INVALID_AUTH_TOKEN' });
      }
    }

    const query = includeInactive ? {} : { isActive: true };
    const schools = await School.find(query).sort({ name: 1 }).lean();
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

    // Validate stellarAddress if being updated
    if (updates.stellarAddress && !StellarSdk.StrKey.isValidEd25519PublicKey(updates.stellarAddress)) {
      return res.status(400).json({
        error: 'stellarAddress must be a valid Stellar public key (Ed25519)',
        code: 'INVALID_STELLAR_ADDRESS',
      });
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
    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
      const validationErrors = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ errors: validationErrors, code: 'VALIDATION_ERROR' });
    }
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

// PATCH /api/schools/:schoolSlug/deactivate
async function deactivateSchoolEndpoint(req, res, next) {
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

    res.json({ message: `School "${school.name}" deactivated`, schoolId: school.schoolId, isActive: false });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/schools/:schoolSlug/activate
async function activateSchool(req, res, next) {
  try {
    const school = await School.findOneAndUpdate(
      { slug: req.params.schoolSlug.toLowerCase() },
      { isActive: true },
      { new: true }
    );
    if (!school) {
      const e = new Error('School not found');
      e.code = 'NOT_FOUND';
      return next(e);
    }

    if (req.auditContext) {
      await logAudit({
        schoolId: school.schoolId,
        action: 'school_activate',
        performedBy: req.auditContext.performedBy,
        targetId: school.schoolId,
        targetType: 'school',
        details: { name: school.name, slug: school.slug },
        result: 'success',
        ipAddress: req.auditContext.ipAddress,
        userAgent: req.auditContext.userAgent,
      });
    }

    res.json({ message: `School "${school.name}" activated`, schoolId: school.schoolId, isActive: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { createSchool, getAllSchools, getSchool, updateSchool, deactivateSchool, deactivateSchoolEndpoint, activateSchool };
