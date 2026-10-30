const path = require("path");
const fs = require("fs");

/**
 * Brand tokens for generated documents. Values mirror the light theme in app/globals.css
 * (the PDF is always on white paper).
 */
const COLORS = {
  foreground: "#0B1629",
  primary: "#1B6AD1",
  muted: "#5B6B80",
  border: "#E2E7EE",
  signal: "#D97706",
  critical: "#DC2626",
  // Neutral fill for share bars in tables
  neutralBar: "#B9C3D0",
  white: "#FFFFFF",
};

// Same families as the UI (next/font IBM Plex); OFL licence in assets/fonts/OFL.txt
const FONT_DIR = path.resolve(__dirname, "../../assets/fonts");
const FONT = { sans: "Sans", mono: "Mono" };
const FONT_FILES = {
  [FONT.sans]: {
    normal: path.join(FONT_DIR, "IBMPlexSans-Regular.woff"),
    bold: path.join(FONT_DIR, "IBMPlexSans-SemiBold.woff"),
    italics: path.join(FONT_DIR, "IBMPlexSans-Italic.woff"),
    bolditalics: path.join(FONT_DIR, "IBMPlexSans-SemiBold.woff"),
  },
  [FONT.mono]: {
    normal: path.join(FONT_DIR, "IBMPlexMono-Regular.woff"),
    bold: path.join(FONT_DIR, "IBMPlexMono-Medium.woff"),
    italics: path.join(FONT_DIR, "IBMPlexMono-Regular.woff"),
    bolditalics: path.join(FONT_DIR, "IBMPlexMono-Medium.woff"),
  },
};

// Logo from the frontend's public/brand folder, read once
const LOGO_SVG = fs.readFileSync(path.resolve(__dirname, "../../../public/brand/obsera-mark.svg"), "utf8");

// Risk level -> status dot color (same tones as the dashboard's RiskBadge)
const LEVEL_COLORS = {
  Critical: COLORS.critical,
  High: COLORS.critical,
  Medium: COLORS.signal,
  Low: COLORS.neutralBar,
};

const SEVERITY_COLORS = {
  critical: COLORS.critical,
  warning: COLORS.signal,
  info: COLORS.muted,
};

module.exports = { COLORS, FONT, FONT_FILES, LOGO_SVG, LEVEL_COLORS, SEVERITY_COLORS };
