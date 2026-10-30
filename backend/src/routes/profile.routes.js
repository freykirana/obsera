const router = require("express").Router();
const { updateProfile, getProfile } = require("../controllers/profile.controller");
const { authRequired } = require("../middlewares/auth.middleware");

router.get("/", authRequired, getProfile);
router.patch("/", authRequired, updateProfile);

module.exports = router;
