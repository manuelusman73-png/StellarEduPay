'use strict';

/**
 * Soft Delete Utility (Issue #77)
 */

const softDelete = (schema) => {
  // Add deletedAt field
  schema.add({
    deletedAt: { 
      type: Date, 
      default: null, 
      index: true 
    }
  });

  // Instance methods
  schema.methods.softDelete = async function () {
    this.deletedAt = new Date();
    return await this.save();
  };

  schema.methods.restore = async function () {
    this.deletedAt = null;
    return await this.save();
  };

  // Static methods
  schema.statics.softDelete = async function (filter) {
    return await this.updateMany(filter, { deletedAt: new Date() });
  };

  schema.statics.restore = async function (filter) {
    return await this.updateMany(filter, { deletedAt: null });
  };

  // Query middleware - automatically exclude deleted records
  const excludeDeleted = function (next) {
    const query = this.getQuery ? this.getQuery() : this;
    if (!query.deletedAt) {
      query.deletedAt = null;
    }
    next();
  };

  schema.pre('find', excludeDeleted);
  schema.pre('findOne', excludeDeleted);
  schema.pre('findOneAndUpdate', excludeDeleted);
  schema.pre('countDocuments', excludeDeleted);
};

module.exports = softDelete;