const express = require("express");

const {
  registerUser,
  loginUser,
  getMyProfile,
  updateMyProfile,
  createRealtimeStreamToken,
  logoutUser,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/profile", protect, getMyProfile);
router.patch("/profile", protect, updateMyProfile);
router.post("/realtime-token", protect, createRealtimeStreamToken);

module.exports = router;
