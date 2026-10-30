const router = require("express").Router();
const { authRequired } = require("../middlewares/auth.middleware");
const { getUsers } = require("../controllers/admin.controller");

// Get all admin users for RBAC settings (protected in production)
// router.get("/users", authRequired, getUsers);
router.get("/users", getUsers);

module.exports = router;
