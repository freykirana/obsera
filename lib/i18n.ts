/**
 * UI strings, centralised so the app can be translated later.
 *
 * Usage: t("nav.dashboard") or t("widgets.emptyIn", { message, range }).
 * To add a language, create a dictionary with the same keys (typed by `MessageKey`)
 * and select it in `t` (e.g. from a locale setting). English is the only locale today.
 *
 * Migrated so far: navigation, header, shared widget states, page titles/descriptions,
 * theme and accessibility labels. Page-specific body copy still lives in the pages and
 * should move here as those pages are touched.
 */
const en = {
  // App shell
  "app.name": "OBSERA",
  "app.skipToContent": "Skip to main content",
  "nav.label": "Main navigation",
  "nav.dashboard": "Dashboard",
  "nav.attackLogs": "Attack Logs",
  "nav.reports": "Reports",
  "nav.settings": "Settings",
  "nav.collapse": "Collapse sidebar",
  "nav.expand": "Expand sidebar",
  "nav.openMenu": "Open navigation menu",
  "nav.closeMenu": "Close navigation menu",

  // Header
  "header.account": "Account menu for {name}",
  "header.changePassword": "Change password",
  "header.logout": "Log out",
  "theme.label": "Theme",
  "theme.toggle": "Change color theme",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",

  // Shared widget states
  "widgets.loading": "Loading",
  "widgets.errorTitle": "Couldn't load this widget",
  "widgets.retry": "Retry",
  "widgets.emptyIn": "{message} {range}",
  "widgets.lastAttack": "Last attack",
  "widgets.noAttacksYet": "The honeypot has not recorded any attacks yet.",
  "widgets.show": "Show {range}",

  // Pages
  "pages.dashboard.title": "Dashboard Overview",
  "pages.dashboard.description": "SSH honeypot and brute-force attack metrics.",
  "pages.attackLogs.title": "Attack Logs",
  "pages.attackLogs.description": "Detailed record of all captured SSH brute-force attempts.",
  "pages.reports.title": "Threat Intelligence Reports",
  "pages.reports.description": "Generate and download intelligence reports for a reporting period.",
  "pages.settings.title": "Settings",
  "pages.settings.description": "Manage system configurations, user access control, and environment preferences.",

  // Tables
  "table.sortBy": "Sort by {column}",
  "table.firstPage": "First page",
  "table.previousPage": "Previous page",
  "table.nextPage": "Next page",
  "table.lastPage": "Last page",
} as const;

export type MessageKey = keyof typeof en;

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template: string = en[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}
