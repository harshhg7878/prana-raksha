const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const SESSION_TOKEN_KEY = "pranaRakshaToken";

const inferApiBaseUrl = () => {
  if (configuredApiBase) {
    return configuredApiBase;
  }

  if (import.meta.env.DEV) {
    return "";
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:5000`;
};

export const API_BASE_URL = inferApiBaseUrl();

export const apiUrl = (path) => `${API_BASE_URL}${path}`;

export const getSessionToken = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return localStorage.getItem(SESSION_TOKEN_KEY) || "";
};

export const setSessionToken = (token) => {
  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    return;
  }

  localStorage.removeItem(SESSION_TOKEN_KEY);
};

export const apiFetch = (path, options = {}) => {
  const { headers = {}, credentials = "include", ...restOptions } = options;
  const sessionToken = getSessionToken();

  return fetch(apiUrl(path), {
    credentials,
    ...restOptions,
    headers: {
      ...(sessionToken && !headers.Authorization
        ? { Authorization: `Bearer ${sessionToken}` }
        : {}),
      ...headers,
    },
  }).then((response) => {
    if (response.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("user");
      setSessionToken("");

      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }

    return response;
  });
};

export const logoutSession = async () => {
  try {
    await apiFetch("/api/auth/logout", {
      method: "POST",
    });
  } catch {
    // Best-effort logout. Client state is still cleared locally.
  } finally {
    setSessionToken("");
  }
};
