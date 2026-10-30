const router = require("express").Router();
const prisma = require("../config/prisma");
const { authRequired } = require("../middlewares/auth.middleware");
const { listAudit } = require("../services/audit.service");

router.use(authRequired);

// GET /api/audit-log?limit=100 - newest first, with the actor's email resolved
router.get("/", async (req, res) => {
  try {
    const entries = listAudit({ limit: parseInt(req.query.limit, 10) || 100 });
    const actorIds = [...new Set(entries.map((e) => e.actor_user_id).filter(Boolean))];
    const users = actorIds.length
      ? await prisma.users.findMany({ where: { user_id: { in: actorIds } }, select: { user_id: true, email: true, display_name: true } })
      : [];
    const byId = new Map(users.map((u) => [u.user_id, u]));

    return res.status(200).json({
      ok: true,
      data: entries.map((e) => ({
        ...e,
        actor_email: e.actor_email || byId.get(e.actor_user_id)?.email || null,
        actor_name: byId.get(e.actor_user_id)?.display_name || null,
      })),
    });
  } catch (error) {
    console.error("Error fetching audit log:", error);
    return res.status(500).json({ ok: false, message: "Failed to fetch audit log" });
  }
});

module.exports = router;
