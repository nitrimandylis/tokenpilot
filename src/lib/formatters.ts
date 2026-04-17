/* ═══════════════════ FORMATTING UTILITIES ═══════════════════ */

/**
 * Format dollar amounts with K suffix for thousands
 * @param n - The numeric amount to format
 * @returns Formatted string with $ prefix (e.g., "$1.5K", "$25", "$94.90", "$0.50")
 * Shows 2 decimals unless the number is a whole integer
 */
export const $ = (n: number): string => {
  if (n >= 1e4) return `$${(n / 1e3).toFixed(1)}K`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  // Always show 2 decimals for amounts under $1000
  return `$${n.toFixed(2)}`;
};

/**
 * Format token counts with K/M/B suffixes for thousands/millions/billions
 * @param n - The token count to format
 * @returns Formatted string (e.g., "1.5B", "25.0M", "150K", "999")
 */
export const T = (n: number): string =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(1)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(1)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(0)}K`
        : String(n);

/**
 * Calculate percentage ratio and format as string
 * @param a - The numerator
 * @param b - The denominator
 * @returns Percentage as whole number string (e.g., "75", "0")
 */
export const P = (a: number, b: number): string =>
  b === 0 ? "0" : ((a / b) * 100).toFixed(0);
