import { apiFetch, apiUrl } from "./api";

export const subscribeToRealtimeUpdates = ({ onEvent }) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  let eventSource = null;
  let isClosed = false;
  let reconnectTimeoutId = null;

  const cleanupEventSource = () => {
    if (eventSource) {
      eventSource.removeEventListener("message", handleMessage);
      eventSource.removeEventListener("error", handleError);
      eventSource.close();
      eventSource = null;
    }
  };

  const scheduleReconnect = () => {
    if (isClosed || reconnectTimeoutId) {
      return;
    }

    reconnectTimeoutId = window.setTimeout(() => {
      reconnectTimeoutId = null;
      connect();
    }, 1500);
  };

  const connect = async () => {
    try {
      cleanupEventSource();

      const response = await apiFetch("/api/auth/realtime-token", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok || !data.streamToken || isClosed) {
        scheduleReconnect();
        return;
      }

      eventSource = new EventSource(
        apiUrl(`/api/contacts/events?streamToken=${encodeURIComponent(data.streamToken)}`)
      );

      eventSource.addEventListener("message", handleMessage);
      eventSource.addEventListener("error", handleError);
    } catch {
      scheduleReconnect();
    }
  };

  const handleMessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      onEvent?.(payload);
    } catch {
      // Ignore malformed heartbeat payloads.
    }
  };

  const handleError = () => {
    cleanupEventSource();
    scheduleReconnect();
  };

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimeoutId) {
      window.clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
    }
    cleanupEventSource();
  };
};
