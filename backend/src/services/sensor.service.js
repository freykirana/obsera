const prisma = require("../config/prisma");

/**
 * Sensor liveness, fed by agent heartbeats and by every ingested attack log.
 *
 * The sensor list lives in memory, so it is empty after a backend restart (nodemon restarts
 * on every save in development). The newest ingested log in the database therefore also
 * counts as a signal; otherwise the badge said "offline" while fresh data was on screen.
 *
 * TODO: persist sensors in the database (sensors table: sensor_id, hostname, version,
 * last_heartbeat_at) so the per-sensor list survives a restart as well.
 */

// Thresholds for the header badge
const ACTIVE_WITHIN_MS = 2 * 60 * 1000;
const DEGRADED_WITHIN_MS = 10 * 60 * 1000;

const sensors = new Map();

const touchSensor = (sensorId, details = {}) => {
  const id = String(sensorId || "default").slice(0, 100);
  const previous = sensors.get(id) || {};
  sensors.set(id, {
    sensor_id: id,
    hostname: details.hostname ? String(details.hostname).slice(0, 255) : previous.hostname || null,
    version: details.version ? String(details.version).slice(0, 50) : previous.version || null,
    last_seen_at: new Date(),
  });
};

const statusForAge = (ageMs) => {
  if (ageMs <= ACTIVE_WITHIN_MS) return "active";
  if (ageMs <= DEGRADED_WITHIN_MS) return "degraded";
  return "offline";
};

/**
 * Overall status = age of the newest signal: any sensor heartbeat or ingested log
 * (one live sensor means monitoring is up).
 */
const getSensorStatus = async () => {
  const now = Date.now();
  const list = [...sensors.values()].map((sensor) => ({
    ...sensor,
    last_seen_at: sensor.last_seen_at.toISOString(),
    status: statusForAge(now - sensor.last_seen_at.getTime()),
  }));

  // created_at = ingestion time; access_time can lie in the past for replayed logs
  const latest = await prisma.attackLogs.aggregate({ _max: { created_at: true } });
  const lastEventAt = latest._max.created_at;

  const signalTimes = [...sensors.values()].map((sensor) => sensor.last_seen_at.getTime());
  if (lastEventAt) signalTimes.push(lastEventAt.getTime());
  const lastSeenMs = signalTimes.length ? Math.max(...signalTimes) : null;

  return {
    status: lastSeenMs === null ? "offline" : statusForAge(now - lastSeenMs),
    last_seen_at: lastSeenMs === null ? null : new Date(lastSeenMs).toISOString(),
    last_event_at: lastEventAt ? lastEventAt.toISOString() : null,
    thresholds: { active_within_seconds: ACTIVE_WITHIN_MS / 1000, degraded_within_seconds: DEGRADED_WITHIN_MS / 1000 },
    sensors: list,
  };
};

module.exports = { touchSensor, getSensorStatus };
