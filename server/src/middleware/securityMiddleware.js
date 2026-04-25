const buildClientKey = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const isProduction = process.env.NODE_ENV === "production";

const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  maxRequests = 100,
  message = "Too many requests, please try again later.",
} = {}) => {
  const requestLog = new Map();

  return (req, res, next) => {
    const clientKey = buildClientKey(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    const recentRequests = (requestLog.get(clientKey) || []).filter(
      (timestamp) => timestamp > windowStart
    );

    recentRequests.push(now);
    requestLog.set(clientKey, recentRequests);

    if (recentRequests.length > maxRequests) {
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(429).json({ message });
    }

    return next();
  };
};

const applySecurityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(self), microphone=(), camera=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  );

  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  return next();
};

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: parsePositiveInteger(
    process.env.AUTH_RATE_LIMIT_MAX,
    isProduction ? 20 : 200
  ),
  message: "Too many authentication attempts. Please wait and try again.",
});

const apiWriteRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: parsePositiveInteger(
    process.env.API_WRITE_RATE_LIMIT_MAX,
    isProduction ? 120 : 500
  ),
  message: "Too many write requests. Please slow down and try again.",
});

module.exports = {
  applySecurityHeaders,
  authRateLimiter,
  apiWriteRateLimiter,
};
