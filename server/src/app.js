const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const aiRoutes = require("./routes/aiRoutes");
const {
  applySecurityHeaders,
  apiWriteRateLimiter,
} = require("./middleware/securityMiddleware");

const app = express();
const configuredOrigins = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOriginPattern =
  /^https?:\/\/((localhost|127\.0\.0\.1)|(\d{1,3}\.){3}\d{1,3})(:\d+)?$/;

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        configuredOrigins.includes(origin) ||
        allowedOriginPattern.test(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(applySecurityHeaders);
app.use(express.json({ limit: "20mb" }));
app.use(["/api/contacts", "/api/auth", "/api/ai"], (req, res, next) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    return apiWriteRateLimiter(req, res, next);
  }

  return next();
});

app.get("/", (req, res) => {
  res.send("API is running");
});

app.use("/api/auth", authRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/ai", aiRoutes);

module.exports = app;
