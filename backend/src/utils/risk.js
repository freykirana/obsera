/**
 * Risk rules live in shared/risk-rules.js so the dashboard, the API and the reports
 * all score sources and attempts the same way. This module only re-exports them.
 */
const rules = require("../../../shared/risk-rules");

// root plus the explicit privileged accounts, for SQL "privileged account targeted" checks (exact match)
const PRIVILEGED_OR_ROOT_USERNAMES = [rules.ROOT_USERNAME, ...rules.PRIVILEGED_USERNAMES];

module.exports = { ...rules, PRIVILEGED_OR_ROOT_USERNAMES };
