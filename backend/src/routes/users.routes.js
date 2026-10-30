const router = require("express").Router();
const { getUsers, createUser, deleteUser } = require("../controllers/users.controller");
const { authRequired } = require("../middlewares/auth.middleware");
const { checkSession } = require("../middlewares/checkSession");
const { audit } = require("../services/audit.service");

// Protect all user routes
router.use(authRequired);
router.use(checkSession);

router.get("/", getUsers);
router.post("/", audit("user.create", (req) => req.body?.email || null), createUser);
router.delete("/:user_id", audit("user.delete", (req) => req.params.user_id), deleteUser);

module.exports = router;
