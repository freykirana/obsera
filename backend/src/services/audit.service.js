/**
 * Audit trail of administrative actions (who did what, when).
 *
 * TODO: persist to an audit_logs table (audit_id, at, actor_user_id, actor_email, action,
 * target, ip). The in-memory buffer below keeps the latest entries only and is
 * cleared when the backend restarts.
 */

const MAX_ENTRIES = 1000;
const entries = [];

const recordAudit = ({ actorUserId = null, actorEmail = null, action, target = null, ip = null }) => {
  entries.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    actor_user_id: actorUserId,
    actor_email: actorEmail,
    action,
    target,
    ip,
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
};

const listAudit = ({ limit = 100 } = {}) => entries.slice(0, Math.min(Math.max(limit, 1), MAX_ENTRIES));

/**
 * Express middleware: record `action` once the response finished successfully (status < 400).
 * @param {string} action - e.g. "settings.update"
 * @param {(req: import("express").Request) => string|null} [describeTarget]
 */
const audit = (action, describeTarget) => (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    recordAudit({
      actorUserId: req.user?.user_id || null,
      actorEmail: req.auditActorEmail || null,
      action,
      target: describeTarget ? describeTarget(req) : null,
      ip: req.ip || null,
    });
  });
  next();
};

module.exports = { recordAudit, listAudit, audit };
