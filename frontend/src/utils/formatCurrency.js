/**
 * Formats a numeric amount as a localized currency string.
 *
 * @param {number} amount
 * @param {string|null|undefined} localCurrency - ISO 4217 currency code (e.g. "USD")
 * @returns {string}
 */
export function formatCurrency(amount, localCurrency) {
  if (!localCurrency) return `${amount}`;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: localCurrency,
    }).format(amount);
  } catch {
    return `${amount} ${localCurrency}`;
  }
}
