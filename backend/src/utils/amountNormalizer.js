/**
 * Amount Normalizer Module
 * 
 * Handles precise transaction amount normalization for Stellar network.
 * Uses Decimal.js to avoid floating-point precision errors common in financial calculations.
 * 
 * Key Features:
 * - Converts amounts to/from base units (stroops for XLM)
 * - Supports multiple assets with configurable precision
 * - Input validation with comprehensive error handling
 * - No floating-point arithmetic - all calculations use Decimal.js
 * 
 * @module utils/amountNormalizer
 */

// Import Decimal.js for precise decimal arithmetic
// Using dynamic import for CommonJS compatibility
let Decimal;

try {
    Decimal = require('decimal.js');
} catch (error) {
    console.error('Decimal.js is required. Install with: npm install decimal.js');
    throw new Error('Missing required dependency: decimal.js');
}

// Load central config for USDC issuer
let centralConfig;
try {
    centralConfig = require('./../../src/config');
} catch (error) {
    centralConfig = null;
}

// Configuration defaults for Stellar network
const DEFAULT_CONFIG = {
    // XLM: 1 XLM = 10^7 stroops
    'XLM': {
        code: 'XLM',
        issuer: null,
        decimals: 7,           // 1 XLM = 10^7 stroops
        displayDecimals: 7,    // Max decimals to display
        baseUnit: 'stroop',
        displayUnit: 'XLM',
        maxAmount: '100000000000',  // 10 billion XLM (network max)
        minAmount: '0.0000001'      // Minimum valid amount
    },
    // USDC on Stellar - same precision as XLM
    'USDC': {
        code: 'USDC',
        issuer: centralConfig?.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', // Use config, fallback to testnet
        decimals: 7,
        displayDecimals: 7,
        baseUnit: 'micro-USDC',
        displayUnit: 'USDC',
        maxAmount: '100000000000',
        minAmount: '0.0000001'
    },
};

// Load configuration from environment variables
function loadConfig() {
    const config = { ...DEFAULT_CONFIG };
    
    // Update USDC issuer from central config if available
    if (centralConfig?.USDC_ISSUER && config.USDC) {
        config.USDC.issuer = centralConfig.USDC_ISSUER;
    }
    
    // Allow environment variable overrides
    if (process.env.AMOUNT_NORMALIZER_CONFIG) {
        try {
            const envConfig = JSON.parse(process.env.AMOUNT_NORMALIZER_CONFIG);
            Object.assign(config, envConfig);
        } catch (error) {
            console.warn('Invalid AMOUNT_NORMALIZER_CONFIG JSON, using defaults');
        }
    }
    
    return config;
}

let assetConfig = loadConfig();

/**
 * Reload configuration from environment
 * Call this after changing environment variables in tests
 */
function reloadConfig() {
    assetConfig = loadConfig();
}

/**
 * Custom error class for amount normalization errors
 */
class AmountNormalizationError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'AmountNormalizationError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Validation error codes
 */
const ErrorCodes = {
    INVALID_INPUT: 'INVALID_INPUT',
    INVALID_TYPE: 'INVALID_TYPE',
    NEGATIVE_AMOUNT: 'NEGATIVE_AMOUNT',
    EXCEEDS_MAX: 'EXCEEDS_MAX',
    BELOW_MIN: 'BELOW_MIN',
    INVALID_PRECISION: 'INVALID_PRECISION',
    UNKNOWN_ASSET: 'UNKNOWN_ASSET',
    EMPTY_INPUT: 'EMPTY_INPUT',
    PARSE_ERROR: 'PARSE_ERROR'
};

/**
 * Check if a value is a valid numeric input
 * @param {any} value - Value to check
 * @returns {boolean}
 */
function isValidNumericInput(value) {
    if (value === null || value === undefined || value === '') {
        return false;
    }
    
    if (typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value)) {
        return true;
    }
    
    if (typeof value === 'string') {
        // Allow string numbers including scientific notation
        const trimmed = value.trim();
        if (trimmed === '') return false;
        return /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(trimmed);
    }
    
    return false;
}

/**
 * Get asset configuration
 * @param {string} assetCode - Asset code (e.g., 'XLM', 'USDC')
 * @param {string} [issuer] - Asset issuer for non-native assets
 * @returns {Object} Asset configuration
 */
function getAssetConfig(assetCode, issuer = null) {
    const code = (assetCode || 'XLM').toUpperCase();
    
    if (!assetConfig[code]) {
        // Create dynamic config for unknown assets
        return {
            code,
            issuer: issuer || null,
            decimals: 7,  // Default to stroop precision
            displayDecimals: 7,
            baseUnit: `micro-${code}`,
            displayUnit: code,
            maxAmount: '100000000000',
            minAmount: '0.0000001'
        };
    }
    
    const config = { ...assetConfig[code] };
    if (issuer) {
        config.issuer = issuer;
    }
    return config;
}

/**
 * Validate input amount
 * @param {string|number} amount - Amount to validate
 * @param {Object} options - Validation options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer
 * @param {boolean} [options.allowNegative=false] - Whether to allow negative amounts
 * @param {boolean} [options.allowZero=true] - Whether to allow zero
 * @param {number} [options.maxPrecision] - Maximum decimal places allowed
 * @returns {Object} Validation result with isValid and error details
 */
function validateAmount(amount, options = {}) {
    const {
        assetCode = 'XLM',
        issuer = null,
        allowNegative = false,
        allowZero = true,
        maxPrecision = null
    } = options;
    
    const config = getAssetConfig(assetCode, issuer);
    
    // Check for empty input
    if (amount === null || amount === undefined || amount === '') {
        return {
            isValid: false,
            error: {
                code: ErrorCodes.EMPTY_INPUT,
                message: 'Amount is required and cannot be empty'
            }
        };
    }
    
    // Check for valid numeric input type
    if (!isValidNumericInput(amount)) {
        return {
            isValid: false,
            error: {
                code: ErrorCodes.INVALID_TYPE,
                message: `Invalid amount format: ${typeof amount} received`,
                received: typeof amount
            }
        };
    }
    
    try {
        // Convert to Decimal for precise validation
        const decimalAmount = new Decimal(amount.toString());
        
        // Check for NaN
        if (decimalAmount.isNaN()) {
            return {
                isValid: false,
                error: {
                    code: ErrorCodes.PARSE_ERROR,
                    message: 'Unable to parse amount as a number'
                }
            };
        }
        
        // Check for negative amounts
        if (!allowNegative && decimalAmount.isNegative()) {
            return {
                isValid: false,
                error: {
                    code: ErrorCodes.NEGATIVE_AMOUNT,
                    message: 'Amount cannot be negative',
                    received: decimalAmount.toString()
                }
            };
        }
        
        // Check for zero
        if (!allowZero && decimalAmount.isZero()) {
            return {
                isValid: false,
                error: {
                    code: ErrorCodes.NEGATIVE_AMOUNT,
                    message: 'Amount cannot be zero',
                    received: '0'
                }
            };
        }
        
        // Check maximum amount
        const maxAmount = new Decimal(config.maxAmount);
        if (decimalAmount.greaterThan(maxAmount)) {
            return {
                isValid: false,
                error: {
                    code: ErrorCodes.EXCEEDS_MAX,
                    message: `Amount exceeds maximum allowed: ${config.maxAmount} ${config.displayUnit}`,
                    max: config.maxAmount,
                    received: decimalAmount.toString()
                }
            };
        }
        
        // Check minimum amount
        const minAmount = new Decimal(config.minAmount);
        if (decimalAmount.greaterThan(0) && decimalAmount.lessThan(minAmount)) {
            return {
                isValid: false,
                error: {
                    code: ErrorCodes.BELOW_MIN,
                    message: `Amount below minimum: ${config.minAmount} ${config.displayUnit}`,
                    min: config.minAmount,
                    received: decimalAmount.toString()
                }
            };
        }
        
        // Check precision (decimal places)
        if (maxPrecision !== null) {
            const decimalPlaces = decimalAmount.decimalPlaces();
            if (decimalPlaces > maxPrecision) {
                return {
                    isValid: false,
                    error: {
                        code: ErrorCodes.INVALID_PRECISION,
                        message: `Amount has too many decimal places. Maximum: ${maxPrecision}`,
                        maxPrecision,
                        received: decimalPlaces
                    }
                };
            }
        }
        
        // Check if exceeds asset's decimal precision
        const assetDecimalPlaces = decimalAmount.decimalPlaces();
        if (assetDecimalPlaces > config.decimals) {
            return {
                isValid: false,
                error: {
                    code: ErrorCodes.INVALID_PRECISION,
                    message: `Amount exceeds ${config.decimals} decimal places for ${config.code}`,
                    maxPrecision: config.decimals,
                    received: assetDecimalPlaces
                }
            };
        }
        
        return {
            isValid: true,
            normalized: decimalAmount.toString(),
            config
        };
        
    } catch (error) {
        return {
            isValid: false,
            error: {
                code: ErrorCodes.PARSE_ERROR,
                message: `Error parsing amount: ${error.message}`
            }
        };
    }
}

/**
 * Convert a display amount to base units (e.g., XLM to stroops)
 * 
 * This is the primary function for converting user input to the integer
 * base unit that the Stellar network uses for amounts.
 * 
 * @param {string|number} displayAmount - Amount in display format (e.g., "10.5" XLM)
 * @param {Object} options - Conversion options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer for non-native assets
 * @param {boolean} [options.validate=true] - Whether to validate input
 * @param {boolean} [options.strictPrecision=true] - Fail if precision would be lost
 * @returns {string} Amount in base units (as string to preserve precision)
 * @throws {AmountNormalizationError} If validation fails or conversion errors
 * 
 * @example
 * // Convert 10 XLM to stroops
 * const stroops = toBaseUnit('10');
 * // Returns: "100000000"
 * 
 * @example
 * // Convert 0.1234567 XLM to stroops
 * const stroops = toBaseUnit('0.1234567');
 * // Returns: "1234567"
 */
function toBaseUnit(displayAmount, options = {}) {
    const {
        assetCode = 'XLM',
        issuer = null,
        validate = true,
        strictPrecision = true
    } = options;
    
    const config = getAssetConfig(assetCode, issuer);
    
    // Validate input if requested
    if (validate) {
        const validation = validateAmount(displayAmount, {
            assetCode,
            issuer,
            allowNegative: false,
            allowZero: true
        });
        
        if (!validation.isValid) {
            throw new AmountNormalizationError(
                validation.error.message,
                validation.error.code,
                validation.error
            );
        }
    }
    
    try {
        const decimal = new Decimal(displayAmount.toString());
        const multiplier = new Decimal(10).pow(config.decimals);
        const baseUnitAmount = decimal.times(multiplier);
        
        // Check if result is an integer (no precision loss)
        if (strictPrecision && !baseUnitAmount.isInteger()) {
            // Round to the nearest valid base unit to avoid silent truncation
            const rounded = baseUnitAmount.round();
            
            // Only warn if rounding would lose more than 1 stroop
            const diff = baseUnitAmount.minus(rounded).abs();
            if (diff.greaterThan(1)) {
                throw new AmountNormalizationError(
                    `Precision loss detected: ${displayAmount} ${config.displayUnit} cannot be exactly represented as ${config.baseUnit}s`,
                    ErrorCodes.INVALID_PRECISION,
                    {
                        original: displayAmount,
                        baseUnit: config.baseUnit,
                        decimals: config.decimals,
                        fractionalPart: baseUnitAmount.decimalPart().toString()
                    }
                );
            }
            
            return rounded.toFixed(0);
        }
        
        // Return as string to preserve full precision
        return baseUnitAmount.toFixed(0);
        
    } catch (error) {
        if (error instanceof AmountNormalizationError) {
            throw error;
        }
        throw new AmountNormalizationError(
            `Failed to convert to base unit: ${error.message}`,
            ErrorCodes.PARSE_ERROR,
            { originalAmount: displayAmount.toString() }
        );
    }
}

/**
 * Convert base units to display format (e.g., stroops to XLM)
 * 
 * This is the primary function for converting Stellar amounts back to
 * human-readable format.
 * 
 * @param {string|number} baseUnitAmount - Amount in base units (e.g., "100000000" stroops)
 * @param {Object} options - Conversion options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer for non-native assets
 * @param {boolean} [options.validate=true] - Whether to validate input
 * @param {number} [options.displayDecimals] - Override display decimal places
 * @param {boolean} [options.removeTrailingZeros=true] - Remove trailing zeros after decimal
 * @returns {string} Amount in display format
 * @throws {AmountNormalizationError} If validation fails
 * 
 * @example
 * // Convert 100000000 stroops to XLM
 * const xlm = fromBaseUnit('100000000');
 * // Returns: "10"
 * 
 * @example
 * // Convert stroops and keep all decimals
 * const xlm = fromBaseUnit('1234567', { displayDecimals: 7 });
 * // Returns: "0.1234567"
 */
function fromBaseUnit(baseUnitAmount, options = {}) {
    const {
        assetCode = 'XLM',
        issuer = null,
        validate = true,
        displayDecimals = null,
        removeTrailingZeros = true
    } = options;
    
    const config = getAssetConfig(assetCode, issuer);
    const decimals = displayDecimals !== null ? displayDecimals : config.displayDecimals;
    
    // Validate input if requested
    if (validate) {
        const validation = validateAmount(baseUnitAmount, {
            assetCode,
            issuer,
            allowNegative: false,
            allowZero: true
        });
        
        if (!validation.isValid) {
            throw new AmountNormalizationError(
                validation.error.message,
                validation.error.code,
                validation.error
            );
        }
    }
    
    try {
        const decimal = new Decimal(baseUnitAmount.toString());
        const divisor = new Decimal(10).pow(decimals);
        const displayAmount = decimal.dividedBy(divisor);
        
        // Format with specified decimal places
        let formatted = displayAmount.toFixed(decimals);
        
        // Remove trailing zeros after decimal point
        if (removeTrailingZeros) {
            formatted = formatted.replace(/\.?0+$/, '');
        }
        
        return formatted;
        
    } catch (error) {
        if (error instanceof AmountNormalizationError) {
            throw error;
        }
        throw new AmountNormalizationError(
            `Failed to convert from base unit: ${error.message}`,
            ErrorCodes.PARSE_ERROR,
            { baseUnitAmount: baseUnitAmount.toString() }
        );
    }
}

/**
 * Add two amounts together (in display format)
 * 
 * @param {string|number} amount1 - First amount
 * @param {string|number} amount2 - Second amount
 * @param {Object} options - Conversion options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer
 * @returns {string} Sum in display format
 * 
 * @example
 * const sum = addAmounts('10.5', '20.25');
 * // Returns: "30.75"
 */
function addAmounts(amount1, amount2, options = {}) {
    const { assetCode = 'XLM', issuer = null } = options;
    
    const decimal1 = new Decimal(amount1.toString());
    const decimal2 = new Decimal(amount2.toString());
    
    return decimal1.plus(decimal2).toString();
}

/**
 * Subtract amount2 from amount1 (in display format)
 * 
 * @param {string|number} amount1 - First amount
 * @param {string|number} amount2 - Amount to subtract
 * @param {Object} options - Conversion options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer
 * @returns {string} Difference in display format
 * 
 * @example
 * const diff = subtractAmounts('50', '20.5');
 * // Returns: "29.5"
 */
function subtractAmounts(amount1, amount2, options = {}) {
    const { assetCode = 'XLM', issuer = null } = options;
    
    const decimal1 = new Decimal(amount1.toString());
    const decimal2 = new Decimal(amount2.toString());
    
    return decimal1.minus(decimal2).toString();
}

/**
 * Multiply an amount (in display format)
 * 
 * @param {string|number} amount - Amount to multiply
 * @param {string|number} multiplier - Multiplier
 * @param {Object} options - Conversion options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer
 * @returns {string} Result in display format
 * 
 * @example
 * const result = multiplyAmount('100', '0.05');
 * // Returns: "5"
 */
function multiplyAmount(amount, multiplier, options = {}) {
    const { assetCode = 'XLM', issuer = null } = options;
    
    const decimal = new Decimal(amount.toString());
    const multiplierDecimal = new Decimal(multiplier.toString());
    
    return decimal.times(multiplierDecimal).toString();
}

/**
 * Divide an amount (in display format)
 * 
 * @param {string|number} amount - Amount to divide
 * @param {string|number} divisor - Divisor
 * @param {Object} options - Conversion options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer
 * @returns {string} Result in display format
 * 
 * @example
 * const result = divideAmounts('100', '4');
 * // Returns: "25"
 */
function divideAmounts(amount, divisor, options = {}) {
    const { assetCode = 'XLM', issuer = null } = options;
    
    const decimal = new Decimal(amount.toString());
    const divisorDecimal = new Decimal(divisor.toString());
    
    if (divisorDecimal.isZero()) {
        throw new AmountNormalizationError(
            'Division by zero',
            ErrorCodes.INVALID_INPUT
        );
    }
    
    return decimal.dividedBy(divisorDecimal).toString();
}

/**
 * Compare two amounts
 * 
 * @param {string|number} amount1 - First amount
 * @param {string|number} amount2 - Second amount
 * @param {Object} options - Comparison options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer
 * @returns {number} -1 if amount1 < amount2, 0 if equal, 1 if amount1 > amount2
 * 
 * @example
 * compareAmounts('10.5', '20');  // Returns: -1
 * compareAmounts('20', '20');     // Returns: 0
 * compareAmounts('30', '20');    // Returns: 1
 */
function compareAmounts(amount1, amount2, options = {}) {
    const { assetCode = 'XLM', issuer = null } = options;
    
    const decimal1 = new Decimal(amount1.toString());
    const decimal2 = new Decimal(amount2.toString());
    
    return decimal1.comparedTo(decimal2);
}

/**
 * Format amount for display with currency symbol
 * 
 * @param {string|number} amount - Amount to format
 * @param {Object} options - Formatting options
 * @param {string} [options.assetCode='XLM'] - Asset code
 * @param {string} [options.issuer] - Asset issuer
 * @param {string} [options.currencySymbol='$'] - Currency symbol
 * @param {number} [options.minDecimals=2] - Minimum decimal places
 * @param {number} [options.maxDecimals] - Maximum decimal places (defaults to asset decimals)
 * @returns {string} Formatted amount
 * 
 * @example
 * formatAmount('1234.56', { currencySymbol: '$' });
 * // Returns: "$1,234.56"
 */
function formatAmount(amount, options = {}) {
    const {
        assetCode = 'XLM',
        issuer = null,
        currencySymbol = '$',
        minDecimals = 2,
        maxDecimals = null
    } = options;
    
    const config = getAssetConfig(assetCode, issuer);
    const decimal = new Decimal(amount.toString());
    const decimals = maxDecimals !== null ? maxDecimals : config.displayDecimals;
    
    // Format with proper decimal places
    const formatted = decimal.toFixed(Math.max(minDecimals, decimals));
    
    // Add thousand separators
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    return currencySymbol + parts.join('.');
}

/**
 * Parse amount from various input formats
 * 
 * Handles inputs like:
 * - "100"
 * - "100.50"
 * - "$100.50"
 * - "100,000.50"
 * - 100.50 (number)
 * 
 * @param {string|number} input - Input to parse
 * @returns {string} Parsed amount as string
 * @throws {AmountNormalizationError} If parsing fails
 */
function parseAmount(input) {
    if (!input || input === '') {
        throw new AmountNormalizationError(
            'Cannot parse empty input',
            ErrorCodes.EMPTY_INPUT
        );
    }
    
    if (typeof input === 'number') {
        if (Number.isNaN(input) || !Number.isFinite(input)) {
            throw new AmountNormalizationError(
                'Invalid number',
                ErrorCodes.PARSE_ERROR
            );
        }
        return input.toString();
    }
    
    if (typeof input !== 'string') {
        throw new AmountNormalizationError(
            `Cannot parse ${typeof input}`,
            ErrorCodes.INVALID_TYPE
        );
    }
    
    // Remove currency symbols and whitespace
    let cleaned = input.trim()
        .replace(/[$€£¥₹]/g, '')
        .replace(/\s/g, '');
    
    // Handle comma as thousands separator (European format)
    // If there's a comma and it's followed by 3 digits, it's a thousands separator
    if (/,\d{3}/.test(cleaned)) {
        cleaned = cleaned.replace(/,/g, '');
    } else {
        // Otherwise comma is decimal separator (European format)
        cleaned = cleaned.replace(',', '.');
    }
    
    // Validate resulting format
    if (!/^-?\d*\.?\d+$/.test(cleaned)) {
        throw new AmountNormalizationError(
            `Cannot parse "${input}" as amount`,
            ErrorCodes.PARSE_ERROR,
            { input }
        );
    }
    
    const decimal = new Decimal(cleaned);
    
    if (decimal.isNaN()) {
        throw new AmountNormalizationError(
            `Cannot parse "${input}" as amount`,
            ErrorCodes.PARSE_ERROR,
            { input }
        );
    }
    
    return decimal.toString();
}

/**
 * Get the precision (decimal places) of an amount
 * 
 * @param {string|number} amount - Amount to check
 * @returns {number} Number of decimal places
 * 
 * @example
 * getPrecision('10.1234');  // Returns: 4
 * getPrecision('10');      // Returns: 0
 */
function getPrecision(amount) {
    const decimal = new Decimal(amount.toString());
    return decimal.decimalPlaces();
}

/**
 * Round amount to specified decimal places
 * 
 * @param {string|number} amount - Amount to round
 * @param {number} decimals - Number of decimal places
 * @param {string} [mode='ROUND_HALF_UP'] - Rounding mode
 * @returns {string} Rounded amount
 * 
 * @example
 * roundAmount('10.125', 2);  // Returns: "10.13"
 * roundAmount('10.124', 2);  // Returns: "10.12"
 */
function roundAmount(amount, decimals, mode = Decimal.ROUND_HALF_UP) {
    const decimal = new Decimal(amount.toString());
    return decimal.toDecimalPlaces(decimals, mode).toString();
}

/**
 * Get maximum amount for an asset
 * 
 * @param {string} [assetCode='XLM'] - Asset code
 * @param {string} [issuer] - Asset issuer
 * @returns {string} Maximum amount in display format
 */
function getMaxAmount(assetCode = 'XLM', issuer = null) {
    const config = getAssetConfig(assetCode, issuer);
    return config.maxAmount;
}

/**
 * Get minimum amount for an asset
 * 
 * @param {string} [assetCode='XLM'] - Asset code
 * @param {string} [issuer] - Asset issuer
 * @returns {string} Minimum amount in display format
 */
function getMinAmount(assetCode = 'XLM', issuer = null) {
    const config = getAssetConfig(assetCode, issuer);
    return config.minAmount;
}

/**
 * Check if an amount is within valid range
 * 
 * @param {string|number} amount - Amount to check
 * @param {string} [assetCode='XLM'] - Asset code
 * @param {string} [issuer] - Asset issuer
 * @returns {boolean} True if amount is within valid range
 */
function isValidRange(amount, assetCode = 'XLM', issuer = null) {
    const validation = validateAmount(amount, { assetCode, issuer });
    return validation.isValid;
}

/**
 * Convert to BigInt for storage (if needed)
 * 
 * Returns the base unit amount as a BigInt string representation.
 * Useful for MongoDB storage to avoid number precision issues.
 * 
 * @param {string|number} displayAmount - Amount in display format
 * @param {Object} options - Conversion options
 * @returns {bigint} Amount as BigInt
 * 
 * @example
 * const bigIntAmount = toBigInt('10.5');
 * // Returns: 105000000n
 */
function toBigInt(displayAmount, options = {}) {
    const baseUnitStr = toBaseUnit(displayAmount, options);
    return BigInt(baseUnitStr);
}

/**
 * Convert from BigInt to display format
 * 
 * @param {bigint} bigIntAmount - Amount as BigInt
 * @param {Object} options - Conversion options
 * @returns {string} Amount in display format
 * 
 * @example
 * const display = fromBigInt(105000000n);
 * // Returns: "10.5"
 */
function fromBigInt(bigIntAmount, options = {}) {
    return fromBaseUnit(bigIntAmount.toString(), options);
}

// Export all functions and constants
module.exports = {
    // Core conversion functions
    toBaseUnit,
    fromBaseUnit,
    
    // Arithmetic functions
    addAmounts,
    subtractAmounts,
    multiplyAmount,
    divideAmounts,
    compareAmounts,
    
    // Formatting and parsing
    formatAmount,
    parseAmount,
    roundAmount,
    getPrecision,
    
    // Validation
    validateAmount,
    isValidNumericInput,
    isValidRange,
    
    // Utility
    getAssetConfig,
    getMaxAmount,
    getMinAmount,
    toBigInt,
    fromBigInt,
    reloadConfig,
    
    // Constants
    ErrorCodes,
    AmountNormalizationError,
    
    // Version info
    VERSION: '1.0.0'
};
