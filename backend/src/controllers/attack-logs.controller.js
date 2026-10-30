const prisma = require("../config/prisma");
const {
  resolveTimeWindow,
  serializeTimeWindow,
  timeWindowParamsFromQuery,
  getStatsData,
  getTimelineData,
  getHourlyDistribution,
  getLastAttackTime,
  getHeatmap,
  getTopSources,
} = require("../services/stats.service");
const { touchSensor } = require("../services/sensor.service");
const { riskLevelForAttempts } = require("../utils/risk");

/**
 * Receive and log attack attempts from honeypot
 * POST /api/attack-logs
 */
const logAttack = async (req, res) => {
  try {
    const {
      source_ip,
      username_attempt,
      password_attempt,
      access_time,
      attack_type = "ssh_attempt",
      port = 22,
      protocol = "ssh",
    } = req.body;

    // Validate required fields
    if (!source_ip) {
      return res.status(400).json({
        ok: false,
        message: "source_ip is required",
      });
    }

    // Find or create attacker record using upsert
    const attacker = await prisma.attackers.upsert({
      where: { source_ip },
      update: {},
      create: { source_ip },
    });

    // Create attack log entry
    const log = await prisma.attackLogs.create({
      data: {
        access_time: new Date(access_time || Date.now()),
        attacker_id: attacker.attacker_id,
        username_attempt: username_attempt || null,
        password_attempt: password_attempt || null,
        attempt_number: 1, // Will be aggregated later
        status: "captured",
        sensor_id: req.body.sensor_id ? String(req.body.sensor_id).slice(0, 100) : null,
      },
      include: {
        attacker: true,
      },
    });

    // An ingested log proves the sensor is alive even between heartbeats
    touchSensor(req.body.sensor_id);

    return res.status(201).json({
      ok: true,
      message: "Attack logged successfully",
      data: log,
    });
  } catch (error) {
    console.error("Error logging attack:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to log attack",
      error: error.message,
    });
  }
};

/**
 * Get all attack logs (aggregated by attacker)
 * GET /api/attack-logs?limit=50&offset=0
 */
const getAttackLogs = async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    // 1. Group the attack logs by attacker_id
    // Note: Prisma's groupBy doesn't support 'include', so we will fetch relations manually.
    const aggregatedLogs = await prisma.attackLogs.groupBy({
      by: ["attacker_id"],
      _count: {
        log_id: true,
      },
      _max: {
        access_time: true,
        username_attempt: true, // Use max to arbitrarily get one of the targets
      },
      orderBy: {
        _max: {
          access_time: "desc",
        },
      },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    // 2. Fetch the total count of unique attackers for pagination
    // Since prisma.groupBy doesn't easily return total group count, we count distinct attacker_ids
    const totalGroups = await prisma.attackLogs.findMany({
      distinct: ["attacker_id"],
      select: { attacker_id: true },
    });
    const total = totalGroups.length;

    // 3. Extract attacker IDs to fetch their details (source_ip)
    const attackerIds = aggregatedLogs.map((group) => group.attacker_id);

    const attackers = await prisma.attackers.findMany({
      where: {
        attacker_id: { in: attackerIds },
      },
    });

    // Create a lookup map for faster access
    const attackerMap = attackers.reduce((map, attacker) => {
      map[attacker.attacker_id] = attacker.source_ip;
      return map;
    }, {});

    // 4. Map the results into a clean, flat array for the frontend
    const resultData = aggregatedLogs.map((group) => {
      const attempts = group._count.log_id;
      return {
        attacker_id: group.attacker_id,
        source_ip: attackerMap[group.attacker_id] || "unknown",
        total_attempts: attempts,
        latest_time: group._max.access_time,
        target: group._max.username_attempt || "unknown",
        risk: riskLevelForAttempts(attempts),
      };
    });

    return res.status(200).json({
      ok: true,
      data: resultData,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    console.error("Error fetching aggregated attack logs:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch aggregated attack logs",
      error: error.message,
    });
  }
};

/**
 * Get attack statistics for a time window
 * GET /api/attack-logs/stats?range=1h|24h|7d|30d|custom&from=&to=&tz=
 * (legacy ?days=N is still accepted)
 */
const getAttackStats = async (req, res) => {
  try {
    const window = await resolveTimeWindow(timeWindowParamsFromQuery(req.query));
    const statsData = await getStatsData(window);

    return res.status(200).json({
      ok: true,
      window: serializeTimeWindow(window),
      data: statsData
    });
  } catch (error) {
    console.error("Error executing stats query:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch dashboard statistics.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Get zero-filled attack timeline for the dashboard chart
 * GET /api/attack-logs/timeline?range=1h|24h|7d|30d|custom&from=&to=&tz=
 */
const getAttackTimeline = async (req, res) => {
  try {
    const window = await resolveTimeWindow(timeWindowParamsFromQuery(req.query));
    const points = await getTimelineData(window);

    return res.status(200).json({
      ok: true,
      range: window.range,
      bucket: window.bucket,
      window: serializeTimeWindow(window),
      data: points
    });
  } catch (error) {
    console.error("Error executing timeline query:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch attack timeline.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Get zero-filled attack distribution by hour of day (window timezone)
 * GET /api/attack-logs/hourly?range=1h|24h|7d|30d|custom&from=&to=&tz=
 */
const getAttackHourly = async (req, res) => {
  try {
    const window = await resolveTimeWindow(timeWindowParamsFromQuery(req.query));
    const points = await getHourlyDistribution(window);

    return res.status(200).json({
      ok: true,
      range: window.range,
      window: serializeTimeWindow(window),
      data: points
    });
  } catch (error) {
    console.error("Error executing hourly distribution query:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch hourly attack distribution.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Time of the most recent attack ever recorded (for "last attack X days ago" empty states)
 * GET /api/attack-logs/last-attack
 */
const getLastAttack = async (req, res) => {
  try {
    const lastAttackAt = await getLastAttackTime();

    return res.status(200).json({
      ok: true,
      data: { last_attack_at: lastAttackAt ? lastAttackAt.toISOString() : null }
    });
  } catch (error) {
    console.error("Error fetching last attack time:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch last attack time.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Most active attacking sources in the time window
 * GET /api/attack-logs/top-sources?range=...&from=&to=&tz=&limit=10
 */
const getAttackTopSources = async (req, res) => {
  try {
    const window = await resolveTimeWindow(timeWindowParamsFromQuery(req.query));
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const sources = await getTopSources(window, limit);

    return res.status(200).json({
      ok: true,
      window: serializeTimeWindow(window),
      data: sources
    });
  } catch (error) {
    console.error("Error fetching top sources:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch top attacking sources.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Attack volume by day of week x hour of day
 * GET /api/attack-logs/heatmap?range=...&from=&to=&tz=
 */
const getAttackHeatmap = async (req, res) => {
  try {
    const window = await resolveTimeWindow(timeWindowParamsFromQuery(req.query));
    const cells = await getHeatmap(window);

    return res.status(200).json({
      ok: true,
      window: serializeTimeWindow(window),
      data: cells
    });
  } catch (error) {
    console.error("Error fetching heatmap:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch attack heatmap.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  getAttackTopSources,
  getAttackHeatmap,
  logAttack,
  getAttackLogs,
  getAttackStats,
  getAttackTimeline,
  getAttackHourly,
  getLastAttack,
};
