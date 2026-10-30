/**
 * Risk rules shared by the dashboard (Next.js) and the backend (API, reports, exports).
 * Plain CommonJS with no dependencies so both runtimes load this same file; the report's
 * methodology appendix prints its definitions straight from here.
 *
 * Two scales:
 * - Source risk (per attacking IP): decided by attempt volume only, the same thresholds the
 *   Attack Logs riskLevel filter uses in SQL. Rate and targeted accounts are context.
 * - Attempt risk (per login attempt): decided by the credentials tried (threat vectors).
 */

// =========================================================================
// SOURCE RISK
// =========================================================================

const RISK_THRESHOLDS = { medium: 100, high: 500 };

// Attempts per minute above which a source is treated as an automated tool
const HIGH_RATE_PER_MINUTE = 30;

const riskLevelForAttempts = (attempts) => {
  if (attempts > RISK_THRESHOLDS.high) return "High";
  if (attempts > RISK_THRESHOLDS.medium) return "Medium";
  return "Low";
};

const formatCount = (n) => Number(n).toLocaleString("en-US");

/**
 * @param {{ attempts: number, attemptsPerMinute?: number|null, uniqueUsernames?: number|null, privilegedTargeted?: boolean|null, rootTargeted?: boolean|null }} input
 * @returns {{ level: "High"|"Medium"|"Low", factors: Array<{ label: string, value: string, note: string, decisive: boolean }>, reasons: string[] }}
 */
const assessRisk = ({ attempts, attemptsPerMinute = null, uniqueUsernames = null, privilegedTargeted = null, rootTargeted = null }) => {
  const level = riskLevelForAttempts(attempts);
  const factors = [
    {
      label: "Attempt volume",
      value: `${formatCount(attempts)} attempts`,
      note: `Low ≤ ${RISK_THRESHOLDS.medium} · Medium ${RISK_THRESHOLDS.medium + 1}–${RISK_THRESHOLDS.high} · High > ${RISK_THRESHOLDS.high}`,
      decisive: true,
    },
  ];
  // Short phrases for tables ("> 500 attempts, high rate, root tried")
  const reasons = [];
  if (level === "High") reasons.push(`> ${RISK_THRESHOLDS.high} attempts`);
  else if (level === "Medium") reasons.push(`> ${RISK_THRESHOLDS.medium} attempts`);
  else reasons.push(`≤ ${RISK_THRESHOLDS.medium} attempts`);

  if (attemptsPerMinute !== null && attemptsPerMinute !== undefined) {
    factors.push({
      label: "Attack rate",
      value: `${formatCount(attemptsPerMinute)} attempts/min`,
      note: "First to last attempt, minimum 1 minute",
      decisive: false,
    });
    if (attemptsPerMinute > HIGH_RATE_PER_MINUTE) reasons.push("high rate");
  }
  if (uniqueUsernames !== null && uniqueUsernames !== undefined) {
    factors.push({
      label: "Username variety",
      value: `${formatCount(uniqueUsernames)} distinct usernames`,
      note: "Many usernames suggests a wordlist attack",
      decisive: false,
    });
  }
  if (rootTargeted) reasons.push("root tried");
  if (privilegedTargeted !== null && privilegedTargeted !== undefined) {
    factors.push({
      label: "Privileged accounts",
      value: privilegedTargeted ? "Targeted" : "Not targeted",
      note: `Tried root or any of: ${PRIVILEGED_USERNAMES.join(", ")}`,
      decisive: false,
    });
    if (privilegedTargeted && !rootTargeted) reasons.push("privileged accounts tried");
  }

  return { level, factors, reasons };
};

// =========================================================================
// CREDENTIAL CLASSIFICATION
// Usernames match exactly (Linux usernames are case-sensitive: "Root" is not root).
// Passwords match the common list case-insensitively ("Password" counts as "password").
// =========================================================================

const ROOT_USERNAME = "root";

// Explicit administrator accounts (exact match)
const PRIVILEGED_USERNAMES = ["admin", "administrator", "sudo", "superuser", "sysadmin", "toor"];

// Privileged-like: a privileged name with a number suffix (admin1, admin123, root2, admin_01)
// or any name ending in "admin" (dbadmin, webadmin). Not treated as privileged accounts.
const PRIVILEGED_LIKE_PATTERNS = [
  /^(root|admin|administrator|sudo|superuser|sysadmin)[._-]?\d+$/,
  /^[a-z0-9]+admin$/,
];

// Accounts created by distributions, cloud images, databases and services (exact match)
const SERVICE_USERNAMES = [
  "alpine", "ansible", "apache", "bin", "centos", "daemon", "debian", "deploy", "docker",
  "ec2-user", "elastic", "fedora", "ftp", "ftpuser", "git", "hadoop", "jenkins", "kali",
  "mail", "minecraft", "mssql", "mysql", "nagios", "nginx", "nobody", "operator", "oracle",
  "pi", "postgres", "postmaster", "raspbian", "redis", "steam", "sync", "tomcat", "ubuntu",
  "vagrant", "www-data", "zabbix",
];

/**
 * Common & default passwords (100 entries, lowercase). The most frequent entries of public
 * breach top-lists (SecLists "10-million-password-list-top-100" and similar) plus default
 * credentials of SSH-exposed images and services (raspberry, ubuntu, oracle, vagrant, ...).
 */
const COMMON_PASSWORDS = [
  "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234", "111111", "1234567", "123123",
  "abc123", "password1", "1234567890", "000000", "qwerty123", "1q2w3e4r", "1qaz2wsx", "qazwsx", "123qwe", "zxcvbnm",
  "asdfgh", "654321", "666666", "121212", "112233", "7777777", "987654321", "iloveyou", "letmein", "welcome",
  "monkey", "dragon", "master", "shadow", "sunshine", "princess", "football", "baseball", "superman", "trustno1",
  "starwars", "freedom", "whatever", "qwertyuiop", "passw0rd", "p@ssword", "p@ssw0rd", "pass", "pass123", "password123",
  "admin", "admin123", "admin@123", "administrator", "root", "root123", "root@123", "toor", "changeme", "default",
  "secret", "login", "guest", "user", "test", "test123", "qwe123", "1q2w3e", "1qaz@wsx", "abcd1234",
  "a123456", "123456a", "1111", "0000", "123", "12", "raspberry", "ubuntu", "oracle", "postgres",
  "mysql", "debian", "centos", "kali", "alpine", "vagrant", "support", "service", "server", "system",
  "manager", "access", "computer", "internet", "hello", "hello123", "welcome1", "welcome123", "charlie", "letmein123",
];

const PRIVILEGED_SET = new Set(PRIVILEGED_USERNAMES);
const SERVICE_SET = new Set(SERVICE_USERNAMES);
const COMMON_PASSWORD_SET = new Set(COMMON_PASSWORDS);

const asText = (value) => (value === null || value === undefined ? "" : String(value));

const USERNAME_CATEGORIES = [
  { key: "root", label: "Root", definition: `Exactly "${ROOT_USERNAME}".` },
  { key: "privileged", label: "Privileged account", definition: `One of: ${PRIVILEGED_USERNAMES.join(", ")}.` },
  {
    key: "privileged_like",
    label: "Privileged-like",
    definition: "A privileged name followed by a number (admin1, admin123, root2) or a name ending in \"admin\" (dbadmin).",
  },
  { key: "service", label: "Service / default account", definition: `Accounts that distributions and services create: ${SERVICE_USERNAMES.join(", ")}.` },
  { key: "other", label: "Other", definition: "Any other username." },
];

/** @returns {"root"|"privileged"|"privileged_like"|"service"|"other"} */
const usernameCategory = (username) => {
  const name = asText(username);
  if (name === ROOT_USERNAME) return "root";
  if (PRIVILEGED_SET.has(name)) return "privileged";
  if (PRIVILEGED_LIKE_PATTERNS.some((re) => re.test(name))) return "privileged_like";
  if (SERVICE_SET.has(name)) return "service";
  return "other";
};

const isCommonPassword = (password) => COMMON_PASSWORD_SET.has(asText(password).toLowerCase());

// =========================================================================
// ATTEMPT RISK
// =========================================================================

const ATTEMPT_RISK_LEVELS = ["Critical", "High", "Medium", "Low"];

const THREAT_VECTORS = [
  { key: "successful_login", label: "Successful Login", level: "Critical", definition: "The login succeeded (only when the sensor reports successful logins)." },
  { key: "targeted_root", label: "Targeted Root", level: "High", definition: `Username is exactly "${ROOT_USERNAME}".` },
  { key: "privileged_account", label: "Privileged Account", level: "High", definition: `Username is one of: ${PRIVILEGED_USERNAMES.join(", ")}.` },
  { key: "privileged_like", label: "Privileged-like Account", level: "Medium", definition: USERNAME_CATEGORIES[2].definition },
  { key: "service_account", label: "Service/Default Account", level: "Medium", definition: "Username is a service or default account (see username categories)." },
  { key: "common_password", label: "Common Password", level: "Medium", definition: `Password is on the common-password list (${COMMON_PASSWORDS.length} entries).` },
];

const VECTOR_BY_KEY = Object.fromEntries(THREAT_VECTORS.map((v) => [v.key, v]));
const CATEGORY_VECTOR = { root: "targeted_root", privileged: "privileged_account", privileged_like: "privileged_like", service: "service_account" };
const LEVEL_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };

/**
 * Risk of a single login attempt: the most severe threat vector it matches, Low when none.
 * @param {{ username?: string|null, password?: string|null, success?: boolean|null }} attempt
 * @returns {{ level: "Critical"|"High"|"Medium"|"Low", vectors: string[], usernameCategory: string, commonPassword: boolean }}
 */
const classifyAttempt = ({ username, password, success = null }) => {
  const category = usernameCategory(username);
  const commonPassword = isCommonPassword(password);
  const keys = [];
  if (success === true) keys.push("successful_login");
  if (CATEGORY_VECTOR[category]) keys.push(CATEGORY_VECTOR[category]);
  if (commonPassword) keys.push("common_password");

  let level = "Low";
  for (const key of keys) {
    if (LEVEL_RANK[VECTOR_BY_KEY[key].level] < LEVEL_RANK[level]) level = VECTOR_BY_KEY[key].level;
  }

  return { level, vectors: keys.map((key) => VECTOR_BY_KEY[key].label), usernameCategory: category, commonPassword };
};

module.exports = {
  RISK_THRESHOLDS,
  HIGH_RATE_PER_MINUTE,
  riskLevelForAttempts,
  assessRisk,
  ROOT_USERNAME,
  PRIVILEGED_USERNAMES,
  PRIVILEGED_LIKE_PATTERNS,
  SERVICE_USERNAMES,
  COMMON_PASSWORDS,
  USERNAME_CATEGORIES,
  usernameCategory,
  isCommonPassword,
  ATTEMPT_RISK_LEVELS,
  THREAT_VECTORS,
  classifyAttempt,
};
