# Contributing to StellarEduPay

Thank you for your interest in contributing to StellarEduPay! This guide will help you get started with development, understand our conventions, and successfully submit your first pull request.

---

## 📋 Table of Contents

- [Getting Started](#-getting-started)
- [Development Setup](#-development-setup)
- [Branch Naming Convention](#-branch-naming-convention)
- [Commit Message Guidelines](#-commit-message-guidelines)
- [Coding Standards](#-coding-standards)
- [Testing Requirements](#-testing-requirements)
- [Pull Request Process](#-pull-request-process)
- [Architecture Guidelines](#-architecture-guidelines)
- [Security Best Practices](#-security-best-practices)

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **npm** (v9 or higher)
- **MongoDB** (v7 or higher) OR **Docker** (for containerized setup)
- **Redis** (v6 or higher) - required for BullMQ retry queue
- **Git** for version control

### First-Time Setup

1. **Fork and Clone the Repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/stellaredupay.git
   cd stellaredupay
   ```

2. **Install Dependencies**
   ```bash
   # Root dependencies (for testing)
   npm install
   
   # Backend dependencies
   cd backend
   npm install
   
   # Frontend dependencies
   cd ../frontend
   npm install
   cd ..
   ```

3. **Configure Environment Variables**
   
   Copy the example environment files and configure them:
   ```bash
   # Root environment
   cp .env.example .env
   
   # Backend environment
   cp backend/.env.example backend/.env
   
   # Frontend environment
   cp frontend/.env.example frontend/.env.local
   ```

4. **Set Up Stellar Testnet Wallet**
   
   - Visit [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test)
   - Generate a new keypair for testing
   - Fund your testnet wallet using [Friendbot](https://friendbot.stellar.org/)
   - Add the public key to `SCHOOL_WALLET_ADDRESS` in your `.env` files

5. **Start Required Services**
   
   **Option A: Using Docker (Recommended)**
   ```bash
   docker-compose up -d mongo redis
   ```
   
   **Option B: Local Installation**
   - Start MongoDB on port 27017
   - Start Redis on port 6379

6. **Run the Application**
   ```bash
   # Terminal 1: Start backend
   cd backend
   npm run dev
   
   # Terminal 2: Start frontend
   cd frontend
   npm run dev
   ```

7. **Verify Setup**
   - Backend: http://localhost:5000/api/health
   - Frontend: http://localhost:3000

---

## 💻 Development Setup

### Running with Docker

For a complete containerized environment:

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down
```

### Database Migrations

If you need to run database migrations:

```bash
cd backend
node migrations/001_backfill_remaining_balance.js
```

---

## 🌿 Branch Naming Convention

Use the following prefixes for your branches:

- `feature/` - New features or enhancements
  - Example: `feature/add-payment-reminders`
  
- `fix/` - Bug fixes
  - Example: `fix/transaction-polling-race-condition`
  
- `docs/` - Documentation updates
  - Example: `docs/update-api-spec`
  
- `refactor/` - Code refactoring without behavior changes
  - Example: `refactor/extract-stellar-client`
  
- `test/` - Adding or updating tests
  - Example: `test/add-fee-adjustment-tests`
  
- `chore/` - Maintenance tasks, dependency updates
  - Example: `chore/update-stellar-sdk`

**Branch Naming Rules:**
- Use lowercase with hyphens
- Be descriptive but concise
- Reference issue number when applicable: `fix/123-payment-validation`

---

## 📝 Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, no logic change)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Examples

```bash
feat(payments): add payment reminder scheduler

Implements automated email reminders for overdue payments.
Includes configurable cooldown period and max reminder count.

Closes #45

---

fix(stellar): handle rate limit errors from Horizon API

Added exponential backoff retry logic when Horizon returns 429.

Fixes #67

---

docs(api): update payment endpoints documentation

Added examples for bulk payment verification endpoint.
```

### Commit Rules

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to..." not "moves cursor to...")
- First line should be 50 characters or less
- Reference issues and PRs in the footer

---

## 📐 Coding Standards

### JavaScript/Node.js Style

- Use **ES6+ syntax** (async/await, arrow functions, destructuring)
- Use **2 spaces** for indentation
- Use **single quotes** for strings
- Add **semicolons** at the end of statements
- Use **camelCase** for variables and functions
- Use **PascalCase** for classes and React components
- Use **UPPER_SNAKE_CASE** for constants

### Code Organization

**Backend Structure:**
```
backend/src/
├── routes/          # Express route definitions only
├── controllers/     # Request/response handling, no business logic
├── services/        # Business logic and external API calls
├── models/          # Mongoose schemas and database models
├── middleware/      # Express middleware (auth, validation, etc.)
├── utils/           # Helper functions and utilities
└── config/          # Configuration files
```

**Frontend Structure:**
```
frontend/src/
├── pages/           # Next.js pages (routing)
├── components/      # Reusable React components
├── services/        # API client and external services
└── styles/          # CSS and styling
```

### Best Practices

- **Keep functions small and focused** - Each function should do one thing well
- **Use meaningful variable names** - Avoid abbreviations unless widely understood
- **Add JSDoc comments** for public functions and complex logic
- **Handle errors gracefully** - Always catch and log errors appropriately
- **Avoid hardcoding values** - Use environment variables or configuration files
- **Validate inputs** - Use Joi schemas for API validation
- **Use async/await** - Prefer async/await over raw promises

### Example Code Style

```javascript
// Good
const calculateTotalFees = async (studentId, feeStructureId) => {
  try {
    const student = await Student.findById(studentId);
    if (!student) {
      throw new Error('Student not found');
    }
    
    const feeStructure = await FeeStructure.findById(feeStructureId);
    return feeStructure.calculateTotal(student);
  } catch (error) {
    logger.error('Failed to calculate fees', { studentId, error });
    throw error;
  }
};

// Bad
const calc = (sid, fid) => {
  return Student.findById(sid).then(s => {
    return FeeStructure.findById(fid).then(f => f.calculateTotal(s));
  });
};
```

---

## 🧪 Testing Requirements

### Running Tests

```bash
# Run all tests (from project root)
npm test

# Run specific test file
npm test -- tests/payment.test.js

# Run with coverage
npm test -- --coverage
```

### Test Coverage Requirements

- **New features** must include unit tests
- **Bug fixes** should include regression tests
- **API endpoints** require integration tests
- **Critical services** (Stellar integration, payment processing) require comprehensive test coverage

### Writing Tests

We use **Jest** as our testing framework. Tests should:

- Be isolated and not depend on external services
- Mock Stellar SDK calls to avoid hitting the network
- Use descriptive test names that explain the scenario
- Follow the Arrange-Act-Assert pattern

**Example Test:**

```javascript
describe('Payment Validation', () => {
  it('should reject payments below minimum amount', async () => {
    // Arrange
    const payment = { amount: 0.001, studentId: 'STU001' };
    
    // Act
    const result = await validatePayment(payment);
    
    // Assert
    expect(result.valid).toBe(false);
    expect(result.error).toContain('below minimum');
  });
});
```

---

## 🔄 Pull Request Process

### Before Submitting

1. **Sync with main branch**
   ```bash
   git checkout main
   git pull origin main
   git checkout your-branch
   git rebase main
   ```

2. **Run all checks locally**
   ```bash
   # Run tests (from project root)
   npm test
   
   # Check backend syntax
   node -c backend/src/app.js
   ```

3. **Update documentation**
   - Update `docs/api-spec.md` if you changed API endpoints
   - Update `README.md` if you added new features or changed setup
   - Add inline code comments for complex logic

### Submitting Your PR

1. **Push your branch**
   ```bash
   git push origin your-branch-name
   ```

2. **Create Pull Request on GitHub**
   - Use a clear, descriptive title
   - Reference the issue: "Closes #123" or "Fixes #456"
   - Describe what changed and why
   - Include screenshots for UI changes
   - List any breaking changes

3. **PR Template**
   ```markdown
   ## Description
   Brief description of changes
   
   ## Related Issue
   Closes #123
   
   ## Changes Made
   - Added payment reminder scheduler
   - Updated email notification service
   - Added tests for reminder logic
   
   ## Testing
   - [ ] Unit tests added/updated
   - [ ] Manual testing completed
   - [ ] No console errors
   
   ## Screenshots (if applicable)
   [Add screenshots for UI changes]
   ```

### PR Review Requirements

Your PR must meet these criteria before merging:

- [ ] **Tests passing** - All existing and new tests must pass
- [ ] **No merge conflicts** - Rebase on latest main if needed
- [ ] **Code review approved** - At least one maintainer approval required
- [ ] **Documentation updated** - Relevant docs reflect your changes
- [ ] **Follows conventions** - Branch naming, commit messages, code style
- [ ] **No sensitive data** - No secrets, API keys, or PII in code

### Review Process

1. Maintainers will review your PR within 2-3 business days
2. Address any requested changes by pushing new commits
3. Once approved, a maintainer will merge your PR
4. Your branch will be automatically deleted after merge

---

## 🏗 Architecture Guidelines

### Service-Oriented Architecture

We follow a strict **Service-Oriented Architecture**. To maintain the codebase:

#### Backend Layer Responsibilities

**Routes (`backend/src/routes/`)**
- Define endpoints only
- Apply middleware (auth, validation, rate limiting)
- Delegate to controllers

**Controllers (`backend/src/controllers/`)**
- Extract request data
- Call service methods
- Format responses
- **Do not put business logic here**

**Services (`backend/src/services/`)**
- Contains all business logic
- Handles external API calls (Stellar Horizon, webhooks)
- Manages database transactions
- All Stellar-specific logic **must** go into `stellarService.js`

**Models (`backend/src/models/`)**
- Mongoose schemas
- Database validation rules
- Instance methods for model-specific operations

**Middleware (`backend/src/middleware/`)**
- Authentication and authorization
- Request validation (Joi schemas)
- Error handling
- Rate limiting and idempotency

#### Frontend Architecture

- Use **Functional Components** with React Hooks
- Style with **Tailwind CSS** (via `globals.css`)
- UI components in `frontend/src/components/`
- Page-level logic in `frontend/src/pages/`
- All backend communication through `frontend/src/services/api.js`

### Adding New Features

When adding a new feature:

1. **Update API spec first** - Document in `docs/api-spec.md`
2. **Create service layer** - Add business logic to appropriate service
3. **Add controller** - Create controller to handle HTTP requests
4. **Define routes** - Add routes with proper middleware
5. **Add validation** - Create Joi schema in `middleware/schemas/`
6. **Write tests** - Add unit and integration tests
7. **Update docs** - Document in relevant markdown files

---

## 🔐 Security Best Practices

As a blockchain-based payment system, security is paramount:

### Environment Variables
- Never hardcode sensitive values (wallet addresses, secret keys, API keys)
- Refer to `.env.example` files for required configuration
- Use `process.env` to access environment variables
- Never commit `.env` files to version control

### Stellar Protocol Security
- **Memo Validation:** Always ensure `studentId` is passed correctly in the Stellar Memo field
- **Secret Keys:** Never log or store secret keys. Only use public keys for ledger lookups
- **Amount Validation:** Use `amountNormalizer.js` for safe decimal handling
- **Transaction Verification:** Always verify transactions against the blockchain

### API Security
- Use JWT authentication for protected endpoints
- Implement rate limiting on all public endpoints
- Validate all inputs with Joi schemas
- Use idempotency keys for payment operations
- Sanitize user inputs to prevent injection attacks

### Data Privacy
- Never log sensitive information (passwords, secret keys, PII)
- Use memo encryption when handling student IDs (see `MEMO_ENCRYPTION_KEY`)
- Follow GDPR principles for data handling

---

## 🧪 Testing Standards

We maintain a high bar for reliability with comprehensive test coverage.

### Test Types

**Unit Tests**
- Test individual functions and utilities
- Mock external dependencies (Stellar SDK, database)
- Focus on edge cases and error handling

**Integration Tests**
- Test complete API flows
- Verify database operations
- Test middleware chains

**Example Test Structure:**

```javascript
describe('Fee Adjustment Engine', () => {
  beforeEach(() => {
    // Setup test data
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  it('should apply early payment discount', async () => {
    // Arrange
    const payment = { amount: 100, dueDate: '2026-04-30' };
    
    // Act
    const adjusted = await feeAdjustmentEngine.apply(payment);
    
    // Assert
    expect(adjusted.finalAmount).toBe(95);
    expect(adjusted.discountApplied).toBe(5);
  });
});
```

### Running Tests

```bash
# Run all backend tests
cd backend
npm test

# Run specific test file
npm test -- tests/verify_fee_validation.js

# Run with coverage
npm test -- --coverage
```

### Test Requirements for PRs

- All new features must include tests
- Bug fixes should include regression tests
- Tests must pass before PR can be merged
- Aim for meaningful test coverage, not just high percentages

---

## 📐 Coding Standards

### JavaScript Style Guide

**General Rules:**
- Use ES6+ syntax (async/await, arrow functions, destructuring)
- 2 spaces for indentation
- Single quotes for strings
- Semicolons at end of statements
- Max line length: 100 characters

**Naming Conventions:**
- `camelCase` for variables and functions
- `PascalCase` for classes and React components
- `UPPER_SNAKE_CASE` for constants
- Prefix private methods with underscore: `_privateMethod`

**File Naming:**
- `camelCase.js` for utilities and services
- `PascalCase.jsx` for React components
- `kebab-case.js` for routes and middleware

### Code Quality

**Functions:**
- Keep functions small and focused (single responsibility)
- Use descriptive names that explain what the function does
- Limit parameters to 3-4; use options object for more
- Add JSDoc comments for public APIs

**Error Handling:**
- Always use try-catch for async operations
- Log errors with context using the logger utility
- Throw meaningful error messages
- Use custom error classes when appropriate

**Comments:**
- Write self-documenting code first
- Add comments for complex business logic
- Explain "why" not "what"
- Keep comments up-to-date with code changes

### Example Code Style

```javascript
/**
 * Processes a payment transaction and updates student balance
 * @param {string} studentId - The student's unique identifier
 * @param {Object} transaction - Stellar transaction object
 * @returns {Promise<Object>} Updated payment record
 */
const processPayment = async (studentId, transaction) => {
  try {
    const student = await Student.findOne({ studentId });
    if (!student) {
      throw new Error(`Student not found: ${studentId}`);
    }
    
    const amount = amountNormalizer.fromStroops(transaction.amount);
    const payment = await Payment.create({
      studentId,
      amount,
      transactionHash: transaction.hash,
      status: 'confirmed'
    });
    
    await student.updateBalance(amount);
    logger.info('Payment processed', { studentId, amount, hash: transaction.hash });
    
    return payment;
  } catch (error) {
    logger.error('Payment processing failed', { studentId, error });
    throw error;
  }
};
```

---

## 🔄 Pull Request Process

### 1. Before Creating PR

- [ ] Sync with latest main branch
- [ ] All tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation is updated
- [ ] No console.log or debug code remains
- [ ] Environment variables are documented in `.env.example`

### 2. Creating the PR

**Title Format:**
```
<type>(<scope>): <description>

Examples:
feat(payments): add automated reminder system
fix(stellar): resolve transaction polling race condition
docs(api): update webhook integration guide
```

**Description Template:**
```markdown
## Description
Clear description of what this PR does and why.

## Related Issue
Closes #123

## Changes Made
- Added payment reminder scheduler service
- Updated notification service with email templates
- Added reminder configuration to .env.example

## Testing Done
- [ ] Unit tests added for reminder logic
- [ ] Integration tests for email sending
- [ ] Manual testing with testnet wallet
- [ ] Verified no regression in existing features

## Screenshots
[If UI changes, add before/after screenshots]

## Breaking Changes
[List any breaking changes or migration steps needed]

## Checklist
- [ ] Tests passing
- [ ] Documentation updated
- [ ] No merge conflicts
- [ ] Follows coding standards
- [ ] Environment variables documented
```

### 3. PR Review Checklist

Your PR will be reviewed for:

- **Functionality** - Does it solve the problem correctly?
- **Code Quality** - Is it readable, maintainable, and well-structured?
- **Tests** - Are there adequate tests with good coverage?
- **Documentation** - Are changes documented appropriately?
- **Security** - Are there any security concerns?
- **Performance** - Does it introduce performance issues?
- **Breaking Changes** - Are breaking changes clearly documented?

### 4. Addressing Review Feedback

- Respond to all review comments
- Push additional commits to address feedback
- Mark conversations as resolved once addressed
- Request re-review when ready

### 5. Merge Requirements

Before your PR can be merged:

- [ ] At least one maintainer approval
- [ ] All CI checks passing (when CI is configured)
- [ ] All review comments addressed
- [ ] No merge conflicts with main
- [ ] Documentation complete

---

## 🏛 Architecture Guidelines

### Service Layer Principles

**Stellar Service (`stellarService.js`)**
- All Horizon API calls go here
- Transaction parsing and validation
- Memo extraction and decryption
- Use `stellarRateLimitedClient.js` for rate-limited calls

**Payment Service (`paymentService.js`)**
- Payment creation and verification
- Student balance updates
- Payment status management

**Transaction Service (`transactionService.js`)**
- Transaction polling and syncing
- Retry logic for failed transactions
- Idempotency handling

### Database Best Practices

- Use Mongoose models for all database operations
- Implement soft deletes (see `utils/softDelete.js`)
- Use transactions for multi-document updates
- Index frequently queried fields
- Validate data at schema level

### API Design

- Follow RESTful conventions
- Use proper HTTP status codes
- Return consistent response format (see `utils/responseHelper.js`)
- Version APIs when making breaking changes
- Document all endpoints in `docs/api-spec.md`

### Error Handling

- Use centralized error handler middleware
- Return user-friendly error messages
- Log detailed error context for debugging
- Use appropriate HTTP status codes

---

## 🔍 Code Review Guidelines

When reviewing others' PRs:

- Be respectful and constructive
- Ask questions to understand the approach
- Suggest improvements, don't demand them
- Approve when code meets standards, even if not perfect
- Focus on correctness, security, and maintainability

---

## 📚 Additional Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Stellar SDK for JavaScript](https://stellar.github.io/js-stellar-sdk/)
- [MongoDB Best Practices](https://www.mongodb.com/docs/manual/administration/production-notes/)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Next.js Documentation](https://nextjs.org/docs)

---

## 🆘 Getting Help

- **Questions?** Open a [GitHub Discussion](https://github.com/yourusername/stellaredupay/discussions)
- **Bug Reports?** Open an [Issue](https://github.com/yourusername/stellaredupay/issues)
- **Security Concerns?** Email security@yourproject.com (do not open public issues)

---

## 📄 License

By contributing to StellarEduPay, you agree that your contributions will be licensed under the MIT License.

---

*Thank you for helping us eliminate manual reconciliation and fraud in school payments!*
