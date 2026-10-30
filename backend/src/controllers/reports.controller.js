const fs = require("fs");
const prisma = require("../config/prisma");
const { resolveTimeWindow } = require("../services/stats.service");
const { fileSafe } = require("../utils/csv");
const { timezoneFromLabel } = require("../../../shared/format-date");
const { REPORT_FORMATS, reportFilePath, writeReportFiles, deleteReportFiles } = require("../reports/report-files");

// Report period label -> preset range of the stats service
const PERIOD_TO_RANGE = {
  "Last 24 Hours": "24h",
  "Last 7 Days": "7d",
  "Last 30 Days": "30d",
};
const DEFAULT_PERIOD = "Last 7 Days";

const reportTimeZone = async () => {
  const settings = await prisma.system_settings.findFirst();
  return timezoneFromLabel(settings?.timezone);
};

const reportAuthor = async (userId) => {
  if (!userId) return null;
  const user = await prisma.users.findUnique({ where: { user_id: userId }, select: { display_name: true, email: true } });
  return user ? user.display_name || user.email : null;
};

const randomReportTitle = () => `RPT-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

/**
 * The window a report covers: from the start of the preset range (bucket-aligned in the report
 * timezone, e.g. 00:00 for "Last 30 Days") up to the moment of generation.
 */
const windowForPeriod = async (period, timeZone, end) => {
  const { start } = await resolveTimeWindow({ range: PERIOD_TO_RANGE[period] || PERIOD_TO_RANGE[DEFAULT_PERIOD], tz: timeZone });
  return { start, end, timeZone };
};

/** Write a report's files and record their sizes; used on generation and for reports created before files were stored */
const buildFiles = async (report) => {
  let { period_start: start, period_end: end, time_zone: timeZone } = report;
  if (!start || !end || !timeZone) {
    // Legacy row: fix its window now, ending at its creation time, so later downloads stay identical
    ({ start, end, timeZone } = await windowForPeriod(report.period, await reportTimeZone(), report.created_at));
  }
  const { sizes, totalAttempts } = await writeReportFiles(report, { start, end, timeZone });
  return prisma.reports.update({
    where: { report_id: report.report_id },
    data: {
      period_start: start,
      period_end: end,
      time_zone: timeZone,
      pdf_bytes: sizes.pdf,
      csv_bytes: sizes.csv,
      json_bytes: sizes.json,
      size_kb: Math.round((sizes.pdf / 1024) * 100) / 100,
      total_attacks: totalAttempts,
      status: "Ready",
    },
  });
};

const generateReport = async (req, res) => {
  let report = null;
  try {
    const period = Object.prototype.hasOwnProperty.call(PERIOD_TO_RANGE, req.body?.period) ? req.body.period : DEFAULT_PERIOD;
    const generatedAt = new Date();
    const window = await windowForPeriod(period, await reportTimeZone(), generatedAt);

    report = await prisma.reports.create({
      data: {
        title: randomReportTitle(),
        period,
        period_start: window.start,
        period_end: window.end,
        time_zone: window.timeZone,
        generated_by: await reportAuthor(req.user?.user_id),
        created_at: generatedAt,
        total_attacks: 0,
        size_kb: 0,
        status: "Generating",
      },
    });

    report = await buildFiles(report);

    return res.status(201).json({ ok: true, message: "Report generated successfully", data: report });
  } catch (error) {
    console.error("Error generating report:", error);
    if (report) {
      await deleteReportFiles(report.report_id).catch(() => {});
      await prisma.reports.delete({ where: { report_id: report.report_id } }).catch(() => {});
    }
    return res.status(500).json({ ok: false, message: "Failed to generate report", error: error.message });
  }
};

const getReports = async (req, res) => {
  try {
    const reports = await prisma.reports.findMany({
      orderBy: { created_at: "desc" }
    });

    return res.status(200).json({
      ok: true,
      data: reports
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    return res.status(500).json({
      ok: false,
      message: "Failed to fetch reports",
      error: error.message
    });
  }
};

/** GET /api/reports/:id/download?format=pdf|csv|json (default pdf): the stored file */
const downloadReport = async (req, res) => {
  try {
    const format = String(req.query.format || "pdf").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(REPORT_FORMATS, format)) {
      return res.status(400).json({ ok: false, message: "format must be pdf, csv or json" });
    }

    let report = await prisma.reports.findUnique({ where: { report_id: req.params.id } });
    if (!report) {
      return res.status(404).json({ ok: false, message: "Report not found" });
    }

    const filePath = reportFilePath(report.report_id, format);
    if (!fs.existsSync(filePath)) {
      report = await buildFiles(report);
    }

    const { size } = await fs.promises.stat(filePath);
    res.setHeader("Content-Type", REPORT_FORMATS[format]);
    res.setHeader("Content-Length", size);
    res.setHeader("Content-Disposition", `attachment; filename="${fileSafe(report.title)}.${format}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Error downloading report:", error);
    return res.status(500).json({ ok: false, message: "Failed to download report" });
  }
};

const deleteReport = async (req, res) => {
  try {
    const report = await prisma.reports.findUnique({ where: { report_id: req.params.id } });
    if (!report) {
      return res.status(404).json({ ok: false, message: "Report not found" });
    }

    await deleteReportFiles(report.report_id);
    await prisma.reports.delete({ where: { report_id: report.report_id } });

    return res.status(200).json({ ok: true, message: "Report deleted successfully" });
  } catch (error) {
    console.error("Error deleting report:", error);
    return res.status(500).json({ ok: false, message: "Failed to delete report" });
  }
};

module.exports = {
  generateReport,
  getReports,
  downloadReport,
  deleteReport
};
