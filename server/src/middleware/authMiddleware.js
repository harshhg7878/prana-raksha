const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  consumeRealtimeAccessToken,
} = require("../services/realtimeAccessTokenService");

const SESSION_COOKIE_NAME = "prana_raksha_session";

const getCookieValue = (req, cookieName) => {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const matchedCookie = cookies.find((item) => item.startsWith(`${cookieName}=`));

  if (!matchedCookie) {
    return null;
  }

  return decodeURIComponent(matchedCookie.slice(cookieName.length + 1));
};

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  const cookieToken = getCookieValue(req, SESSION_COOKIE_NAME);

  if (cookieToken) {
    return cookieToken;
  }

  return null;
};

const authenticateRequest = async (req) => {
  const token = getTokenFromRequest(req);

  if (!token) {
    return { error: "Not authorized, token missing" };
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select("-password");

  if (!user) {
    return { error: "User not found" };
  }

  return { user };
};

const protect = async (req, res, next) => {
  try {
    const { user, error } = await authenticateRequest(req);

    if (!user) {
      return res.status(401).json({ message: error || "Not authorized" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, invalid token" });
  }
};

const protectEventStream = async (req, res, next) => {
  try {
    const streamToken =
      typeof req.query.streamToken === "string" ? req.query.streamToken : "";
    const streamAccess = consumeRealtimeAccessToken(streamToken);

    if (!streamAccess?.userId) {
      return res.status(401).json({ message: "Not authorized, invalid stream token" });
    }

    const user = await User.findById(streamAccess.userId).select("-password");

    if (!user || user.role !== streamAccess.role) {
      return res.status(401).json({ message: "Not authorized, invalid stream token" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, invalid token" });
  }
};

module.exports = { protect, protectEventStream };
