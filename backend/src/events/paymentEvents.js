'use strict';

const { EventEmitter } = require('events');

/**
 * Shared event bus for payment lifecycle events.
 *
 * Events:
 *   'payment.saved'  — emitted by transactionService.savePayment after a
 *                      payment record is successfully persisted to MongoDB.
 *                      Payload: the saved Payment document (plain object).
 */
const paymentEvents = new EventEmitter();

// Prevent silent event-loop leaks when many subscribers are registered.
paymentEvents.setMaxListeners(20);

module.exports = paymentEvents;
