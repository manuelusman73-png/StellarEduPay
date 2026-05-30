'use strict';

/**
 * Tests for Issue #670 — Step-up authentication for stellarAddress changes
 * PATCH /api/schools/:slug requires password confirmation when changing stellarAddress
 */

const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const School = require('../backend/src/models/schoolModel');
const AuditLog = require('../backend/src/models/auditLogModel');

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  StrKey: {
    isValidEd25519PublicKey: jest.fn((key) => /^G[A-Z0-9]{55}$/.test(key)),
  },
}));

// Mock services
jest.mock('../backend/src/services/auditService');
jest.mock('../backend/src/services/stellarAccountVerificationService', () => ({
  verifyStellarAccountFunding: jest.fn().mockResolvedValue({ isFunded: true, warning: null }),
}));

const app = require('../backend/src/app');

describe('Issue #670 — Step-up authentication for stellarAddress changes', () => {
  let schoolId;
  let adminToken;
  const testSecret = 'test-jwt-secret';

  beforeAll(async () => {
    process.env.JWT_SECRET = testSecret;
    process.env.ADMIN_PASSWORD = 'admin-password-123';
    process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/stellaredupay-test';
    
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    // Clear collections
    await School.deleteMany({});
    await AuditLog.deleteMany({});

    // Create test school
    const school = await School.create({
      schoolId: `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      name: 'Test School',
      slug: 'test-school-670',
      stellarAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5V3VF',
      network: 'testnet',
    });
    schoolId = school.schoolId;

    // Create admin token
    adminToken = jwt.sign(
      { role: 'admin', sub: 'admin-user', id: 'admin-user' },
      testSecret,
      { expiresIn: '1h' }
    );
  });

  describe('PATCH /api/schools/:slug with stellarAddress change', () => {
    it('should reject stellarAddress change without confirmPassword', async () => {
      const newAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V3VF';

      const res = await request(app)
        .patch('/api/schools/test-school-670')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stellarAddress: newAddress,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('STEP_UP_REQUIRED');
      expect(res.body.error).toContain('Password confirmation required');
    });

    it('should reject stellarAddress change with incorrect confirmPassword', async () => {
      const newAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V3VF';

      const res = await request(app)
        .patch('/api/schools/test-school-670')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stellarAddress: newAddress,
          confirmPassword: 'wrong-password',
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('STEP_UP_REQUIRED');
    });

    it('should allow stellarAddress change with correct confirmPassword', async () => {
      const newAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V3VF';

      const res = await request(app)
        .patch('/api/schools/test-school-670')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stellarAddress: newAddress,
          confirmPassword: 'admin-password-123',
        });

      expect(res.status).toBe(200);
      expect(res.body.stellarAddress).toBe(newAddress);

      // Verify school was updated
      const updated = await School.findOne({ slug: 'test-school-670' });
      expect(updated.stellarAddress).toBe(newAddress);
    });

    it('should log stellarAddress change as high-severity audit event', async () => {
      const newAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V3VF';

      await request(app)
        .patch('/api/schools/test-school-670')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          stellarAddress: newAddress,
          confirmPassword: 'admin-password-123',
        });

      // Check audit log
      const audit = await AuditLog.findOne({
        schoolId,
        action: 'school_update',
        'details.before.stellarAddress': { $exists: true },
      });

      expect(audit).toBeDefined();
      expect(audit.details.after.stellarAddress).toBe(newAddress);
    });

    it('should not require confirmPassword for other fields', async () => {
      const res = await request(app)
        .patch('/api/schools/test-school-670')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated School Name',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated School Name');
    });

    it('should allow updating multiple fields including stellarAddress with confirmPassword', async () => {
      const newAddress = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBY5V3VF';

      const res = await request(app)
        .patch('/api/schools/test-school-670')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Updated Name',
          stellarAddress: newAddress,
          adminEmail: 'admin@example.com',
          confirmPassword: 'admin-password-123',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.stellarAddress).toBe(newAddress);
      expect(res.body.adminEmail).toBe('admin@example.com');
    });
  });
});
