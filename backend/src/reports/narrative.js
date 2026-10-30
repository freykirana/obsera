const { formatDate, formatDateTime, formatTime, dayKey, timezoneLabel } = require("../../../shared/format-date");
const { HIGH_RATE_PER_MINUTE } = require("../utils/risk");

/**
 * Rule-based text for the report: executive summary, key findings and recommendations.
 * Every sentence is triggered by the data; when a figure is unavailable the sentence is dropped.
 * Config keys and paths are wrapped in `backticks`; the PDF prints them in the mono font.
 */

const FINDING_THRESHOLDS = {
  // One source with at least this share of all attempts
  dominantSourceShare: 0.9,
  // Dictionary / spraying: enough usernames and passwords, each password tried on this share of the usernames
  dictionaryMinUsernames: 5,
  dictionaryMinPasswords: 5,
  dictionaryCoverage: 0.5,
  // Share of attempts using a password from the common-password list
  commonPasswordShare: 0.5,
};

const MAX_FINDINGS = 6;

const n = (value) => Number(value).toLocaleString("en-US");
const pct = (share) => `${Math.round(share * 100)}%`;
const rate = (value) => Number(value).toLocaleString("en-US", { maximumFractionDigits: 1 });
const plural = (count, one, many) => `${n(count)} ${count === 1 ? one : many}`;
const listText = (items) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

const networkPhrase = (source) => {
  if (source.network.type === "private") return "private network";
  if (source.network.type === "loopback") return "loopback";
  if (source.network.type === "link-local") return "link-local";
  if (source.geo.country_name) return source.geo.country_name;
  return "public address";
};

const category = (data, key) => data.username_categories.find((c) => c.key === key);
const fastestSource = (sources) => [...sources].sort((a, b) => b.attempts_per_minute - a.attempts_per_minute)[0];

/** 2–4 sentences describing the period */
const buildSummary = (data) => {
  const { totals, sources, window } = data;
  const tz = timezoneLabel(window.timeZone);
  if (!totals.attempts) return ["No SSH login attempts were recorded during this period."];

  const top = sources[0];
  const sentences = [];

  sentences.push(totals.sources === 1
    ? `During this period the honeypot recorded ${plural(totals.attempts, "SSH login attempt", "SSH login attempts")} from 1 source (${top.ip}, ${networkPhrase(top)}).`
    : `During this period the honeypot recorded ${plural(totals.attempts, "SSH login attempt", "SSH login attempts")} from ${n(totals.sources)} sources; the most active, ${top.ip}, accounted for ${pct(top.share)} of them.`);

  const automated = (perMinute) => (perMinute > HIGH_RATE_PER_MINUTE ? ", a pattern consistent with an automated brute-force tool" : "");
  if (dayKey(totals.first_at, window.timeZone) === dayKey(totals.last_at, window.timeZone)) {
    sentences.push(`All activity took place on ${formatDate(totals.first_at, window.timeZone)} between ${formatTime(totals.first_at, window.timeZone)} and ${formatTime(totals.last_at, window.timeZone)} ${tz} at an average of ${rate(totals.attempts_per_minute)} attempts per minute${automated(totals.attempts_per_minute)}.`);
  } else {
    // Over several days the overall average is diluted by quiet hours, so quote the fastest source instead
    const fastest = fastestSource(sources);
    sentences.push(`Activity ran from ${formatDateTime(totals.first_at, window.timeZone)} to ${formatDateTime(totals.last_at, window.timeZone)} ${tz}; the fastest source averaged ${rate(fastest.attempts_per_minute)} attempts per minute${automated(fastest.attempts_per_minute)}.`);
  }

  const who = totals.sources === 1 ? "The attacker" : "Attackers";
  let credentials = `${who} tried ${plural(totals.usernames, "username", "usernames")} and ${plural(totals.passwords, "password", "passwords")}`;
  if (totals.successful_logins === 0) credentials += "; no login succeeded";
  else if (totals.successful_logins > 0) credentials += `; ${plural(totals.successful_logins, "login", "logins")} succeeded`;
  sentences.push(`${credentials}.`);

  return sentences;
};

/**
 * @returns {Array<{ severity: "critical"|"warning"|"info", text: string, figure: string }>} most severe first
 */
const buildFindings = (data) => {
  const { totals, sources } = data;
  if (!totals.attempts) return [];
  const findings = [];

  if (totals.successful_logins > 0) {
    findings.push({
      severity: "critical",
      text: "At least one login succeeded: the attacker had a working shell on the honeypot.",
      figure: plural(totals.successful_logins, "successful login", "successful logins"),
    });
  }

  const privateSources = sources.filter((s) => s.network.type === "private");
  if (privateSources.length) {
    findings.push({
      severity: "warning",
      text: privateSources.length === 1
        ? "The source is on a private (RFC 1918) network: either internal testing or a compromised internal host. This needs verification."
        : "Several sources are on private (RFC 1918) networks: either internal testing or compromised internal hosts. This needs verification.",
      figure: privateSources.map((s) => s.ip).join(", "),
    });
  }

  const fastest = fastestSource(sources);
  if (fastest && fastest.attempts_per_minute > HIGH_RATE_PER_MINUTE) {
    findings.push({
      severity: "warning",
      text: "Attempts arrived faster than a person can type, which points to an automated tool.",
      figure: `${rate(fastest.attempts_per_minute)} attempts/min from ${fastest.ip} (threshold ${HIGH_RATE_PER_MINUTE})`,
    });
  }

  const root = category(data, "root");
  if (root.attempts > 0) {
    findings.push({
      severity: "warning",
      text: "The root account was targeted directly.",
      figure: `${plural(root.attempts, "attempt", "attempts")} on root`,
    });
  }
  const privileged = category(data, "privileged");
  if (privileged.attempts > 0) {
    findings.push({
      severity: "warning",
      text: "Administrator accounts were targeted.",
      figure: `${privileged.names.join(", ")} · ${plural(privileged.attempts, "attempt", "attempts")}`,
    });
  }

  const top = sources[0];
  if (top && top.share >= FINDING_THRESHOLDS.dominantSourceShare) {
    findings.push({
      severity: "info",
      text: top.share === 1 ? "All attempts came from a single source." : "Activity is dominated by a single source.",
      figure: `${top.ip} · ${pct(top.share)} of attempts`,
    });
  }

  const coverage = data.password_coverage;
  if (
    totals.usernames >= FINDING_THRESHOLDS.dictionaryMinUsernames &&
    totals.passwords >= FINDING_THRESHOLDS.dictionaryMinPasswords &&
    coverage !== null && coverage >= FINDING_THRESHOLDS.dictionaryCoverage
  ) {
    findings.push({
      severity: "info",
      text: `The same password list was tried against ${coverage >= 0.99 ? "every" : "most"} username: a dictionary / password-spraying pattern.`,
      figure: `${n(totals.passwords)} passwords × ${n(totals.usernames)} usernames · ${pct(coverage)} coverage`,
    });
  }

  const commonShare = data.common_password_attempts / totals.attempts;
  if (commonShare >= FINDING_THRESHOLDS.commonPasswordShare) {
    findings.push({
      severity: "info",
      text: commonShare === 1 ? "Every password tried is on the common-password list." : "Most passwords tried are on the common-password list.",
      figure: `${n(data.common_password_attempts)} of ${n(totals.attempts)} attempts (${pct(commonShare)})`,
    });
  }

  // Pushed in priority order within each severity; the stable sort keeps that order
  const order = { critical: 0, warning: 1, info: 2 };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, MAX_FINDINGS);
};

/** Numbered, data-specific actions; nothing generic that the data did not trigger */
const buildRecommendations = (data) => {
  const { totals, sources } = data;
  if (!totals.attempts) return [];
  const items = [];

  if (totals.successful_logins > 0) {
    items.push("Review every command run in the sessions that logged in successfully and treat the affected host as compromised until proven otherwise.");
  }

  const highRisk = sources.filter((s) => s.risk.level === "High");
  const targets = highRisk.length ? highRisk : sources.slice(0, 1);
  const privateTargets = targets.filter((s) => s.network.type === "private").map((s) => s.ip);
  const publicTargets = targets.filter((s) => s.network.type !== "private").map((s) => s.ip);
  if (privateTargets.length) {
    items.push(`Investigate ${listText(privateTargets)} on the internal network: identify the host and its owner, confirm whether this was an authorised test, and isolate the host if it was not.`);
  }
  if (publicTargets.length) {
    items.push(`Block ${listText(publicTargets)} at the perimeter firewall and report ${publicTargets.length === 1 ? "it" : "them"} to the network's abuse contact.`);
  }

  const privilegedTried = category(data, "root").attempts + category(data, "privileged").attempts > 0;
  if (privilegedTried || data.common_password_attempts > 0) {
    items.push("On production servers, set `PasswordAuthentication no` and `PermitRootLogin no` in `sshd_config` so that a guessed password cannot grant access.");
  }

  if (fastestSource(sources).attempts_per_minute > HIGH_RATE_PER_MINUTE) {
    items.push("Rate-limit SSH logins (fail2ban, or `MaxStartups` and `MaxAuthTries` in `sshd_config`) so automated guessing is cut off after a few failures.");
  }

  const service = category(data, "service");
  if (service.attempts > 0) {
    const examples = service.names.slice(0, 6).join(", ");
    items.push(`Make sure service and default accounts (${examples}${service.names.length > 6 ? ", ..." : ""}) cannot log in interactively: lock them or set their shell to \`/usr/sbin/nologin\`.`);
  }

  return items;
};

module.exports = { FINDING_THRESHOLDS, buildSummary, buildFindings, buildRecommendations };
