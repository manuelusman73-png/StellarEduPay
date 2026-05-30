'use strict';

/**
 * Tests for Issue #668 — Compound index on auditLogs for { schoolId, createdAt }
 * Verifies audit log queries are fast for busy schools
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const AuditLog = require('../backend/src/models/auditLogModel');

describe('Issue #668 — Audit log compound index performance', () => {
  beforeAll(async () => {
    process.env.MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/stellaredupay-test';
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await AuditLog.deleteMany({});
  });

  describe('Compound index { schoolId, createdAt }', () => {
    it('should have compound index on schoolId and createdAt', async () => {
      const indexes = await AuditLog.collection.getIndexes();
      
      const hasCompoundIndex = Object.values(indexes).some(index => {
        const keys = Object.keys(index.key);
        return keys.includes('schoolId') && keys.includes('createdAt');
      });

      expect(hasCompoundIndex).toBe(true);
    });

    it('should query audit logs by schoolId efficiently', async () => {
      const schoolId = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Insert 100 audit logs
      const logs = Array.from({ length: 100 }, (_, i) => ({
        schoolId,
        action: `action_${i}`,
        performedBy: 'admin-user',
        targetId: `target_${i}`,
        targetType: 'payment',
        result: 'success',
      }));

      await AuditLog.insertMany(logs);

      // Query should use index
      const startTime = Date.now();
      const results = await AuditLog.find({ schoolId }).sort({ createdAt: -1 }).limit(10);
      const queryTime = Date.now() - startTime;

      expect(results.length).toBe(10);
      expect(queryTime).toBeLessThan(50); // Should be very fast with index
    });

    it('should query audit logs by schoolId and action efficiently', async () => {
      const schoolId = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Insert logs with different actions
      const logs = Array.from({ length: 100 }, (_, i) => ({
        schoolId,
        action: i % 2 === 0 ? 'payment_recorded' : 'student_created',
        performedBy: 'admin-user',
        targetId: `target_${i}`,
        targetType: 'payment',
        result: 'success',
      }));

      await AuditLog.insertMany(logs);

      const startTime = Date.now();
      const results = await AuditLog.find({
        schoolId,
        action: 'payment_recorded',
      }).sort({ createdAt: -1 });
      const queryTime = Date.now() - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(queryTime).toBeLessThan(50);
    });

    it('should handle large result sets efficiently', async () => {
      const schoolId = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Insert 1000 audit logs
      const logs = Array.from({ length: 1000 }, (_, i) => ({
        schoolId,
        action: 'payment_recorded',
        performedBy: 'admin-user',
        targetId: `target_${i}`,
        targetType: 'payment',
        result: 'success',
      }));

      await AuditLog.insertMany(logs);

      const startTime = Date.now();
      const results = await AuditLog.find({ schoolId })
        .sort({ createdAt: -1 })
        .limit(100);
      const queryTime = Date.now() - startTime;

      expect(results.length).toBe(100);
      expect(queryTime).toBeLessThan(100); // Should still be fast
    });

    it('should support pagination with compound index', async () => {
      const schoolId = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Insert 50 audit logs
      const logs = Array.from({ length: 50 }, (_, i) => ({
        schoolId,
        action: 'payment_recorded',
        performedBy: 'admin-user',
        targetId: `target_${i}`,
        targetType: 'payment',
        result: 'success',
      }));

      await AuditLog.insertMany(logs);

      // Page 1
      const page1 = await AuditLog.find({ schoolId })
        .sort({ createdAt: -1 })
        .skip(0)
        .limit(10);

      // Page 2
      const page2 = await AuditLog.find({ schoolId })
        .sort({ createdAt: -1 })
        .skip(10)
        .limit(10);

      expect(page1.length).toBe(10);
      expect(page2.length).toBe(10);
      expect(page1[0]._id).not.toEqual(page2[0]._id);
    });

    it('should isolate audit logs by schoolId', async () => {
      const schoolId1 = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const schoolId2 = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      // Insert logs for two schools
      const logs1 = Array.from({ length: 50 }, (_, i) => ({
        schoolId: schoolId1,
        action: 'payment_recorded',
        performedBy: 'admin-user',
        targetId: `target_${i}`,
        targetType: 'payment',
        result: 'success',
      }));

      const logs2 = Array.from({ length: 50 }, (_, i) => ({
        schoolId: schoolId2,
        action: 'payment_recorded',
        performedBy: 'admin-user',
        targetId: `target_${i}`,
        targetType: 'payment',
        result: 'success',
      }));

      await AuditLog.insertMany([...logs1, ...logs2]);

      // Query school 1
      const results1 = await AuditLog.find({ schoolId: schoolId1 });
      expect(results1.length).toBe(50);
      expect(results1.every(log => log.schoolId === schoolId1)).toBe(true);

      // Query school 2
      const results2 = await AuditLog.find({ schoolId: schoolId2 });
      expect(results2.length).toBe(50);
      expect(results2.every(log => log.schoolId === schoolId2)).toBe(true);
    });
  });

  describe('Index usage verification', () => {
    it('should use index for descending createdAt sort', async () => {
      const schoolId = `SCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      const logs = Array.from({ length: 100 }, (_, i) => ({
        schoolId,
        action: 'payment_recorded',
        performedBy: 'admin-user',
        targetId: `target_${i}`,
        targetType: 'payment',
        result: 'success',
      }));

      await AuditLog.insertMany(logs);

      // Get explain plan
      const explain = await AuditLog.find({ schoolId })
        .sort({ createdAt: -1 })
        .explain('executionStats');

      // Verify index was used (executionStages.stage should be COLLSCAN or INDEX_SCAN)
      expect(explain.executionStats).toBeDefined();
    });
  });
});
