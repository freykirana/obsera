const prisma = require("../config/prisma");
const { buildWhereClause } = require("../utils/queryBuilder");
const { calculateAverageVelocity } = require("../utils/velocityCalculator");
const net = require("net");
const { pool, resolveTimeWindow, serializeTimeWindow, timeWindowParamsFromQuery, getTimelineData } = require("../services/stats.service");
const { classifyIp, lookupGeo } = require("../utils/ip");
const { RISK_THRESHOLDS, ROOT_USERNAME, PRIVILEGED_OR_ROOT_USERNAMES, assessRisk, riskLevelForAttempts } = require("../utils/risk");
const { toCsv, fileSafe } = require("../utils/csv");

/**
 * Get paginated and filtered attack logs (Aggregated by Attacker)
 * GET /api/logs
 */
const getLogs = async (req, res) => {
  try {
    const pageNum = parseInt(req.query.page, 10) || 1;
    const limitNum = parseInt(req.query.limit, 10) || 50;
    const { sortBy, sortOrder } = req.query;
    const offset = (pageNum - 1) * limitNum;

    const where = buildWhereClause(req.query);
    
    // Build having clause for risk level filtering which is dynamically derived from aggregated count
    const { riskLevel } = req.query;
    let havingClause = undefined;
    if (riskLevel) {
      const risks = riskLevel.split(",").map(r => r.trim().toLowerCase());
      const havingConditions = [];
      if (risks.includes("high")) havingConditions.push({ log_id: { _count: { gt: RISK_THRESHOLDS.high } } });
      if (risks.includes("medium")) havingConditions.push({ log_id: { _count: { gt: RISK_THRESHOLDS.medium, lte: RISK_THRESHOLDS.high } } });
      if (risks.includes("low")) havingConditions.push({ log_id: { _count: { lte: RISK_THRESHOLDS.medium } } });
      
      if (havingConditions.length > 0) {
        havingClause = { OR: havingConditions };
      }
    }

    console.log('[DEBUG] Table Query Where Clause:', JSON.stringify(where, null, 2));

      let orderByClause = {
        _max: { access_time: "desc" },
      };

      if (sortBy === "attempt_number") {
        orderByClause = {
          _count: { log_id: sortOrder === "asc" ? "asc" : "desc" }
        };
      } else if (sortBy === "access_time") {
        orderByClause = {
          _max: { access_time: sortOrder === "asc" ? "asc" : "desc" }
        };
      } else if (sortBy === "first_seen") {
        orderByClause = {
          _min: { access_time: sortOrder === "asc" ? "asc" : "desc" }
        };
      }

      // 1. Group the attack logs by attacker_id
      const aggregatedLogs = await prisma.attackLogs.groupBy({
        by: ["attacker_id"],
        where,
        ...(havingClause && { having: havingClause }),
        _count: {
          log_id: true,
        },
        _min: {
          access_time: true,
        },
        _max: {
          access_time: true,
          username_attempt: true,
        },
        orderBy: orderByClause,
        take: limitNum,
        skip: offset,
      });

    // 2. Fetch total unique attackers for pagination
    const totalGroups = await prisma.attackLogs.groupBy({
      by: ["attacker_id"],
      where,
      ...(havingClause && { having: havingClause }),
      _count: { log_id: true }
    });
    const total = totalGroups.length;

    // 3. Extract attacker IDs to fetch details (source_ip)
    const attackerIds = aggregatedLogs.map((group) => group.attacker_id);

    const attackers = await prisma.attackers.findMany({
      where: {
        attacker_id: { in: attackerIds },
      },
    });

    const attackerMap = attackers.reduce((map, attacker) => {
      map[attacker.attacker_id] = attacker.source_ip;
      return map;
    }, {});

    // 3.2 Fetch the most recent credential pair per attacker (same row the detail modal lists first)
    const latestAttempts = await prisma.attackLogs.findMany({
      where: { attacker_id: { in: attackerIds } },
      orderBy: [{ attacker_id: "asc" }, { access_time: "desc" }],
      distinct: ["attacker_id"],
      select: { attacker_id: true, username_attempt: true, password_attempt: true },
    });

    const latestAttemptMap = latestAttempts.reduce((map, attempt) => {
      map[attempt.attacker_id] = attempt;
      return map;
    }, {});

    // 3.5 Fetch reviewed count per attacker
    const reviewedCounts = await prisma.attackLogs.groupBy({
      by: ["attacker_id"],
      where: {
        attacker_id: { in: attackerIds },
        status: "Reviewed",
      },
      _count: {
        log_id: true,
      },
    });

    const reviewedMap = reviewedCounts.reduce((map, countGrp) => {
      map[countGrp.attacker_id] = countGrp._count.log_id;
      return map;
    }, {});

    // 4. Flatten data for frontend
    const determineRisk = riskLevelForAttempts;

    const resultData = aggregatedLogs.map(group => {
      const attempts = group._count.log_id;
      const reviewed = reviewedMap[group.attacker_id] || 0;
      const latestAttempt = latestAttemptMap[group.attacker_id];
      
      return {
        attacker_id: group.attacker_id,
        source_ip: attackerMap[group.attacker_id] || 'unknown',
        total_attempts: attempts,
        reviewed_count: reviewed,
        first_seen: group._min.access_time,
        latest_time: group._max.access_time,
        last_username: latestAttempt?.username_attempt ?? null,
        last_password: latestAttempt?.password_attempt ?? null,
        target: group._max.username_attempt || "unknown",
        // Derive riskLevel from aggregated attempts for UI presentation
        riskLevel: determineRisk(attempts),
        status: reviewed === attempts ? "Reviewed" : "Unreviewed",
      };
    });

    return res.status(200).json({
      ok: true,
      data: resultData,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      },
    });

  } catch (error) {
    console.error("Error fetching logs:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch logs",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Bulk or single status update
 * PUT /api/logs/update-status
 */
const updateStatus = async (req, res) => {
  try {
    const { attackerIds, status } = req.body;
    
    // Authorization placeholder: assume req.user is set by auth middleware
    // const userId = req.user?.id;

    const updated = await prisma.attackLogs.updateMany({
      where: {
        attacker_id: { in: attackerIds }
      },
      data: {
        status,
        // reviewed_by: userId, // uncomment if auth is fully implemented
      }
    });

    return res.status(200).json({
      ok: true,
      message: `Successfully updated ${updated.count} logs to ${status}`,
    });

  } catch (error) {
    console.error("Error updating log status:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to update log status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get unified dashboard stats (Velocity and Intensity) based on the exact same filters
 * GET /api/logs/stats
 */
const getLogsAggregatedStats = async (req, res) => {
  try {
    const where = buildWhereClause(req.query);

    // Optional global time range (?range=...&from=&to=&tz=) shared with the dashboard widgets
    let window = null;
    if (req.query.range) {
      window = await resolveTimeWindow(timeWindowParamsFromQuery(req.query));
      where.access_time = {
        gte: window.start,
        ...(window.end && { lt: window.end }),
      };
    }
    
    // Explicit Debugging Log for Where Clause
    console.log('[DEBUG] Stats Query Where Clause:', JSON.stringify(where, null, 2));

    // Extract timezoneOffset (default to 7 for WIB)
    const tzOffsetStr = req.query.timezoneOffset;
    const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 7;

    // 1. Hourly Attack Intensity
    const allLogs = await prisma.attackLogs.findMany({
      where,
      select: { access_time: true },
      orderBy: { access_time: 'asc' }, // Ensure sorted for velocity calculation
    });

    let morning = 0, afternoon = 0, night = 0, lateNight = 0;
    allLogs.forEach(log => {
      const date = new Date(log.access_time);
      // Use dynamic timezone offset to group into hours
      let localHour = (date.getUTCHours() + tzOffset) % 24; 
      if (localHour < 0) localHour += 24; // Handle potential negative offsets safely
      
      if (localHour >= 6 && localHour < 12) morning++;
      else if (localHour >= 12 && localHour < 18) afternoon++;
      else if (localHour >= 18 && localHour <= 23) night++;
      else lateNight++;
    });

    const intensity = [
      { period: "Morning", attacks: morning },
      { period: "Afternoon", attacks: afternoon },
      { period: "Night", attacks: night },
      { period: "Late Night", attacks: lateNight },
    ];

    // =========================================================================
    // ATTACK VELOCITY (60-Minute Sliding Window, Isolated & Zero-Filled)
    // =========================================================================
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const nowMs = Date.now(); // UTC Epoch murni saat ini

    // Murni hitung 1 jam ke belakang dari UTC server saat ini
    const dbBoundary = new Date(nowMs - ONE_HOUR_MS);

    // Buat objek filter terisolasi agar tidak merusak filter query lain
    const velocityWhere = {
      ...where,
      access_time: { gte: dbBoundary }
    };

    const velocityLogs = await prisma.attackLogs.findMany({
      where: velocityWhere,
      select: { access_time: true },
      orderBy: { access_time: 'asc' }
    });

    // Logging diagnostik untuk audit di terminal server
    console.log(`[Velocity Audit] Logs fetched: ${velocityLogs.length} records. Boundary DB: ${dbBoundary.toISOString()}`);

    // Inisialisasi 60 bucket (index 0 = 0m/sekarang, index 59 = 59m lalu)
    const bucketCounts = new Array(60).fill(0);

    velocityLogs.forEach(log => {
      const logDate = new Date(log.access_time);
      if (isNaN(logDate.getTime())) return;

      const logEpochMs = logDate.getTime();
      
      // Rumus baku jarak waktu (dalam menit)
      const diffMins = Math.floor((nowMs - logEpochMs) / 60000);

      // Masukkan HANYA jika masuk rentang 0 s/d 59 menit terakhir
      if (diffMins >= 0 && diffMins < 60) {
        bucketCounts[diffMins]++;
      }
    });

    // Format output array dari -59m ke -0m untuk charting frontend
    const velocity = [];
    for (let i = 59; i >= 0; i--) {
      velocity.push({
        minute: `-${i}m`,
        attempts: bucketCounts[i]
      });
    }
    // =========================================================================

    // 3. Overall Average Velocity (Req/Min) strictly based on access_time boundaries
    const { averageVelocity, auditTrail: averageVelocityAudit } = calculateAverageVelocity(allLogs);
    const totalCount = allLogs.length;

    // 4. Log Accuracy Rate
    // Since AttackLogs schema requires access_time and attacker_id, true database corruption is rare.
    // However, an SSH honeypot might fail to parse the username during a disconnect, leaving it NULL.
    // We will define "Corrupted" as logs missing a username_attempt.
    let accuracyRate = 100;
    if (totalCount > 0) {
      const corruptedCount = await prisma.attackLogs.count({
        where: {
          ...where,
          username_attempt: null
        }
      });
      accuracyRate = ((totalCount - corruptedCount) / totalCount) * 100;
      accuracyRate = Math.round(accuracyRate * 10) / 10; // Round to 1 decimal place
    } else {
      accuracyRate = 0; // If no logs exist, technically 0% accuracy or just handle as 0 for UI
    }

    return res.status(200).json({
      ok: true,
      ...(window && { window: serializeTimeWindow(window) }),
      data: {
        intensity,
        velocity,
        averageVelocity,
        averageVelocityAudit,
        accuracyRate
      }
    });

  } catch (error) {
    console.error("Error fetching aggregated stats:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch aggregated stats" });
  }
};

/**
 * Get detailed raw logs for a specific attacker
 * GET /api/logs/:attacker_id/details
 */
const getAttackerLogDetails = async (req, res) => {
  try {
    const { attacker_id } = req.params;
    
    // Optional basic pagination if there are many logs for one attacker
    const limit = parseInt(req.query.limit, 10) || 100;
    const page = parseInt(req.query.page, 10) || 1;
    const offset = (page - 1) * limit;

    const logs = await prisma.attackLogs.findMany({
      where: { attacker_id },
      orderBy: { access_time: "desc" },
      take: limit,
      skip: offset,
      select: {
        log_id: true,
        access_time: true,
        username_attempt: true,
        password_attempt: true,
        status: true,
        attempt_number: true,
      }
    });

    const total = await prisma.attackLogs.count({
      where: { attacker_id }
    });

    return res.status(200).json({
      ok: true,
      data: logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error("Error fetching attacker log details:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch attacker log details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Mark a single raw log as reviewed or unreviewed
 * PATCH /api/logs/:log_id/review
 */
const reviewLog = async (req, res) => {
  try {
    const { log_id } = req.params;
    const { status } = req.body; // "Reviewed" or "Unreviewed"
    const userId = req.user?.id || 1; // Assuming auth middleware sets req.user

    if (!["Reviewed", "Unreviewed"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Invalid status provided" });
    }

    const isReviewed = status === "Reviewed";

    const updated = await prisma.attackLogs.update({
      where: { log_id },
      data: {
        status: status,
        // reviewed_by: isReviewed ? userId : null, // Uncomment when schema fully supports it
      }
    });

    return res.status(200).json({
      ok: true,
      message: `Log marked as ${status}`,
      data: updated
    });
  } catch (error) {
    console.error("Error toggling log status:", error);
    return res.status(500).json({ ok: false, message: "Failed to toggle log status" });
  }
};

/**
 * Batch review multiple raw logs
 * PATCH /api/logs/batch-review
 */
const batchReviewLogs = async (req, res) => {
  try {
    const { logIds } = req.body;
    const userId = req.user?.id || 1;

    if (!Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ ok: false, message: "logIds must be a non-empty array" });
    }

    const updated = await prisma.attackLogs.updateMany({
      where: { log_id: { in: logIds } },
      data: {
        status: "Reviewed",
        // reviewed_by: userId, // Uncomment when schema supports it
      }
    });

    return res.status(200).json({
      ok: true,
      message: `Successfully reviewed ${updated.count} logs`
    });
  } catch (error) {
    console.error("Error batch reviewing logs:", error);
    return res.status(500).json({ ok: false, message: "Failed to batch review logs" });
  }
};

/**
 * Auto-review: mark an attacker's logs as Reviewed once an admin has opened its detail view
 * PATCH /api/logs/:attacker_id/mark-viewed
 * Body: { upTo?: ISO string } - newest access_time the admin actually saw. Logs arriving after it stay Unreviewed.
 */
const markAttackerViewed = async (req, res) => {
  try {
    const { attacker_id } = req.params;
    const upTo = req.body?.upTo ? new Date(req.body.upTo) : new Date();

    if (isNaN(upTo.getTime())) {
      return res.status(400).json({ ok: false, message: "upTo must be a valid date" });
    }

    const updated = await prisma.attackLogs.updateMany({
      where: {
        attacker_id,
        access_time: { lte: upTo },
        OR: [{ status: null }, { status: { not: "Reviewed" } }],
      },
      data: {
        status: "Reviewed",
        reviewed_by: req.user?.user_id || null,
      }
    });

    return res.status(200).json({
      ok: true,
      message: `Auto-reviewed ${updated.count} logs`,
      data: { count: updated.count }
    });
  } catch (error) {
    console.error("Error auto-reviewing attacker logs:", error);
    return res.status(500).json({ ok: false, message: "Failed to mark logs as reviewed" });
  }
};

// =========================================================================
// PER-IP DETAIL (GET /api/logs/ip/:ip ...)
// =========================================================================

const MAX_CUSTOM_SPAN_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_EXPORT_ROWS = 100000;

// Resolve :ip to its attacker row, answering 400/404 directly when it cannot be used
const findAttackerForRequest = async (req, res) => {
  const ip = String(req.params.ip || "");
  if (!net.isIP(ip)) {
    res.status(400).json({ ok: false, message: "Invalid IP address" });
    return null;
  }
  const attacker = await prisma.attackers.findUnique({ where: { source_ip: ip } });
  if (!attacker) {
    res.status(404).json({ ok: false, message: "No attacks recorded from this IP" });
    return null;
  }
  return { ip, attacker };
};

/**
 * Summary for the IP detail page: totals, risk, credentials tried and an activity timeline
 * GET /api/logs/ip/:ip?tz=Asia/Jakarta
 */
const getIpSummary = async (req, res) => {
  try {
    const found = await findAttackerForRequest(req, res);
    if (!found) return;
    const { ip, attacker } = found;

    const [totalsResult, usernamesResult, passwordsResult] = await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS attempts,
               MIN(access_time) AT TIME ZONE 'UTC' AS first_seen,
               MAX(access_time) AT TIME ZONE 'UTC' AS last_seen,
               COUNT(*) FILTER (WHERE status = 'Reviewed')::int AS reviewed_count,
               COUNT(DISTINCT username_attempt)::int AS unique_usernames,
               COUNT(DISTINCT password_attempt)::int AS unique_passwords,
               BOOL_OR(username_attempt = ANY($2::text[])) AS privileged_targeted,
               BOOL_OR(username_attempt = $3::text) AS root_targeted,
               ROUND((COUNT(*) / GREATEST(EXTRACT(EPOCH FROM (MAX(access_time) - MIN(access_time))) / 60, 1))::numeric, 2) AS attempts_per_minute
        FROM attack_logs
        WHERE attacker_id = $1
      `, [attacker.attacker_id, PRIVILEGED_OR_ROOT_USERNAMES, ROOT_USERNAME]),
      pool.query(`
        SELECT username_attempt AS value, COUNT(*)::int AS count
        FROM attack_logs
        WHERE attacker_id = $1 AND username_attempt IS NOT NULL AND username_attempt != ''
        GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 10
      `, [attacker.attacker_id]),
      pool.query(`
        SELECT password_attempt AS value, COUNT(*)::int AS count
        FROM attack_logs
        WHERE attacker_id = $1 AND password_attempt IS NOT NULL AND password_attempt != ''
        GROUP BY 1 ORDER BY 2 DESC, 1 ASC LIMIT 10
      `, [attacker.attacker_id]),
    ]);

    const totals = totalsResult.rows[0];

    // Timeline covering this source's whole activity (capped at the newest 366 days)
    const lastMs = totals.last_seen.getTime();
    const firstMs = Math.max(totals.first_seen.getTime(), lastMs - MAX_CUSTOM_SPAN_MS + 60 * 1000);
    const window = await resolveTimeWindow({
      range: "custom",
      from: new Date(firstMs).toISOString(),
      to: new Date(lastMs + 60 * 1000).toISOString(),
      tz: typeof req.query.tz === "string" ? req.query.tz : undefined,
    });
    const timeline = await getTimelineData(window, { attackerId: attacker.attacker_id });

    return res.status(200).json({
      ok: true,
      data: {
        attacker_id: attacker.attacker_id,
        ip,
        network: classifyIp(ip),
        geo: lookupGeo(ip),
        attempts: totals.attempts,
        reviewed_count: totals.reviewed_count,
        first_seen: totals.first_seen.toISOString(),
        last_seen: totals.last_seen.toISOString(),
        unique_usernames: totals.unique_usernames,
        unique_passwords: totals.unique_passwords,
        attempts_per_minute: Number(totals.attempts_per_minute),
        risk: assessRisk({
          attempts: totals.attempts,
          attemptsPerMinute: Number(totals.attempts_per_minute),
          uniqueUsernames: totals.unique_usernames,
          privilegedTargeted: !!totals.privileged_targeted,
          rootTargeted: !!totals.root_targeted,
        }),
        top_usernames: usernamesResult.rows,
        top_passwords: passwordsResult.rows,
        timeline: { window: serializeTimeWindow(window), points: timeline },
      },
    });
  } catch (error) {
    console.error("Error fetching IP summary:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch IP summary" });
  }
};

// Where clause for one source's attempts with an optional credential search
const ipAttemptsWhere = (attackerId, search) => {
  const where = { attacker_id: attackerId };
  if (typeof search === "string" && search.trim()) {
    const term = search.trim().slice(0, 100);
    where.OR = [
      { username_attempt: { contains: term, mode: "insensitive" } },
      { password_attempt: { contains: term, mode: "insensitive" } },
    ];
  }
  return where;
};

/**
 * Paginated attempts for one IP (server-side pagination, total count, credential search)
 * GET /api/logs/ip/:ip/attempts?page=1&limit=50&search=&sortOrder=desc
 */
const getIpAttempts = async (req, res) => {
  try {
    const found = await findAttackerForRequest(req, res);
    if (!found) return;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
    const where = ipAttemptsWhere(found.attacker.attacker_id, req.query.search);

    const [rows, total] = await Promise.all([
      prisma.attackLogs.findMany({
        where,
        orderBy: { access_time: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          log_id: true,
          access_time: true,
          username_attempt: true,
          password_attempt: true,
          status: true,
          attempt_number: true,
        },
      }),
      prisma.attackLogs.count({ where }),
    ]);

    return res.status(200).json({
      ok: true,
      data: rows.map((row) => ({
        ...row,
        // TODO: populate from Cowrie session events (cowrie.login.success, cowrie.client.version,
        // cowrie.session.closed, cowrie.command.input) once the agent ingests them.
        login_result: null,
        ssh_client_version: null,
        session_duration_seconds: null,
        commands_executed: null,
      })),
      pagination: { total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) },
    });
  } catch (error) {
    console.error("Error fetching IP attempts:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch attempts" });
  }
};

/**
 * Download every attempt from one IP
 * GET /api/logs/ip/:ip/export?format=csv|json&search=
 */
const exportIpAttempts = async (req, res) => {
  try {
    const found = await findAttackerForRequest(req, res);
    if (!found) return;
    const format = req.query.format === "json" ? "json" : "csv";

    const rows = await prisma.attackLogs.findMany({
      where: ipAttemptsWhere(found.attacker.attacker_id, req.query.search),
      orderBy: { access_time: "asc" },
      take: MAX_EXPORT_ROWS,
      select: { access_time: true, username_attempt: true, password_attempt: true, status: true, attempt_number: true },
    });

    const filename = `obsera-attempts-${fileSafe(found.ip)}.${format}`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    if (format === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.status(200).send(JSON.stringify({
        ip: found.ip,
        exported_at: new Date().toISOString(),
        total: rows.length,
        truncated: rows.length === MAX_EXPORT_ROWS,
        attempts: rows.map((r) => ({
          time_utc: r.access_time.toISOString(),
          username: r.username_attempt,
          password: r.password_attempt,
          review_status: r.status,
        })),
      }, null, 2));
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(toCsv(
      ["time_utc", "source_ip", "username", "password", "review_status"],
      rows.map((r) => [r.access_time, found.ip, r.username_attempt, r.password_attempt, r.status])
    ));
  } catch (error) {
    console.error("Error exporting IP attempts:", error);
    return res.status(500).json({ ok: false, message: "Failed to export attempts" });
  }
};

module.exports = {
  getIpSummary,
  getIpAttempts,
  exportIpAttempts,
  getLogs,
  updateStatus,
  getLogsAggregatedStats,
  getAttackerLogDetails,
  reviewLog,
  batchReviewLogs,
  markAttackerViewed,
};
