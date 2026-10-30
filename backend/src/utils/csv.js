/**
 * Minimal RFC 4180 CSV writer.
 * Honeypot data is attacker-controlled (usernames/passwords), so cells that a spreadsheet
 * would evaluate as a formula (=, +, -, @, tab, CR) are prefixed with an apostrophe.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * @param {string[]} header
 * @param {Array<Array<unknown>>} rows
 * @returns {string} CSV text with CRLF line endings
 */
const toCsv = (header, rows) => [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

// Safe filename fragment for Content-Disposition
const fileSafe = (text) => String(text).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 80);

module.exports = { toCsv, csvCell, fileSafe };
