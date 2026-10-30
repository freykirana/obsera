const fs = require("fs");
const path = require("path");
const { once } = require("events");
const { pool, windowCondition } = require("../services/stats.service");
const { csvCell } = require("../utils/csv");
const { classifyAttempt } = require("../utils/risk");
const { formatDateTime, timezoneLabel } = require("../../../shared/format-date");
const { buildReportData } = require("./report-data");
const { buildSummary, buildFindings, buildRecommendations } = require("./narrative");
const { renderReportPdf } = require("./pdf");

/**
 * Writes the three files of a report to uploads/reports/<report_id>.<format> once, at generation
 * time, so every download of a report returns the same bytes and the listed sizes are real.
 */

const REPORTS_DIR = path.resolve(__dirname, "../../uploads/reports");

const REPORT_FORMATS = {
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
};

// report_id is a UUID from the database and format is whitelisted, so the path stays inside REPORTS_DIR
const reportFilePath = (reportId, format) => path.join(REPORTS_DIR, `${reportId}.${format}`);

const EVENT_BATCH = 5000;

/**
 * Every attempt in the window, oldest first, fetched in keyset-paginated batches.
 * The cursor is access_time as text: node-pg would turn the column into a local-time Date and
 * shift it by the machine's UTC offset when sent back as a parameter.
 */
async function* eventBatches(window) {
  let after = null;
  for (;;) {
    const { rows } = await pool.query(`
      SELECT l.log_id,
             l.access_time::text AS cursor_time,
             l.access_time AT TIME ZONE 'UTC' AS time,
             host(a.source_ip) AS ip,
             l.username_attempt AS username,
             l.password_attempt AS password,
             l.sensor_id
      FROM attack_logs l
      JOIN attackers a ON a.attacker_id = l.attacker_id
      WHERE ${windowCondition("l.access_time", 1, 2)}
        AND ($3::timestamp IS NULL OR (l.access_time, l.log_id) > ($3::timestamp, $4::uuid))
      ORDER BY l.access_time ASC, l.log_id ASC
      LIMIT $5
    `, [window.start.toISOString(), window.end.toISOString(), after?.cursor_time ?? null, after?.log_id ?? null, EVENT_BATCH]);
    if (!rows.length) return;
    yield rows;
    after = rows[rows.length - 1];
    if (rows.length < EVENT_BATCH) return;
  }
}

// Column name of the local timestamp: timestamp_wib / timestamp_wita / timestamp_wit
const localTimestampKey = (timeZone) => `timestamp_${timezoneLabel(timeZone).toLowerCase()}`;

const toEvent = (row, timeZone) => {
  const risk = classifyAttempt(row);
  return {
    timestamp_utc: row.time.toISOString(),
    [localTimestampKey(timeZone)]: formatDateTime(row.time, timeZone),
    source_ip: row.ip,
    username: row.username,
    password: row.password,
    risk_level: risk.level,
    threat_vectors: risk.vectors,
    sensor: row.sensor_id,
  };
};

const write = async (stream, text) => {
  if (!stream.write(text)) await once(stream, "drain");
};

const closeStream = async (stream) => {
  stream.end();
  await once(stream, "finish");
};

const writeCsv = async (filePath, window) => {
  const local = localTimestampKey(window.timeZone);
  const stream = fs.createWriteStream(filePath);
  await write(stream, `${["timestamp_utc", local, "source_ip", "username", "password", "risk_level", "threat_vectors", "sensor"].join(",")}\r\n`);
  for await (const rows of eventBatches(window)) {
    const lines = rows.map((row) => {
      const e = toEvent(row, window.timeZone);
      return [e.timestamp_utc, e[local], e.source_ip, e.username, e.password, e.risk_level, e.threat_vectors.join("; "), e.sensor].map(csvCell).join(",");
    });
    await write(stream, `${lines.join("\r\n")}\r\n`);
  }
  await closeStream(stream);
};

const writeJson = async (filePath, window, header) => {
  const stream = fs.createWriteStream(filePath);
  // Pretty-printed header, then one event per line
  const head = JSON.stringify(header, null, 2);
  await write(stream, `${head.slice(0, -2)},\n  "events": [\n`);
  let first = true;
  for await (const rows of eventBatches(window)) {
    const lines = rows.map((row) => `    ${JSON.stringify(toEvent(row, window.timeZone))}`);
    await write(stream, `${first ? "" : ",\n"}${lines.join(",\n")}`);
    first = false;
  }
  await write(stream, "\n  ]\n}\n");
  await closeStream(stream);
};

/**
 * Generate and store the PDF, CSV and JSON for a report row.
 * @param {{ report_id: string, title: string, period: string, created_at: Date, generated_by: string|null }} report
 * @param {{ start: Date, end: Date, timeZone: string }} window
 * @returns {Promise<{ sizes: { pdf: number, csv: number, json: number }, totalAttempts: number }>} file sizes in bytes
 */
const writeReportFiles = async (report, window) => {
  await fs.promises.mkdir(REPORTS_DIR, { recursive: true });

  const data = await buildReportData(window);
  const meta = {
    reportId: report.title,
    periodLabel: report.period,
    generatedAt: report.created_at,
    generatedBy: report.generated_by,
    summary: buildSummary(data),
    findings: buildFindings(data),
    recommendations: buildRecommendations(data),
  };

  await fs.promises.writeFile(reportFilePath(report.report_id, "pdf"), await renderReportPdf(data, meta));
  await writeCsv(reportFilePath(report.report_id, "csv"), window);
  await writeJson(reportFilePath(report.report_id, "json"), window, {
    report: {
      id: report.title,
      title: "SSH Honeypot Activity Report",
      period: report.period,
      period_start: window.start.toISOString(),
      period_end: window.end.toISOString(),
      time_zone: window.timeZone,
      generated_at: report.created_at.toISOString(),
      generated_by: report.generated_by,
    },
    summary: {
      text: meta.summary,
      total_attempts: data.totals.attempts,
      unique_sources: data.totals.sources,
      unique_usernames: data.totals.usernames,
      unique_passwords: data.totals.passwords,
      first_attempt_utc: data.totals.first_at ? data.totals.first_at.toISOString() : null,
      last_attempt_utc: data.totals.last_at ? data.totals.last_at.toISOString() : null,
      successful_logins: data.totals.successful_logins,
    },
    findings: meta.findings,
    recommendations: meta.recommendations,
    risk_distribution: data.risk_distribution,
    threat_vectors: data.threat_vectors,
    top_sources: data.sources.map((s) => ({
      ip: s.ip,
      network: s.network.type,
      attempts: s.attempts,
      first_seen_utc: s.first_seen.toISOString(),
      last_seen_utc: s.last_seen.toISOString(),
      attempts_per_minute: s.attempts_per_minute,
      risk_level: s.risk.level,
      risk_reasons: s.risk.reasons,
    })),
  });

  const sizes = {};
  for (const format of Object.keys(REPORT_FORMATS)) {
    sizes[format] = (await fs.promises.stat(reportFilePath(report.report_id, format))).size;
  }
  return { sizes, totalAttempts: data.totals.attempts };
};

const deleteReportFiles = async (reportId) => {
  await Promise.all(Object.keys(REPORT_FORMATS).map((format) => fs.promises.rm(reportFilePath(reportId, format), { force: true })));
};

module.exports = { REPORT_FORMATS, reportFilePath, writeReportFiles, deleteReportFiles };
