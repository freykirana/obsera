/**
 * Calculates effective average velocity using the Session Chunking algorithm.
 * It segments logs based on idleThresholdMs and strictly evaluates the latest session wave.
 * @param {Array<{access_time: Date|string}>} logs - Array of logs sorted by access_time ascending
 * @param {number} idleThresholdMs - Threshold to break a session (default: 5 minutes)
 * @returns {Object} result - containing averageVelocity and auditTrail
 */
function calculateAverageVelocity(logs, idleThresholdMs = 5 * 60 * 1000) {
  if (!logs || logs.length === 0) {
    return {
      averageVelocity: 0,
      auditTrail: {
        totalEvents: 0,
        effectiveDurationMs: 0,
        idleTimeExcludedMs: 0,
        firstEventTime: null,
        lastEventTime: null,
        isReliable: false,
      },
    };
  }

  // 1. Session Chunking: Ekstrak HANYA sesi terakhir
  let latestSessionLogs = [logs[0]];
  let idleTimeExcludedMs = 0; // Total excluded idle time over ALL history (for audit)

  for (let i = 1; i < logs.length; i++) {
    const prev = new Date(logs[i - 1].access_time).getTime();
    const curr = new Date(logs[i].access_time).getTime();
    
    // Validasi data
    if (isNaN(curr) || isNaN(prev)) continue;

    const diffMs = Math.max(0, curr - prev); 
    
    if (diffMs > idleThresholdMs) {
      // Jeda panjang terdeteksi! Reset array ke sesi baru
      latestSessionLogs = [];
      idleTimeExcludedMs += diffMs;
    }
    
    latestSessionLogs.push(logs[i]);
  }

  // 2. Hitung statistik HANYA untuk array sesi terbaru
  const totalEvents = latestSessionLogs.length;
  
  if (totalEvents === 1) {
    return {
      averageVelocity: 1, // Fallback
      auditTrail: {
        totalEvents: 1,
        effectiveDurationMs: 0,
        idleTimeExcludedMs,
        firstEventTime: latestSessionLogs[0].access_time,
        lastEventTime: latestSessionLogs[0].access_time,
        isReliable: false,
      },
    };
  }

  const firstLog = latestSessionLogs[0];
  const lastLog = latestSessionLogs[totalEvents - 1];

  const diffMs = new Date(lastLog.access_time).getTime() - new Date(firstLog.access_time).getTime();
  let effectiveDurationMs = Math.max(0, diffMs);

  const effectiveDurationMins = effectiveDurationMs / 60000;

  // 3. Proteksi Division-by-Zero
  let averageVelocity = totalEvents;
  if (effectiveDurationMins > 0) {
    averageVelocity = totalEvents / effectiveDurationMins;
  }

  // Safety checks against Infinity/NaN
  if (!isFinite(averageVelocity) || isNaN(averageVelocity)) {
    averageVelocity = 0;
  }

  // Round to 2 decimals
  averageVelocity = Math.round(averageVelocity * 100) / 100;

  return {
    averageVelocity,
    auditTrail: {
      totalEvents, // Total events IN THIS SESSION
      effectiveDurationMs,
      idleTimeExcludedMs,
      firstEventTime: firstLog.access_time,
      lastEventTime: lastLog.access_time,
      isReliable: true,
    },
  };
}

module.exports = { calculateAverageVelocity };
