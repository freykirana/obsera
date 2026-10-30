const { Pool } = require("pg");
const { ROOT_USERNAME, PRIVILEGED_OR_ROOT_USERNAMES, assessRisk } = require("../utils/risk");
const { classifyIp, lookupGeo } = require("../utils/ip");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// =========================================================================
// TIME WINDOW
// Every stats query runs against one resolved window so all widgets agree.
// access_time is TIMESTAMP (without time zone) holding UTC values written by Prisma.
// =========================================================================

// Whitelist of preset ranges. Only these fixed values ever reach the SQL query (as parameters).
const TIMELINE_RANGES = {
  "1h": { span: "1 hour", bucket: "minute" },
  "24h": { span: "24 hours", bucket: "hour" },
  "7d": { span: "7 days", bucket: "hour" },
  "30d": { span: "30 days", bucket: "day" },
};
const DEFAULT_TIMELINE_RANGE = "30d";

// Whitelisted display timezones (Settings: WIB / WITA / WIT). None of them observe DST,
// so each has a fixed UTC offset.
const TIMEZONE_OFFSETS = {
  "Asia/Jakarta": "+07:00",
  "Asia/Makassar": "+08:00",
  "Asia/Jayapura": "+09:00",
};
const DEFAULT_TIMEZONE = "Asia/Jakarta";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_CUSTOM_SPAN_MS = 366 * DAY_MS;

// Bucket size for a custom range, chosen so the chart stays between ~2 and ~370 points
const pickCustomBucket = (spanMs) => {
  if (spanMs <= 2 * HOUR_MS) return "minute";
  if (spanMs <= 7 * DAY_MS) return "hour";
  return "day";
};

const isPresetRange = (range) => Object.prototype.hasOwnProperty.call(TIMELINE_RANGES, range);

/**
 * Pick the window parameters out of an Express query object, keeping only string values.
 * Supports the legacy `days` parameter of GET /api/attack-logs/stats.
 */
const timeWindowParamsFromQuery = (query = {}) => {
  const str = (value) => (typeof value === "string" ? value : undefined);
  let range = str(query.range);

  if (!range && str(query.days)) {
    const days = parseInt(query.days, 10);
    range = days <= 1 ? "24h" : days <= 7 ? "7d" : "30d";
  }

  return { range, from: str(query.from), to: str(query.to), tz: str(query.tz) };
};

/**
 * Resolve request parameters into a concrete window.
 * Invalid or unknown values fall back to the default preset; nothing user-supplied is interpolated into SQL.
 * @param {{range?: string, from?: string, to?: string, tz?: string}} params
 * @returns {Promise<{range: string, bucket: string, timeZone: string, offset: string, start: Date, end: Date|null, seriesStart: string, seriesEnd: string}>}
 */
const resolveTimeWindow = async ({ range, from, to, tz } = {}) => {
  const timeZone = Object.prototype.hasOwnProperty.call(TIMEZONE_OFFSETS, tz) ? tz : DEFAULT_TIMEZONE;
  const offset = TIMEZONE_OFFSETS[timeZone];

  if (range === "custom") {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const spanMs = toDate.getTime() - fromDate.getTime();

    if (!isNaN(spanMs) && spanMs > 0 && spanMs <= MAX_CUSTOM_SPAN_MS) {
      const bucket = pickCustomBucket(spanMs);
      const { rows } = await pool.query(`
        SELECT date_trunc($1::text, $2::timestamptz AT TIME ZONE $4::text) AT TIME ZONE $4::text AS start_at,
               to_char(date_trunc($1::text, $2::timestamptz AT TIME ZONE $4::text), 'YYYY-MM-DD"T"HH24:MI:SS') AS series_start,
               to_char(date_trunc($1::text, ($3::timestamptz - interval '1 microsecond') AT TIME ZONE $4::text), 'YYYY-MM-DD"T"HH24:MI:SS') AS series_end
      `, [bucket, fromDate.toISOString(), toDate.toISOString(), timeZone]);

      return {
        range: "custom",
        bucket,
        timeZone,
        offset,
        start: rows[0].start_at,
        end: toDate,
        seriesStart: rows[0].series_start,
        seriesEnd: rows[0].series_end,
      };
    }
  }

  const key = isPresetRange(range) ? range : DEFAULT_TIMELINE_RANGE;
  const { span, bucket } = TIMELINE_RANGES[key];

  // The window ends at the current bucket and spans exactly N buckets (e.g. 60 minutes for 1h)
  const { rows } = await pool.query(`
    WITH bounds AS (
      SELECT date_trunc($2::text, now() AT TIME ZONE $3::text) AS series_end_local
    )
    SELECT (series_end_local - $1::interval + ('1 ' || $2::text)::interval) AT TIME ZONE $3::text AS start_at,
           to_char(series_end_local - $1::interval + ('1 ' || $2::text)::interval, 'YYYY-MM-DD"T"HH24:MI:SS') AS series_start,
           to_char(series_end_local, 'YYYY-MM-DD"T"HH24:MI:SS') AS series_end
    FROM bounds
  `, [span, bucket, timeZone]);

  return {
    range: key,
    bucket,
    timeZone,
    offset,
    start: rows[0].start_at,
    end: null,
    seriesStart: rows[0].series_start,
    seriesEnd: rows[0].series_end,
  };
};

// Public description of a window, echoed back in API responses
const serializeTimeWindow = (window) => ({
  range: window.range,
  bucket: window.bucket,
  timeZone: window.timeZone,
  start: window.start.toISOString(),
  end: window.end ? window.end.toISOString() : null,
});

// SQL condition for "access_time inside the window"; $start/$end are timestamptz ISO strings ($end may be NULL)
const windowCondition = (column, startParam, endParam) =>
  `${column} >= ($${startParam}::timestamptz AT TIME ZONE 'UTC') ` +
  `AND ($${endParam}::timestamptz IS NULL OR ${column} < ($${endParam}::timestamptz AT TIME ZONE 'UTC'))`;

const windowParams = (window) => [window.start.toISOString(), window.end ? window.end.toISOString() : null];

/**
 * The equally long window right before `window`, used for "vs previous period" deltas.
 * A preset window runs until now, so its length is measured up to the current time.
 */
const previousWindowBounds = (window) => {
  const end = window.end ?? new Date();
  const lengthMs = end.getTime() - window.start.getTime();
  return { start: new Date(window.start.getTime() - lengthMs), end: window.start };
};

// =========================================================================
// QUERIES
// =========================================================================

/**
 * Aggregated attack statistics for a window (summary cards + credential analysis)
 * @param {object} window - Result of resolveTimeWindow
 * @returns {Promise<Object>} The aggregated stats payload
 */
const getStatsData = async (window) => {
  const params = windowParams(window);
  const inWindow = windowCondition("access_time", 1, 2);

  const previous = previousWindowBounds(window);

  const [totalAttacksResult, topAttackersResult, topPasswordResult, topUsernameResult, credentialSummaryResult, previousResult] = await Promise.all([
    pool.query(`
      SELECT COUNT(*) AS total
      FROM attack_logs
      WHERE ${inWindow}
    `, params),
    pool.query(`
      SELECT COUNT(DISTINCT attacker_id) AS unique_attackers
      FROM attack_logs
      WHERE ${inWindow}
    `, params),
    pool.query(`
      SELECT password_attempt, COUNT(*) AS count
      FROM attack_logs
      WHERE password_attempt IS NOT NULL AND password_attempt != ''
        AND ${inWindow}
      GROUP BY password_attempt
      ORDER BY count DESC, password_attempt ASC
      LIMIT 15
    `, params),
    pool.query(`
      SELECT username_attempt, COUNT(*) AS count
      FROM attack_logs
      WHERE username_attempt IS NOT NULL AND username_attempt != ''
        AND ${inWindow}
      GROUP BY username_attempt
      ORDER BY count DESC, username_attempt ASC
      LIMIT 15
    `, params),
    pool.query(`
      SELECT COUNT(DISTINCT NULLIF(password_attempt, '')) AS unique_passwords,
             COUNT(DISTINCT NULLIF(username_attempt, '')) AS unique_usernames,
             COUNT(DISTINCT (username_attempt, password_attempt)) AS unique_pairs
      FROM attack_logs
      WHERE ${inWindow}
    `, params),
    pool.query(`
      SELECT COUNT(*) AS total, COUNT(DISTINCT attacker_id) AS unique_sources
      FROM attack_logs
      WHERE ${windowCondition("access_time", 1, 2)}
    `, [previous.start.toISOString(), previous.end.toISOString()])
  ]);

  const credentialSummary = credentialSummaryResult.rows[0];

  const totalAttacks = parseInt(totalAttacksResult.rows[0].total, 10);

  const topAttackersCount = parseInt(topAttackersResult.rows[0].unique_attackers, 10);

  const topPassword = topPasswordResult.rows.length > 0 ? topPasswordResult.rows[0] : { password_attempt: "N/A", count: 0 };
  const topUsername = topUsernameResult.rows.length > 0 ? topUsernameResult.rows[0] : { username_attempt: "N/A", count: 0 };

  return {
    total_attacks: totalAttacks,
    top_attackers_count: topAttackersCount, // New field replacing array
    unique_sources: topAttackersCount,
    previous: {
      start: previous.start.toISOString(),
      end: previous.end.toISOString(),
      total_attacks: parseInt(previousResult.rows[0].total, 10),
      unique_sources: parseInt(previousResult.rows[0].unique_sources, 10)
    },
    top_password: {
      password: topPassword.password_attempt,
      count: parseInt(topPassword.count || 0, 10)
    },
    top_passwords_list: topPasswordResult.rows.map(row => ({
      password: row.password_attempt,
      count: parseInt(row.count, 10)
    })),
    top_username: {
      username: topUsername.username_attempt,
      count: parseInt(topUsername.count || 0, 10)
    },
    top_usernames_list: topUsernameResult.rows.map(row => ({
      username: row.username_attempt,
      count: parseInt(row.count, 10)
    })),
    credential_summary: {
      unique_passwords: parseInt(credentialSummary.unique_passwords, 10),
      unique_usernames: parseInt(credentialSummary.unique_usernames, 10),
      unique_pairs: parseInt(credentialSummary.unique_pairs, 10)
    }
  };
};

/**
 * Zero-filled attack timeline bucketed in the window's local timezone.
 * Every row in attack_logs is one SSH login attempt (the agent only ingests cowrie.login.failed).
 * @param {object} window - Result of resolveTimeWindow
 * @param {{ attackerId?: string }} [filter] - Optionally restrict to one attacking source
 * @returns {Promise<Array<{bucket: string, attempts: number}>>}
 */
const getTimelineData = async (window, { attackerId = null } = {}) => {
  const { rows } = await pool.query(`
    WITH series AS (
      SELECT gs AS bucket_local
      FROM generate_series($3::timestamp, $4::timestamp, ('1 ' || $5::text)::interval) AS gs
    ),
    counts AS (
      SELECT date_trunc($5::text, (access_time AT TIME ZONE 'UTC') AT TIME ZONE $6::text) AS bucket_local,
             COUNT(*)::int AS attempts
      FROM attack_logs
      WHERE ${windowCondition("access_time", 1, 2)}
        AND ($7::uuid IS NULL OR attacker_id = $7::uuid)
      GROUP BY 1
    )
    SELECT to_char(s.bucket_local, 'YYYY-MM-DD"T"HH24:MI:SS') AS bucket,
           COALESCE(c.attempts, 0) AS attempts
    FROM series s
    LEFT JOIN counts c ON c.bucket_local = s.bucket_local
    ORDER BY s.bucket_local ASC
  `, [...windowParams(window), window.seriesStart, window.seriesEnd, window.bucket, window.timeZone, attackerId]);

  return rows.map(row => ({
    bucket: `${row.bucket}${window.offset}`,
    attempts: Number(row.attempts)
  }));
};

/**
 * Attack distribution by hour of day (00-23, window timezone), zero-filled
 * @param {object} window - Result of resolveTimeWindow
 * @returns {Promise<Array<{hour: number, attempts: number}>>}
 */
const getHourlyDistribution = async (window) => {
  const { rows } = await pool.query(`
    SELECT h.hour, COALESCE(c.attempts, 0) AS attempts
    FROM generate_series(0, 23) AS h(hour)
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM (access_time AT TIME ZONE 'UTC') AT TIME ZONE $3::text)::int AS hour,
             COUNT(*)::int AS attempts
      FROM attack_logs
      WHERE ${windowCondition("access_time", 1, 2)}
      GROUP BY 1
    ) c ON c.hour = h.hour
    ORDER BY h.hour ASC
  `, [...windowParams(window), window.timeZone]);

  return rows.map(row => ({ hour: Number(row.hour), attempts: Number(row.attempts) }));
};

/**
 * Top attackers ranked by attack rate (attempts per minute between their first and last attempt).
 * The duration is floored at 1 minute so a short burst is not divided by ~0.
 * @param {object} window - Result of resolveTimeWindow
 * @param {number} limit - Number of attackers to return
 */
const getTopAttackerVelocity = async (window, limit = 10) => {
  const { rows } = await pool.query(`
    SELECT host(a.source_ip) AS source_ip,
           COUNT(*)::int AS total_attempts,
           ROUND((COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(l.access_time) - MIN(l.access_time))) / 60, 1))::numeric, 2) AS attempts_per_minute
    FROM attack_logs l
    JOIN attackers a ON a.attacker_id = l.attacker_id
    WHERE ${windowCondition("l.access_time", 1, 2)}
    GROUP BY a.source_ip
    ORDER BY attempts_per_minute DESC, total_attempts DESC
    LIMIT $3
  `, [...windowParams(window), limit]);

  return rows.map(row => ({
    source_ip: row.source_ip,
    total_attempts: Number(row.total_attempts),
    attempts_per_minute: Number(row.attempts_per_minute)
  }));
};

/**
 * Attack volume by day of week (1 = Monday ... 7 = Sunday) and hour of day, in the window timezone.
 * Only non-empty cells are returned; the client fills the 7x24 grid with zeros.
 * @param {object} window - Result of resolveTimeWindow
 * @returns {Promise<Array<{day: number, hour: number, attempts: number}>>}
 */
const getHeatmap = async (window) => {
  const { rows } = await pool.query(`
    SELECT EXTRACT(ISODOW FROM local_time)::int AS day,
           EXTRACT(HOUR FROM local_time)::int AS hour,
           COUNT(*)::int AS attempts
    FROM (
      SELECT (access_time AT TIME ZONE 'UTC') AT TIME ZONE $3::text AS local_time
      FROM attack_logs
      WHERE ${windowCondition("access_time", 1, 2)}
    ) t
    GROUP BY 1, 2
    ORDER BY 1, 2
  `, [...windowParams(window), window.timeZone]);

  return rows.map(row => ({ day: Number(row.day), hour: Number(row.hour), attempts: Number(row.attempts) }));
};

/**
 * Most active attacking sources in the window, with network classification and risk factors.
 * first_seen / last_seen are bounded by the window.
 * @param {object} window - Result of resolveTimeWindow
 * @param {number} limit
 */
const getTopSources = async (window, limit = 10) => {
  const { rows } = await pool.query(`
    SELECT a.attacker_id,
           host(a.source_ip) AS ip,
           COUNT(*)::int AS attempts,
           MIN(l.access_time) AT TIME ZONE 'UTC' AS first_seen,
           MAX(l.access_time) AT TIME ZONE 'UTC' AS last_seen,
           COUNT(DISTINCT l.username_attempt)::int AS unique_usernames,
           BOOL_OR(l.username_attempt = ANY($4::text[])) AS privileged_targeted,
           BOOL_OR(l.username_attempt = $5::text) AS root_targeted,
           ROUND((COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(l.access_time) - MIN(l.access_time))) / 60, 1))::numeric, 2) AS attempts_per_minute
    FROM attack_logs l
    JOIN attackers a ON a.attacker_id = l.attacker_id
    WHERE ${windowCondition("l.access_time", 1, 2)}
    GROUP BY a.attacker_id, a.source_ip
    ORDER BY attempts DESC, last_seen DESC
    LIMIT $3
  `, [...windowParams(window), limit, PRIVILEGED_OR_ROOT_USERNAMES, ROOT_USERNAME]);

  return rows.map(row => ({
    attacker_id: row.attacker_id,
    ip: row.ip,
    attempts: Number(row.attempts),
    first_seen: row.first_seen.toISOString(),
    last_seen: row.last_seen.toISOString(),
    attempts_per_minute: Number(row.attempts_per_minute),
    unique_usernames: Number(row.unique_usernames),
    network: classifyIp(row.ip),
    geo: lookupGeo(row.ip),
    risk: assessRisk({
      attempts: Number(row.attempts),
      attemptsPerMinute: Number(row.attempts_per_minute),
      uniqueUsernames: Number(row.unique_usernames),
      privilegedTargeted: !!row.privileged_targeted,
      rootTargeted: !!row.root_targeted,
    }),
  }));
};

/**
 * Most recent attack ever recorded (used by empty states to point at a range that has data)
 * @returns {Promise<Date|null>}
 */
const getLastAttackTime = async () => {
  const { rows } = await pool.query(`
    SELECT MAX(access_time) AT TIME ZONE 'UTC' AS last_attack_at
    FROM attack_logs
  `);
  return rows[0].last_attack_at;
};

module.exports = {
  TIMELINE_RANGES,
  windowCondition,
  resolveTimeWindow,
  serializeTimeWindow,
  timeWindowParamsFromQuery,
  getStatsData,
  getTimelineData,
  getHourlyDistribution,
  getTopAttackerVelocity,
  getLastAttackTime,
  getHeatmap,
  getTopSources,
  pool
};
