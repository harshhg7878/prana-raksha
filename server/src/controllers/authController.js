const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const AdminSettings = require("../models/AdminSettings");
const { emitRealtimeEvent } = require("../services/realtimeService");
const {
  issueRealtimeAccessToken,
} = require("../services/realtimeAccessTokenService");

const SESSION_COOKIE_NAME = "prana_raksha_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const generateToken = (user) =>
  jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone || "",
  primaryHospital: user.primaryHospital || "",
  locationSharing: user.locationSharing ?? true,
  alertMethod: user.alertMethod || "SMS + Push",
  profileStatus: user.profileStatus || "Active",
});

const getAdminSettings = async () => {
  let settings = await AdminSettings.findOne({ key: "global" });

  if (!settings) {
    settings = await AdminSettings.create({ key: "global" });
  }

  return settings;
};

const allowedRoles = ["user", "hospital", "admin"];

const normalizeRole = (value) => {
  if (typeof value !== "string") {
    return "user";
  }

  const normalizedValue = value.trim().toLowerCase();
  return allowedRoles.includes(normalizedValue) ? normalizedValue : "user";
};

const isValidEmail = (value) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

const buildCookieOptions = (req, maxAge = SESSION_MAX_AGE_MS) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: Boolean(req.secure || req.headers["x-forwarded-proto"] === "https"),
  path: "/",
  maxAge,
});

const setSessionCookie = (res, req, token) => {
  res.cookie(SESSION_COOKIE_NAME, token, buildCookieOptions(req));
};

const clearSessionCookie = (res, req) => {
  res.clearCookie(SESSION_COOKIE_NAME, buildCookieOptions(req, 0));
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, primaryHospital } = req.body;
    const adminSettings = await getAdminSettings();
    const normalizedRole = normalizeRole(role);
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(name || "").trim();
    const normalizedHospitalName = String(primaryHospital || "").trim();

    if (!normalizedName || !normalizedEmail || !password) {
      return res.status(400).json({ message: "All required fields are needed" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    if (adminSettings.maintenanceMode) {
      return res.status(503).json({ message: "Platform is currently in maintenance mode" });
    }

    if (normalizedRole === "user" && !adminSettings.allowUserRegistration) {
      return res.status(403).json({ message: "User registration is disabled by admin settings" });
    }

    if (normalizedRole === "hospital" && !normalizedHospitalName) {
      return res.status(400).json({ message: "Hospital name is required for hospital registration" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      password: hashedPassword,
      role: normalizedRole,
      primaryHospital:
        normalizedRole === "hospital" ? normalizedHospitalName : "",
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const adminSettings = await getAdminSettings();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const requestedRole =
      typeof role === "string" ? role.trim().toLowerCase() : "";

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    if (adminSettings.maintenanceMode && requestedRole !== "admin") {
      return res.status(503).json({ message: "Platform is currently in maintenance mode" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (requestedRole && user.role !== requestedRole) {
      return res.status(403).json({ message: "Role mismatch" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user);
    setSessionCookie(res, req, token);

    return res.status(200).json({
      message: "Login successful",
      user: serializeUser(user),
      token,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user: serializeUser(user) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const {
      name,
      phone,
      primaryHospital,
      locationSharing,
      alertMethod,
      profileStatus,
    } = req.body;

    const user = await User.findById(req.user._id);
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
    const normalizedHospitalName =
      typeof primaryHospital === "string" ? primaryHospital.trim() : "";

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (typeof name === "string") {
      if (!normalizedName) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      user.name = normalizedName;
    }

    if (typeof phone === "string") {
      if (normalizedPhone.length > 20) {
        return res.status(400).json({ message: "Phone number is too long" });
      }

      user.phone = normalizedPhone;
    }

    if (typeof primaryHospital === "string") {
      if (normalizedHospitalName.length > 120) {
        return res.status(400).json({ message: "Hospital name is too long" });
      }

      user.primaryHospital = normalizedHospitalName;
    }

    if (typeof locationSharing === "boolean") {
      user.locationSharing = locationSharing;
    }

    if (["SMS", "Push", "SMS + Push"].includes(alertMethod)) {
      user.alertMethod = alertMethod;
    }

    if (["Active", "Inactive"].includes(profileStatus)) {
      user.profileStatus = profileStatus;
    }

    await user.save();

    emitRealtimeEvent(
      {
        type: "profile-updated",
        reason: "profile-saved",
      },
      {
        userIds: [user._id.toString()],
      }
    );

    return res.status(200).json({
      message: "Profile updated successfully",
      user: serializeUser(user),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const createRealtimeStreamToken = async (req, res) => {
  try {
    const streamToken = issueRealtimeAccessToken({
      userId: req.user._id,
      role: req.user.role,
    });

    return res.status(200).json({
      streamToken,
      expiresInSeconds: 60,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const logoutUser = async (req, res) => {
  clearSessionCookie(res, req);
  return res.status(200).json({ message: "Logged out successfully" });
};

module.exports = {
  registerUser,
  loginUser,
  getMyProfile,
  updateMyProfile,
  createRealtimeStreamToken,
  logoutUser,
};
