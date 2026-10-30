const PdfPrinter = require("pdfmake");
const { formatDateTime, formatDuration, timezoneLabel } = require("../../../shared/format-date");
const { RISK_THRESHOLDS, HIGH_RATE_PER_MINUTE, THREAT_VECTORS, USERNAME_CATEGORIES, COMMON_PASSWORDS } = require("../utils/risk");
const { COLORS, FONT, FONT_FILES, LOGO_SVG, LEVEL_COLORS, SEVERITY_COLORS } = require("./theme");
const { barChartSvg } = require("./charts");
const { FINDING_THRESHOLDS } = require("./narrative");
const { SUCCESSFUL_LOGINS_TRACKED } = require("./report-data");

/**
 * SSH Honeypot Activity Report as a pdfmake document (A4 portrait).
 * Layout: page 1 = header, metadata, executive summary, metric strip, key findings;
 * then time pattern, sources, credentials, risk, recommendations; appendix last.
 */

const PAGE_MARGIN_X = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN_X * 2;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const n = (value) => Number(value).toLocaleString("en-US");
const pct = (share) => `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

// ---------- building blocks ----------

const mono = (text, extra = {}) => ({ text: String(text), font: FONT.mono, ...extra });
const muted = (text, extra = {}) => ({ text, color: COLORS.muted, ...extra });

const dot = (color, size = 5) => ({
  canvas: [{ type: "ellipse", x: size / 2, y: size / 2, r1: size / 2, r2: size / 2, color }],
  width: size + 4,
  margin: [0, 3.2, 0, 0],
});

const statusLabel = (level) => ({ columns: [dot(LEVEL_COLORS[level]), { text: level, width: "auto" }], columnGap: 0 });

const hairline = (width = CONTENT_WIDTH) => ({
  canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }],
});

const heading = (title) => ({
  stack: [{ text: title, style: "h2" }, { ...hairline(), margin: [0, 3, 0, 0] }],
  margin: [0, 0, 0, 8],
});

/**
 * Short sections move to the next page as a whole. Breakable ones (longer than a page can
 * hold) flow, relying on repeated table headers and dontBreakRows; pdfmake drops unbreakable
 * content that is taller than a page.
 */
const section = (title, body, { pageBreak, breakable = false } = {}) => ({
  // headlineLevel lets pageBreakBefore keep the heading of a flowing section off the bottom of a page
  // (only outside unbreakable blocks: pdfmake loses content when the two are combined)
  stack: [breakable ? { ...heading(title), headlineLevel: 1 } : heading(title), ...body],
  unbreakable: !breakable,
  margin: [0, 16, 0, 0],
  ...(pageBreak ? { pageBreak } : {}),
});

const subheading = (text) => ({ text, style: "h3", margin: [0, 2, 0, 4] });

// Hairline rows, repeated header, rows never split across pages
const tableLayout = (rowLines = () => true) => ({
  hLineWidth: (i, node) => (i === 0 ? 0 : i === 1 || i === node.table.body.length || rowLines(i) ? 0.5 : 0),
  vLineWidth: () => 0,
  hLineColor: () => COLORS.border,
  paddingLeft: (i) => (i === 0 ? 0 : 3.5),
  paddingRight: (i, node) => (i === node.table.widths.length - 1 ? 0 : 3.5),
  paddingTop: () => 3.3,
  paddingBottom: () => 3.3,
});

const th = (text, alignment = "left") => ({ text, style: "th", alignment });

const table = (widths, header, rows, { rowLines } = {}) => ({
  table: { widths, headerRows: 1, dontBreakRows: true, body: [header, ...rows] },
  layout: tableLayout(rowLines),
  style: "table",
});

// Thin share bar in a neutral tone, scaled to the largest share in the table
const shareBar = (share, maxShare, width = 44) => ({
  canvas: [
    { type: "rect", x: 0, y: 0, w: width, h: 3, color: COLORS.border },
    { type: "rect", x: 0, y: 0, w: maxShare ? Math.max(0.5, (share / maxShare) * width) : 0, h: 3, color: COLORS.neutralBar },
  ],
  margin: [0, 4.5, 0, 0],
});

const networkLabel = (source) => {
  if (source.network.type !== "public") return source.network.type === "private" ? "Private" : source.network.label;
  const parts = [source.geo.country_code, source.geo.asn ? `AS${source.geo.asn}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Public";
};

// "2026-10-11T00:00:00" (local wall clock) -> "11 Oct" or "18:00"
const bucketLabel = (bucket, unit) => {
  const [date, time] = bucket.split("T");
  const [, month, day] = date.split("-");
  return unit === "day" ? `${Number(day)} ${MONTHS[Number(month) - 1]}` : time.slice(0, 5);
};

// ---------- sections ----------

const documentHeader = (meta) => ({
  stack: [
    {
      columns: [
        { svg: LOGO_SVG, width: 28, height: 28 },
        { text: "OBSERA", bold: true, fontSize: 14, characterSpacing: 2, margin: [8, 5, 0, 0], width: "*" },
        {
          width: "auto",
          stack: [mono(meta.reportId, { fontSize: 10, alignment: "right" }), mono("INTERNAL", { fontSize: 10, alignment: "right", color: COLORS.muted, characterSpacing: 1 })],
        },
      ],
    },
    { ...hairline(), margin: [0, 10, 0, 0] },
  ],
});

const metadataBlock = (meta, data) => {
  const tz = timezoneLabel(data.window.timeZone);
  const label = (text) => muted(text, { fontSize: 9 });
  const value = (text) => mono(text, { fontSize: 9 });
  const sensors = data.sensors.length ? `${data.sensors.length}: ${data.sensors.join(", ")}` : "Not reported by the agent";
  return {
    table: {
      widths: [70, "*", 70, "*"],
      body: [
        [label("Period"), { ...value(`${formatDateTime(data.window.start, data.window.timeZone)} – ${formatDateTime(data.window.end, data.window.timeZone)} ${tz} (${meta.periodLabel.toLowerCase()})`), colSpan: 3 }, {}, {}],
        [label("Generated at"), value(`${formatDateTime(meta.generatedAt, data.window.timeZone)} ${tz}`), label("Generated by"), value(meta.generatedBy || "—")],
        [label("Sensors"), value(sensors), label("Timezone"), value(`${tz} (${data.window.timeZone})`)],
      ],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 8, paddingTop: () => 2, paddingBottom: () => 2 },
  };
};

const metricStrip = (data) => {
  const { totals } = data;
  const metrics = [
    ["Total attempts", n(totals.attempts)],
    ["Unique sources", n(totals.sources)],
    ["Unique usernames", n(totals.usernames)],
    ["Unique passwords", n(totals.passwords)],
    ["Active duration", totals.attempts ? formatDuration(totals.active_ms) : "—"],
    ["Successful logins", totals.successful_logins === null ? "n/a" : n(totals.successful_logins)],
  ];
  return [
    {
      table: {
        widths: metrics.map(() => "*"),
        body: [
          metrics.map(([label]) => muted(label, { fontSize: 8 })),
          metrics.map(([, value]) => mono(value, { fontSize: 14, color: COLORS.foreground })),
        ],
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.5 : 0),
        vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0 : 0.5),
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border,
        paddingLeft: (i) => (i === 0 ? 0 : 8),
        paddingRight: () => 6,
        paddingTop: (i) => (i === 0 ? 8 : 1),
        paddingBottom: (i) => (i === 0 ? 0 : 8),
      },
      margin: [0, 12, 0, 0],
    },
    ...(totals.successful_logins === null
      ? [muted("Successful logins are not tracked: the sensor forwards failed login events only.", { fontSize: 8, margin: [0, 4, 0, 0] })]
      : []),
  ];
};

const findingsBlock = (findings) => findings.length
  ? findings.map((finding) => ({
      columns: [
        dot(SEVERITY_COLORS[finding.severity], 6),
        {
          width: "*",
          stack: [{ text: finding.text }, mono(finding.figure, { fontSize: 8.5, color: COLORS.muted, margin: [0, 1, 0, 0] })],
        },
      ],
      columnGap: 4,
      margin: [0, 0, 0, 7],
    }))
  : [muted("No findings: no attempts were recorded in this period.")];

const timePatternBlock = (data) => {
  const tz = timezoneLabel(data.window.timeZone);
  const { unit, points } = data.timeline;
  const peakAttempts = Math.max(...data.hourly.map((h) => h.attempts));
  const peakHours = peakAttempts > 0 ? data.hourly.filter((h) => h.attempts === peakAttempts).map((h) => h.hour) : [];
  const hh = (hour) => String(hour).padStart(2, "0");

  const gap = 20;
  const half = (CONTENT_WIDTH - gap) / 2;
  // Up to ~6 labels on a half-width axis
  const labelEvery = (count) => Math.max(1, Math.ceil(count / 6));

  return [{
    columns: [
      {
        width: half,
        stack: [
          subheading(`Login attempts per ${unit} (${tz})`),
          {
            svg: barChartSvg({
              values: points.map((p) => p.attempts),
              labels: points.map((p) => bucketLabel(p.bucket, unit)),
              labelEvery: labelEvery(points.length),
              width: half,
              height: 130,
            }),
            width: half,
          },
        ],
      },
      {
        width: half,
        stack: [
          subheading(`Attempts by hour of day (${tz})`),
          {
            svg: barChartSvg({
              values: data.hourly.map((h) => h.attempts),
              labels: data.hourly.map((h) => hh(h.hour)),
              labelEvery: 3,
              highlight: peakHours,
              width: half,
              height: 130,
            }),
            width: half,
          },
          ...(peakHours.length
            ? [muted(`Peak hour, highlighted: ${peakHours.map((h) => `${hh(h)}:00–${hh(h)}:59`).join(", ")} (${n(peakAttempts)} attempts).`, { fontSize: 8, margin: [0, 2, 0, 0] })]
            : []),
        ],
      },
    ],
    columnGap: gap,
  }];
};

const sourcesBlock = (data) => {
  const tz = timezoneLabel(data.window.timeZone);
  if (!data.sources.length) return [muted("No sources in this period.")];
  const rows = [];
  for (const s of data.sources) {
    rows.push([
      mono(s.ip),
      s.network.type === "public" ? mono(networkLabel(s)) : { text: networkLabel(s) },
      mono(n(s.attempts), { alignment: "right" }),
      mono(formatDateTime(s.first_seen, data.window.timeZone), { noWrap: true }),
      mono(formatDateTime(s.last_seen, data.window.timeZone), { noWrap: true }),
      mono(formatDuration(s.duration_ms), { alignment: "right", noWrap: true }),
      mono(n(s.attempts_per_minute), { alignment: "right" }),
    ]);
    // Risk and its reason on a second line: A4 portrait has no room for two more columns
    rows.push([
      {},
      {
        colSpan: 6,
        columns: [{ ...statusLabel(s.risk.level), width: "auto" }, muted(s.risk.reasons.join(", "), { fontSize: 8.5, margin: [8, 0.5, 0, 0], width: "*" })],
        margin: [0, -2, 0, 0],
      },
      {}, {}, {}, {}, {},
    ]);
  }
  return [
    table(
      [70, 40, 40, 116, 116, 44, "*"],
      [th("IP"), th("Network"), th("Attempts", "right"), th(`First seen (${tz})`), th(`Last seen (${tz})`), th("Duration", "right"), th("Per min", "right")],
      rows,
      // Line under each risk row only, so a source and its risk read as one entry
      { rowLines: (i) => i % 2 === 1 },
    ),
    muted(`Top ${data.sources.length} of ${n(data.totals.sources)} ${data.totals.sources === 1 ? "source" : "sources"} by attempts; the second line gives the source risk and why. Per min = attempts between first and last attempt (minimum 1 minute). Network location for public addresses needs GeoIP enrichment, which is not configured yet.`, { fontSize: 8, margin: [0, 4, 0, 0] }),
  ];
};

// Short forms so a table row stays on one line
const CATEGORY_SHORT = { root: "Root", privileged: "Privileged", privileged_like: "Privileged-like", service: "Service/default", other: "Other" };

// "All shown were tried equally often" note, so an alphabetical tie-break is not read as a ranking
const tieNote = (rows, noun) => (rows.length > 1 && rows[0].count === rows[rows.length - 1].count
  ? [muted(`All ${noun} shown were tried equally often; ties are listed alphabetically.`, { fontSize: 8, margin: [0, 3, 0, 0] })]
  : []);

const credentialsBlock = (data) => {
  const half = (CONTENT_WIDTH - 20) / 2;
  const maxUser = Math.max(0, ...data.top_usernames.map((u) => u.share));
  const maxPass = Math.max(0, ...data.top_passwords.map((p) => p.share));

  const usernames = table(
    ["*", 62, 40, 44],
    [th("Username"), th("Category"), th("Attempts", "right"), th("Share")],
    data.top_usernames.map((u) => [mono(u.value), muted(CATEGORY_SHORT[u.category], { fontSize: 8 }), mono(n(u.count), { alignment: "right" }), shareBar(u.share, maxUser)]),
  );
  const passwords = table(
    ["*", 56, 40, 44],
    [th("Password"), th("Common list"), th("Attempts", "right"), th("Share")],
    data.top_passwords.map((p) => [mono(p.value), muted(p.common ? "Yes" : "No", { fontSize: 8 }), mono(n(p.count), { alignment: "right" }), shareBar(p.share, maxPass)]),
  );

  const categories = table(
    ["*", 90, 70, 70],
    [th("Category"), th("Distinct usernames", "right"), th("Attempts", "right"), th("% of attempts", "right")],
    data.username_categories.map((c) => [c.label, mono(n(c.usernames), { alignment: "right" }), mono(n(c.attempts), { alignment: "right" }), mono(pct(c.share), { alignment: "right" })]),
  );

  return {
    top: [{
      columns: [
        { width: half, stack: [subheading("Top usernames"), usernames, ...tieNote(data.top_usernames, "usernames")] },
        { width: half, stack: [subheading("Top passwords"), passwords, ...tieNote(data.top_passwords, "passwords")] },
      ],
      columnGap: 20,
    }],
    categories: [subheading("Username categories"), categories],
  };
};

const riskBlock = (data) => {
  const half = (CONTENT_WIDTH - 20) / 2;
  const levels = table(
    ["*", 56, 56],
    [th("Attempt risk"), th("Attempts", "right"), th("%", "right")],
    data.risk_distribution.map((r) => [statusLabel(r.level), mono(n(r.attempts), { alignment: "right" }), mono(pct(r.share), { alignment: "right" })]),
  );
  const vectors = table(
    ["*", 56, 56],
    [th("Threat vector"), th("Attempts", "right"), th("%", "right")],
    data.threat_vectors.map((v) => [v.label, mono(n(v.attempts), { alignment: "right" }), mono(pct(v.share), { alignment: "right" })]),
  );
  return [
    { columns: [{ width: half, stack: [levels] }, { width: half, stack: [vectors] }], columnGap: 20 },
    muted("Each attempt takes the level of its most severe threat vector; an attempt can match several vectors, so vector shares do not add up to 100%.", { fontSize: 8, margin: [0, 4, 0, 0] }),
  ];
};

// "set `PasswordAuthentication no` in ..." -> mono runs for the backticked parts
const withCode = (text) => text.split("`").map((part, i) => (i % 2 ? mono(part, { fontSize: 9.5 }) : { text: part }));

const recommendationsBlock = (items) => items.length
  ? [{ ol: items.map((item) => ({ text: withCode(item) })), markerColor: COLORS.muted, lineHeight: 1.25, margin: [0, 0, 0, 0] }]
  : [muted("No recommendations: nothing in this period's data called for action.")];

const methodologyBlock = (data, meta) => {
  const tz = timezoneLabel(data.window.timeZone);
  const vectors = THREAT_VECTORS.filter((v) => SUCCESSFUL_LOGINS_TRACKED || v.key !== "successful_login");
  // Each subheading stays on the same page as its content
  const group = (title, ...content) => ({ stack: [subheading(title), ...content], unbreakable: true, margin: [0, 0, 0, 10] });
  return [
    group(
      "Data source",
      { text: `Each record is one failed SSH login captured by the Cowrie honeypot and forwarded by the Obsera agent. The agent does not forward successful logins or session commands, so they are not covered. All times are in ${tz} (${data.window.timeZone}); the CSV export also contains UTC timestamps. The report covers the fixed period printed on page 1 and was generated on ${formatDateTime(meta.generatedAt, data.window.timeZone)} ${tz}.` },
    ),
    group(
      "Source risk (per IP)",
      { text: `Set by attempt volume only, the same rule as the dashboard: Low ≤ ${RISK_THRESHOLDS.medium} attempts, Medium ${RISK_THRESHOLDS.medium + 1}–${RISK_THRESHOLDS.high}, High > ${RISK_THRESHOLDS.high}. The reason line also notes a high rate (> ${HIGH_RATE_PER_MINUTE} attempts per minute) and whether root or privileged accounts were tried.` },
    ),
    group(
      "Attempt risk and threat vectors",
      table(
        [118, 50, "*"],
        [th("Threat vector"), th("Level"), th("Rule")],
        [
          ...vectors.map((v) => [v.label, statusLabel(v.level), { text: v.definition, fontSize: 8.5 }]),
          [{ text: "(none)" }, statusLabel("Low"), { text: "No vector matched.", fontSize: 8.5 }],
        ],
      ),
    ),
    group(
      "Username categories",
      table(
        [118, "*"],
        [th("Category"), th("Rule")],
        USERNAME_CATEGORIES.map((c) => [c.label, { text: c.definition, fontSize: 8.5 }]),
      ),
    ),
    group(
      `Common-password list (${COMMON_PASSWORDS.length} entries, case-insensitive)`,
      mono(COMMON_PASSWORDS.join("  "), { fontSize: 7, color: COLORS.muted, lineHeight: 1.3 }),
    ),
    group(
      "Finding thresholds",
      {
        ul: [
          `Single dominant source: one source with ≥ ${pct(FINDING_THRESHOLDS.dominantSourceShare)} of attempts.`,
          `Automated tool: a source above ${HIGH_RATE_PER_MINUTE} attempts per minute.`,
          `Dictionary / password spraying: ≥ ${FINDING_THRESHOLDS.dictionaryMinUsernames} usernames and ≥ ${FINDING_THRESHOLDS.dictionaryMinPasswords} passwords, each password tried on ≥ ${pct(FINDING_THRESHOLDS.dictionaryCoverage)} of the usernames on average.`,
          `Common passwords: ≥ ${pct(FINDING_THRESHOLDS.commonPasswordShare)} of attempts use a password from the list above.`,
          "Private network: the source address is in an RFC 1918 (IPv4) or RFC 4193 (IPv6) range.",
        ],
        markerColor: COLORS.muted,
        fontSize: 9,
      },
    ),
  ];
};

const logSampleBlock = (data, meta) => {
  const tz = timezoneLabel(data.window.timeZone);
  if (!data.recent.length) return [muted("No attempts in this period.")];
  return [
    table(
      [118, 72, "*", "*", 60],
      [th(`Time (${tz})`), th("IP"), th("Username"), th("Password"), th("Risk")],
      data.recent.map((e) => [
        mono(formatDateTime(e.time, data.window.timeZone), { noWrap: true }),
        mono(e.ip),
        mono(e.username ?? "—"),
        mono(e.password ?? "—"),
        statusLabel(e.risk.level),
      ]),
    ),
    muted(`The ${data.recent.length} most recent attempts, newest first. The full log (${n(data.totals.attempts)} rows) is in the CSV file ${meta.reportId}.csv generated with this report.`, { fontSize: 8, margin: [0, 4, 0, 0] }),
  ];
};

// ---------- document ----------

/**
 * @param {object} data   result of buildReportData
 * @param {{ reportId: string, periodLabel: string, generatedAt: Date, generatedBy: string|null, summary: string[], findings: object[], recommendations: string[] }} meta
 */
const buildDocDefinition = (data, meta) => {
  const credentials = credentialsBlock(data);
  const runningTitle = `OBSERA · SSH Honeypot Activity Report · ${meta.reportId}`;

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [PAGE_MARGIN_X, 52, PAGE_MARGIN_X, 48],
    info: { title: `SSH Honeypot Activity Report ${meta.reportId}`, author: "Obsera", subject: meta.periodLabel },
    defaultStyle: { font: FONT.sans, fontSize: 10, color: COLORS.foreground, lineHeight: 1.2 },
    styles: {
      title: { fontSize: 20, bold: true, margin: [0, 18, 0, 10] },
      h2: { fontSize: 13, bold: true },
      h3: { fontSize: 10, bold: true },
      table: { fontSize: 9, lineHeight: 1.1 },
      th: { bold: true, color: COLORS.muted, fontSize: 8.5 },
    },
    header: (currentPage) => (currentPage === 1 ? null : {
      margin: [PAGE_MARGIN_X, 22, PAGE_MARGIN_X, 0],
      stack: [
        {
          columns: [
            { svg: LOGO_SVG, width: 11, height: 11 },
            { text: runningTitle, fontSize: 8, color: COLORS.muted, margin: [5, 1, 0, 0] },
          ],
        },
        { ...hairline(), margin: [0, 6, 0, 0] },
      ],
    }),
    footer: (currentPage, pageCount) => ({
      margin: [PAGE_MARGIN_X, 18, PAGE_MARGIN_X, 0],
      columns: [
        mono("INTERNAL", { fontSize: 8, color: COLORS.muted }),
        mono(`Page ${currentPage} of ${pageCount}`, { fontSize: 8, color: COLORS.muted, alignment: "right" }),
      ],
    }),
    // Keep a heading off the last lines of a page
    pageBreakBefore: (node) => node.headlineLevel === 1 && node.startPosition.verticalRatio > 0.8,
    content: [
      documentHeader(meta),
      { text: "SSH Honeypot Activity Report", style: "title" },
      metadataBlock(meta, data),
      section("Executive summary", [{ text: meta.summary.join(" "), lineHeight: 1.35 }, ...metricStrip(data)]),
      section("Key findings", findingsBlock(meta.findings)),
      section("Time pattern", timePatternBlock(data)),
      section("Attack sources", sourcesBlock(data)),
      // Two blocks, so the category table can start a new page without dragging the top lists along
      section("Credential analysis", credentials.top),
      { stack: credentials.categories, unbreakable: true, margin: [0, 14, 0, 0] },
      section("Risk distribution", riskBlock(data)),
      section("Recommendations", recommendationsBlock(meta.recommendations)),
      section("Appendix A · Methodology", methodologyBlock(data, meta), { pageBreak: "before", breakable: true }),
      section("Appendix B · Log sample", logSampleBlock(data, meta), { breakable: true }),
    ],
  };
};

const printer = new PdfPrinter(FONT_FILES);

/** @returns {Promise<Buffer>} */
const renderReportPdf = (data, meta) => new Promise((resolve, reject) => {
  const doc = printer.createPdfKitDocument(buildDocDefinition(data, meta));
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  doc.on("end", () => resolve(Buffer.concat(chunks)));
  doc.on("error", reject);
  doc.end();
});

module.exports = { renderReportPdf };
