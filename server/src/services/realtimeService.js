const clients = new Map();

const buildClientKey = (userId, role) =>
  `${userId.toString()}:${role}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

const registerRealtimeClient = ({ userId, role, res }) => {
  const clientKey = buildClientKey(userId, role);
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25000);

  clients.set(clientKey, {
    userId: userId.toString(),
    role,
    res,
    heartbeat,
  });

  return () => {
    clearInterval(heartbeat);
    clients.delete(clientKey);
  };
};

const shouldDeliverToClient = (client, targets = {}) => {
  const roleTargets = Array.isArray(targets.roles) ? targets.roles : [];
  const userTargets = Array.isArray(targets.userIds)
    ? targets.userIds.map((value) => value.toString())
    : [];

  if (!roleTargets.length && !userTargets.length) {
    return true;
  }

  return roleTargets.includes(client.role) || userTargets.includes(client.userId);
};

const emitRealtimeEvent = (payload, targets = {}) => {
  const serialized = `data: ${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...payload,
  })}\n\n`;

  for (const client of clients.values()) {
    if (!shouldDeliverToClient(client, targets)) {
      continue;
    }

    client.res.write(serialized);
  }
};

module.exports = {
  registerRealtimeClient,
  emitRealtimeEvent,
};
