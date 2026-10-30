const { pool, windowCondition } = require("../services/stats.service");
const { getSensorStatus } = require("../services/sensor.service");
const { classifyIp, lookupGeo } = require("../utils/ip");
const {
  ROOT_USERNAME,
  PRIVILEGED_OR_ROOT_USERNAMES,
  USERNAME_CATEGORIES,
  ATTEMPT_RISK_LEVELS,
  THREAT_VECTORS,
  assessRisk,
  classifyAttempt,
  usernameCategory,
  isCommonPassword,
} = require("../utils/risk");

/**
 * Every number the report shows, computed here so the PDF/CSV/JSON templates only lay it out.
 * The window is fixed when the report is generated: { start: Date, end: Date, timeZone: IANA }.
 */

// The agent forwards cowrie.login.failed only, so successful logins are not in the data.
// Report sections that depend on them stay hidden while this is false.
const SUCCESSFUL_LOGINS_TRACKED = false;

const TOP_LIMIT = 10;
const SAMPLE_LIMIT = 20;
// Periods up to this length get an hourly timeline, longer ones a daily one
const HOURLY_TIMELINE_MAX_MS = 48 * 60 * 60 * 1000;

const params = (window) => [window.start.toISOString(), window.end.toISOString()];
const inWindow = (column = "access_time") => windowCondition(column, 1, 2);

const getTotals = async (window) => {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS attempts,
           COUNT(DISTINCT attacker_id)::int AS sources,
           COUNT(DISTINCT NULLIF(username_attempt, ''))::int AS usernames,
           COUNT(DISTINCT NULLIF(password_attempt, ''))::int AS passwords,
           MIN(access_time) AT TIME ZONE 'UTC' AS first_at,
           MAX(access_time) AT TIME ZONE 'UTC' AS last_at
    FROM attack_logs
    WHERE ${inWindow()}
  `, params(window));
  return rows[0];
};

const getSources = async (window) => {
  const { rows } = await pool.query(`
    SELECT host(a.source_ip) AS ip,
           COUNT(*)::int AS attempts,
           MIN(l.access_time) AT TIME ZONE 'UTC' AS first_seen,
           MAX(l.access_time) AT TIME ZONE 'UTC' AS last_seen,
           COUNT(DISTINCT l.username_attempt)::int AS unique_usernames,
           BOOL_OR(l.username_attempt = ANY($4::text[])) AS privileged_targeted,
           BOOL_OR(l.username_attempt = $5::text) AS root_targeted,
           ROUND((COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(l.access_time) - MIN(l.access_time))) / 60, 1))::numeric, 1) AS attempts_per_minute
    FROM attack_logs l
    JOIN attackers a ON a.attacker_id = l.attacker_id
    WHERE ${inWindow("l.access_time")}
    GROUP BY a.source_ip
    ORDER BY attempts DESC, last_seen DESC
    LIMIT $3
  `, [...params(window), TOP_LIMIT, PRIVILEGED_OR_ROOT_USERNAMES, ROOT_USERNAME]);

  return rows.map((row) => {
    const attemptsPerMinute = Number(row.attempts_per_minute);
    return {
      ip: row.ip,
      network: classifyIp(row.ip),
      geo: lookupGeo(row.ip),
      attempts: row.attempts,
      first_seen: row.first_seen,
      last_seen: row.last_seen,
      duration_ms: row.last_seen.getTime() - row.first_seen.getTime(),
      attempts_per_minute: attemptsPerMinute,
      risk: assessRisk({
        attempts: row.attempts,
        attemptsPerMinute,
        uniqueUsernames: row.unique_usernames,
        privilegedTargeted: !!row.privileged_targeted,
        rootTargeted: !!row.root_targeted,
      }),
    };
  });
};

const getTopValues = async (window, column) => {
  const { rows } = await pool.query(`
    SELECT ${column} AS value, COUNT(*)::int AS count
    FROM attack_logs
    WHERE ${column} IS NOT NULL AND ${column} != '' AND ${inWindow()}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT $3
  `, [...params(window), TOP_LIMIT]);
  return rows;
};

// Distinct (username, password) pairs with counts: every attempt-level rule runs on these
const getCredentialPairs = async (window) => {
  const { rows } = await pool.query(`
    SELECT username_attempt AS username, password_attempt AS password, COUNT(*)::int AS count
    FROM attack_logs
    WHERE ${inWindow()}
    GROUP BY 1, 2
  `, params(window));
  return rows;
};

/**
 * Zero-filled attempts per bucket in the report timezone.
 * Labels are local wall-clock strings ("2026-10-11T18:00:00").
 */
const getTimeline = async (window) => {
  const unit = window.end.getTime() - window.start.getTime() <= HOURLY_TIMELINE_MAX_MS ? "hour" : "day";
  const { rows } = await pool.query(`
    WITH series AS (
      SELECT generate_series(
        date_trunc($3::text, $1::timestamptz AT TIME ZONE $4::text),
        date_trunc($3::text, ($2::timestamptz - interval '1 microsecond') AT TIME ZONE $4::text),
        ('1 ' || $3::text)::interval
      ) AS bucket_local
    ),
    counts AS (
      SELECT date_trunc($3::text, (access_time AT TIME ZONE 'UTC') AT TIME ZONE $4::text) AS bucket_local,
             COUNT(*)::int AS attempts
      FROM attack_logs
      WHERE ${inWindow()}
      GROUP BY 1
    )
    SELECT to_char(s.bucket_local, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket, COALESCE(c.attempts, 0) AS attempts
    FROM series s
    LEFT JOIN counts c ON c.bucket_local = s.bucket_local
    ORDER BY s.bucket_local ASC
  `, [...params(window), unit, window.timeZone]);
  return { unit, points: rows.map((row) => ({ bucket: row.bucket, attempts: Number(row.attempts) })) };
};

const getHourly = async (window) => {
  const { rows } = await pool.query(`
    SELECT h.hour, COALESCE(c.attempts, 0) AS attempts
    FROM generate_series(0, 23) AS h(hour)
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM (access_time AT TIME ZONE 'UTC') AT TIME ZONE $3::text)::int AS hour,
             COUNT(*)::int AS attempts
      FROM attack_logs
      WHERE ${inWindow()}
      GROUP BY 1
    ) c ON c.hour = h.hour
    ORDER BY h.hour ASC
  `, [...params(window), window.timeZone]);
  return rows.map((row) => ({ hour: Number(row.hour), attempts: Number(row.attempts) }));
};

/**
 * How much of the username list each password was tried against.
 * coverage = mean over passwords of (usernames tried with it / all usernames); 1 = every password on every username.
 */
const getPasswordCoverage = async (window, totalUsernames) => {
  if (!totalUsernames) return null;
  const { rows } = await pool.query(`
    SELECT AVG(n)::float AS avg_usernames
    FROM (
      SELECT COUNT(DISTINCT username_attempt) AS n
      FROM attack_logs
      WHERE password_attempt IS NOT NULL AND password_attempt != '' AND ${inWindow()}
      GROUP BY password_attempt
    ) t
  `, params(window));
  const avg = rows[0].avg_usernames;
  return avg === null ? null : avg / totalUsernames;
};

const getRecentEvents = async (window, limit) => {
  const { rows } = await pool.query(`
    SELECT l.access_time AT TIME ZONE 'UTC' AS time,
           host(a.source_ip) AS ip,
           l.username_attempt AS username,
           l.password_attempt AS password
    FROM attack_logs l
    JOIN attackers a ON a.attacker_id = l.attacker_id
    WHERE ${inWindow("l.access_time")}
    ORDER BY l.access_time DESC
    LIMIT $3
  `, [...params(window), limit]);
  return rows.map((row) => ({ ...row, risk: classifyAttempt(row) }));
};

const getSensors = async (window) => {
  const [{ rows }, status] = await Promise.all([
    pool.query(`
      SELECT DISTINCT sensor_id FROM attack_logs
      WHERE sensor_id IS NOT NULL AND ${inWindow()}
      ORDER BY 1
    `, params(window)),
    getSensorStatus(),
  ]);
  const ids = new Set(rows.map((row) => row.sensor_id));
  for (const sensor of status.sensors) ids.add(sensor.sensor_id);
  return [...ids].sort();
};

/** Attempt-level risk, threat vectors and username categories, weighted by attempt count */
const summarizePairs = (pairs, total) => {
  const levels = Object.fromEntries(ATTEMPT_RISK_LEVELS.map((level) => [level, 0]));
  const vectors = Object.fromEntries(THREAT_VECTORS.map((v) => [v.label, 0]));
  const categories = Object.fromEntries(USERNAME_CATEGORIES.map((c) => [c.key, { attempts: 0, usernames: new Set() }]));
  let commonPasswordAttempts = 0;

  for (const pair of pairs) {
    const result = classifyAttempt(pair);
    levels[result.level] += pair.count;
    for (const vector of result.vectors) vectors[vector] += pair.count;
    categories[result.usernameCategory].attempts += pair.count;
    if (pair.username) categories[result.usernameCategory].usernames.add(pair.username);
    if (result.commonPassword) commonPasswordAttempts += pair.count;
  }

  const share = (n) => (total ? n / total : 0);
  return {
    risk_distribution: ATTEMPT_RISK_LEVELS.map((level) => ({ level, attempts: levels[level], share: share(levels[level]) })),
    threat_vectors: THREAT_VECTORS
      .filter((v) => SUCCESSFUL_LOGINS_TRACKED || v.key !== "successful_login")
      .map((v) => ({ label: v.label, level: v.level, attempts: vectors[v.label], share: share(vectors[v.label]) })),
    username_categories: USERNAME_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      usernames: categories[c.key].usernames.size,
      names: [...categories[c.key].usernames].sort(),
      attempts: categories[c.key].attempts,
      share: share(categories[c.key].attempts),
    })),
    common_password_attempts: commonPasswordAttempts,
  };
};

/**
 * @param {{ start: Date, end: Date, timeZone: string }} window
 */
const buildReportData = async (window) => {
  const totalsRow = await getTotals(window);
  const total = totalsRow.attempts;

  const [sources, topUsernames, topPasswords, pairs, timeline, hourly, coverage, recent, sensors] = await Promise.all([
    getSources(window),
    getTopValues(window, "username_attempt"),
    getTopValues(window, "password_attempt"),
    getCredentialPairs(window),
    getTimeline(window),
    getHourly(window),
    getPasswordCoverage(window, totalsRow.usernames),
    getRecentEvents(window, SAMPLE_LIMIT),
    getSensors(window),
  ]);

  const activeMs = totalsRow.first_at ? totalsRow.last_at.getTime() - totalsRow.first_at.getTime() : 0;
  const share = (n) => (total ? n / total : 0);

  return {
    window,
    sensors,
    totals: {
      attempts: total,
      sources: totalsRow.sources,
      usernames: totalsRow.usernames,
      passwords: totalsRow.passwords,
      first_at: totalsRow.first_at,
      last_at: totalsRow.last_at,
      active_ms: activeMs,
      // Same convention as the per-source rate: first to last attempt, minimum 1 minute
      attempts_per_minute: total ? total / Math.max(activeMs / 60000, 1) : 0,
      successful_logins: SUCCESSFUL_LOGINS_TRACKED ? 0 : null,
    },
    sources: sources.map((s) => ({ ...s, share: share(s.attempts) })),
    top_usernames: topUsernames.map((row) => ({ ...row, share: share(row.count), category: usernameCategory(row.value) })),
    top_passwords: topPasswords.map((row) => ({ ...row, share: share(row.count), common: isCommonPassword(row.value) })),
    password_coverage: coverage,
    ...summarizePairs(pairs, total),
    timeline,
    hourly,
    recent,
  };
};

module.exports = { buildReportData, SUCCESSFUL_LOGINS_TRACKED };
