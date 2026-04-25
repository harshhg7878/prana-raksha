const crypto = require("crypto");

const STREAM_TOKEN_TTL_MS = 60 * 1000;
const streamTokens = new Map();

const cleanupExpiredTokens = () => {
  const now = Date.now();

  for (const [token, payload] of streamTokens.entries()) {
    if (!payload || payload.expiresAt <= now) {
      streamTokens.delete(token);
    }
  }
};

const issueRealtimeAccessToken = ({ userId, role }) => {
  cleanupExpiredTokens();

  const token = crypto.randomBytes(24).toString("hex");
  streamTokens.set(token, {
    userId: userId.toString(),
    role,
    expiresAt: Date.now() + STREAM_TOKEN_TTL_MS,
  });

  return token;
};

const consumeRealtimeAccessToken = (token) => {
  cleanupExpiredTokens();

  if (!token || typeof token !== "string") {
    return null;
  }

  const payload = streamTokens.get(token);

  if (!payload) {
    return null;
  }

  streamTokens.delete(token);
  return payload.expiresAt > Date.now() ? payload : null;
};

module.exports = {
  issueRealtimeAccessToken,
  consumeRealtimeAccessToken,
};
