# Changelog

All notable changes to StellarEduPay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Per-class breakdown (`byClass`) in `GET /api/reports` response and CSV export (#433)
- CPU and memory resource limits for all Docker Compose services (`backend`, `frontend`, `mongo`) with environment-variable overrides (#434)
- This `CHANGELOG.md` to track changes between versions (#435)

### Fixed
- Moved `nodemon` from `dependencies` to `devDependencies` in `backend/package.json` to prevent it from being installed in production Docker images (#436)

## [1.0.0] - 2026-04-21

### Added
- Blockchain-based school fee payment system built on the Stellar network
- Automatic payment reconciliation via Stellar transaction memo field (student ID)
- Multi-asset support: XLM (native) and USDC (stablecoin)
- Fee validation with `valid`, `overpaid`, `underpaid`, and `unknown` statuses
- Configurable payment limits (`MIN_PAYMENT_AMOUNT`, `MAX_PAYMENT_AMOUNT`)
- Background polling for new Stellar transactions (`transactionService`)
- Automatic retry mechanism for failed verifications (`retryService`)
- RESTful API for students, fees, payments, and reports
- Payment idempotency to prevent duplicate transaction recording
- Concurrent payment processor with queue-depth backpressure
- TTL index on payment intents to expire stale records
- Docker Compose setup with MongoDB authentication and automated backups
- Comprehensive Jest test suite (unit + integration, no real network required)
- QR code payment support with Stellar URI scheme
- Dispute management endpoints
- Soft-delete support for student records
- Request logging middleware
- CSP and CORS security headers via Helmet
- SSE (Server-Sent Events) endpoint for real-time payment notifications
- Migration runner for database schema changes
- Testnet banner warning when running against Stellar testnet
