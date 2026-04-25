import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/admin.css";
import { apiFetch, logoutSession } from "../lib/api";
import { subscribeToRealtimeUpdates } from "../lib/realtime";

const defaultStats = {
  totalAlerts: 0,
  activeAlerts: 0,
  resolvedAlerts: 0,
};

const defaultPopupData = {
  unreadCount: 0,
  notifications: [],
};

const defaultAnalytics = {
  summary: {
    totalIncidents: 0,
    incidentsToday: 0,
    incidentsThisWeek: 0,
    activeAlerts: 0,
    pendingAlerts: 0,
    resolvedAlerts: 0,
    resolvedThisWeek: 0,
    resolutionRate: 0,
    averageResolutionMinutes: 0,
    totalContactsReached: 0,
    totalContactAttempts: 0,
    failedDeliveries: 0,
    deliverySuccessRate: 0,
  },
  statusBreakdown: {
    active: 0,
    pending: 0,
    resolved: 0,
  },
  trend: [],
  topUsers: [],
  topLocations: [],
};

const defaultSettings = {
  platformName: "Prana Raksha",
  controlRoomEmail: "",
  controlRoomPhone: "",
  defaultHospitalLabel: "Awaiting assignment",
  autoRefreshSeconds: 5,
  analyticsWindowDays: 7,
  allowUserRegistration: true,
  maintenanceMode: false,
  smsAlertsEnabled: true,
  emailAlertsEnabled: false,
  incidentAutoAssignment: false,
  adminNotes: "",
  updatedAt: "",
};

const activities = [
  {
    title: "Auto-refresh enabled",
    text: "Admin dashboard stats refresh automatically from the incident database.",
    tone: "green",
  },
  {
    title: "Live monitoring",
    text: "Active and resolved alert totals update every few seconds.",
    tone: "yellow",
  },
  {
    title: "Central visibility",
    text: "Counts reflect all incident alerts across the platform for admin users.",
    tone: "red",
  },
];

const navItems = [
  { key: "dashboard", icon: "DB", label: "Dashboard" },
  { key: "incidents", icon: "AL", label: "Incidents" },
  { key: "hospitals", icon: "HP", label: "Hospitals" },
  { key: "users", icon: "US", label: "Users" },
  { key: "analytics", icon: "AN", label: "Analytics" },
  { key: "settings", icon: "ST", label: "Settings" },
];

const formatTimeAgo = (value) => {
  if (!value) {
    return "Just now";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  const diffInMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

  if (diffInMinutes < 1) {
    return "Just now";
  }

  if (diffInMinutes < 60) {
    return `${diffInMinutes} min ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);

  if (diffInHours < 24) {
    return `${diffInHours} hr ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays} day${diffInDays === 1 ? "" : "s"} ago`;
};

const getPageTitle = (activeNav) => {
  switch (activeNav) {
    case "popups":
      return "Popup Alerts";
    case "incidents":
      return "Incidents";
    case "hospitals":
      return "Hospitals";
    case "users":
      return "Users";
    case "analytics":
      return "Analytics";
    case "settings":
      return "Settings";
    default:
      return "Admin Dashboard";
  }
};

const formatResolutionTime = (minutes) => {
  if (!minutes) {
    return "No resolved cases yet";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
};

const playIncidentAlertSound = () => {
  if (typeof window === "undefined") {
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  try {
    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    oscillator.frequency.setValueAtTime(660, now + 0.16);

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.36);

    oscillator.onended = () => {
      audioContext.close().catch(() => {});
    };
  } catch {
    // Ignore browser audio restrictions.
  }
};

const renderNearestHospitals = ({
  hospitals = [],
  compact = false,
  incidentId = "",
  onSendToHospital = null,
  canSend = true,
}) => {
  if (!hospitals.length) {
    return null;
  }

  return (
    <div className={`admin-nearest-hospitals ${compact ? "compact" : ""}`}>
      <p className="admin-nearest-heading">Nearest Hospitals</p>
      <div className="admin-nearest-list">
        {hospitals.map((hospital, index) => (
          <div className="admin-nearest-card" key={`${hospital.hospitalName}-${index}`}>
            <div className="admin-nearest-top">
              <strong>{hospital.hospitalName}</strong>
              <div className="admin-nearest-status-group">
                <span className={`admin-connect-badge ${hospital.isConnected ? "connected" : "disconnected"}`}>
                  {hospital.isConnected ? "Connected" : "Not Connected"}
                </span>
                <span className="meta-pill">{hospital.distanceKm} km</span>
              </div>
            </div>
            {!compact && hospital.address ? (
              <p className="admin-nearest-address">{hospital.address}</p>
            ) : null}
            <div className="admin-nearest-meta">
              {hospital.source ? <span className="meta-pill">{hospital.source}</span> : null}
              <span className="meta-pill">Beds {hospital.freeBeds}/{hospital.totalBeds}</span>
              <span className="meta-pill">ICU {hospital.icuFree}</span>
              <span className="meta-pill">ETA {hospital.ambulanceEtaMinutes} min</span>
            </div>
            {hospital.isConnected && incidentId && canSend ? (
              <button
                className="ghost-btn admin-send-hospital-btn"
                type="button"
                onClick={() => onSendToHospital?.(incidentId, hospital.hospitalName)}
              >
                Send to Dashboard
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function Admin() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("dashboard");
  const [incidentCategory, setIncidentCategory] = useState("all");
  const [stats, setStats] = useState(defaultStats);
  const [popupData, setPopupData] = useState(defaultPopupData);
  const [analytics, setAnalytics] = useState(defaultAnalytics);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [dashboardMessage, setDashboardMessage] = useState("");
  const [isRefreshingDashboard, setIsRefreshingDashboard] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [incidentPopup, setIncidentPopup] = useState(null);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const shownPopupIdRef = useRef("");
  const notificationPanelRef = useRef(null);
  const navigate = useNavigate();

  const redirectToLogin = () => {
    navigate("/login", { replace: true });
  };

  const validateSession = () => {
    const activeUser = JSON.parse(localStorage.getItem("user") || "null");

    if (activeUser?.role !== "admin") {
      redirectToLogin();
      return false;
    }

    return true;
  };

  const fetchAdminDashboard = async ({ silent = false } = {}) => {
    if (!validateSession()) {
      setLoadError("Admin session missing. Please log in again.");
      setIsLoading(false);
      return;
    }

    if (!silent) {
      setIsLoading(true);
    }

    try {
      const [statsRes, popupRes, incidentsRes, hospitalsRes, usersRes, analyticsRes, settingsRes] = await Promise.all([
        apiFetch("/api/contacts/admin-dashboard-alerts"),
        apiFetch("/api/contacts/admin-popup-alerts"),
        apiFetch("/api/contacts/admin-incidents"),
        apiFetch("/api/contacts/admin-hospitals"),
        apiFetch("/api/contacts/admin-users"),
        apiFetch("/api/contacts/admin-analytics"),
        apiFetch("/api/contacts/admin-settings"),
      ]);

      const statsData = await statsRes.json();
      const popupResponseData = await popupRes.json();
      const incidentsData = await incidentsRes.json();
      const hospitalsData = await hospitalsRes.json();
      const usersData = await usersRes.json();
      const analyticsData = await analyticsRes.json();
      const settingsData = await settingsRes.json();

      if (!statsRes.ok) {
        throw new Error(statsData.message || "Failed to load admin dashboard");
      }

      if (!popupRes.ok) {
        throw new Error(popupResponseData.message || "Failed to load popup alerts");
      }

      if (!incidentsRes.ok) {
        throw new Error(incidentsData.message || "Failed to load incidents");
      }

      if (!hospitalsRes.ok) {
        throw new Error(hospitalsData.message || "Failed to load hospitals");
      }

      if (!usersRes.ok) {
        throw new Error(usersData.message || "Failed to load users");
      }

      if (!analyticsRes.ok) {
        throw new Error(analyticsData.message || "Failed to load analytics");
      }

      if (!settingsRes.ok) {
        throw new Error(settingsData.message || "Failed to load admin settings");
      }

      setStats(statsData.stats || defaultStats);
      setPopupData({
        unreadCount: popupResponseData.unreadCount || 0,
        notifications: popupResponseData.notifications || [],
      });
      const latestUnreadPopup = (popupResponseData.notifications || []).find(
        (notification) => !notification.isRead
      );

      if (
        latestUnreadPopup &&
        latestUnreadPopup.id !== shownPopupIdRef.current
      ) {
        shownPopupIdRef.current = latestUnreadPopup.id;
        setIncidentPopup(latestUnreadPopup);
        playIncidentAlertSound();
      }
      setIncidents(incidentsData.incidents || []);
      setHospitals(hospitalsData.hospitals || []);
      setUsers(usersData.users || []);
      setAnalytics(analyticsData || defaultAnalytics);
      setSettings({ ...defaultSettings, ...(settingsData.settings || {}) });
      setLoadError("");

      return {
        stats: statsData.stats || defaultStats,
        popupData: {
          unreadCount: popupResponseData.unreadCount || 0,
          notifications: popupResponseData.notifications || [],
        },
        incidents: incidentsData.incidents || [],
        hospitals: hospitalsData.hospitals || [],
        users: usersData.users || [],
        analytics: analyticsData || defaultAnalytics,
        settings: { ...defaultSettings, ...(settingsData.settings || {}) },
      };
    } catch (error) {
      setLoadError(error.message || "Failed to load admin dashboard");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!validateSession()) {
      return undefined;
    }

    const initialFetchTimeoutId = window.setTimeout(() => {
      fetchAdminDashboard();
    }, 0);

    const pollingDelay = Math.max((Number(settings.autoRefreshSeconds) || 5) * 1000, 5000);
    const intervalId = window.setInterval(() => {
      fetchAdminDashboard({ silent: true });
    }, pollingDelay);

    const handlePageShow = () => {
      validateSession();
    };

    const handleStorage = () => {
      validateSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        validateSession();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearTimeout(initialFetchTimeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [settings.autoRefreshSeconds]);

  useEffect(() => {
    if (!validateSession()) {
      return undefined;
    }

    return subscribeToRealtimeUpdates({
      onEvent: async (event) => {
        if (
          ![
            "incident-updated",
            "admin-popup-created",
            "admin-settings-updated",
            "hospital-profile-updated",
            "connected",
          ].includes(event.type)
        ) {
          return;
        }

        if (event.type === "admin-popup-created" && event.notification) {
          shownPopupIdRef.current = event.notification.id;
          setIncidentPopup(event.notification);
          playIncidentAlertSound();
          fetchAdminDashboard({ silent: true });
          return;
        }

        const dashboardData = await fetchAdminDashboard({ silent: true });

        if (
          event.type === "admin-popup-created" &&
          dashboardData?.popupData?.notifications?.length
        ) {
          const popupIncident =
            dashboardData.popupData.notifications.find(
              (notification) =>
                notification.id === event.notificationId ||
                notification.incidentId === event.incidentId
            ) || dashboardData.popupData.notifications[0];

          if (popupIncident) {
            shownPopupIdRef.current = popupIncident.id;
            setIncidentPopup(popupIncident);
            playIncidentAlertSound();
          }
        }
      },
    });
  }, []);

  useEffect(() => {
    if (!incidentPopup) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      markPopupAsRead(incidentPopup.id);
      setIncidentPopup(null);
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [incidentPopup]);

  useEffect(() => {
    const latestUnreadPopup = (popupData.notifications || []).find(
      (notification) => !notification.isRead
    );

    if (!latestUnreadPopup) {
      return;
    }

    if (latestUnreadPopup.id === shownPopupIdRef.current) {
      return;
    }

    shownPopupIdRef.current = latestUnreadPopup.id;
    setIncidentPopup(latestUnreadPopup);
    playIncidentAlertSound();
  }, [popupData.notifications]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!notificationPanelRef.current?.contains(event.target)) {
        setIsNotificationPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  const handleLogout = async () => {
    await logoutSession();
    localStorage.removeItem("user");
    redirectToLogin();
  };

  const refreshDashboardNow = async () => {
    setDashboardMessage("");
    setIsRefreshingDashboard(true);

    const dashboardData = await fetchAdminDashboard();

    if (dashboardData) {
      setDashboardMessage("Dashboard refreshed successfully.");
    }

    setIsRefreshingDashboard(false);
  };

  const exportAdminReport = async () => {
    if (!validateSession()) {
      return;
    }

    setDashboardMessage("");
    setIsExportingReport(true);

    try {
      const res = await apiFetch("/api/contacts/admin-report");

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to export report");
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || "prana-raksha-admin-report.csv";
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setDashboardMessage("Report exported successfully.");
    } catch (error) {
      setLoadError(error.message || "Failed to export report");
    } finally {
      setIsExportingReport(false);
    }
  };

  const sendIncidentToHospitalDashboard = async (incidentId, hospitalName) => {
    if (!incidentId || !hospitalName || !validateSession()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/contacts/admin-incidents/${incidentId}/assign-hospital`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hospitalName }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to send incident to hospital dashboard");
      }

      setLoadError("");
      fetchAdminDashboard({ silent: true });
    } catch (error) {
      setLoadError(error.message || "Failed to send incident to hospital dashboard");
    }
  };

  async function markPopupAsRead(popupId) {
    if (!popupId || !validateSession()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/contacts/admin-popup-alerts/${popupId}/read`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to mark popup as read");
      }

      setPopupData((current) => ({
        unreadCount: Math.max(
          0,
          current.unreadCount - (current.notifications.some((item) => item.id === popupId && !item.isRead) ? 1 : 0)
        ),
        notifications: current.notifications.map((item) =>
          item.id === popupId
            ? { ...item, isRead: true, readAt: data.notification?.readAt || new Date().toISOString() }
            : item
        ),
      }));
    } catch (error) {
      setLoadError(error.message || "Failed to mark popup as read");
    }
  }

  const handleSettingsChange = (event) => {
    const { name, type, value, checked } = event.target;
    setSettings((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
    setSettingsMessage("");
  };

  const saveSettings = async (event) => {
    event.preventDefault();

    if (!validateSession()) {
      return;
    }

    setIsSavingSettings(true);
    setSettingsMessage("");

    try {
      const res = await apiFetch("/api/contacts/admin-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...settings,
          autoRefreshSeconds: Number(settings.autoRefreshSeconds),
          analyticsWindowDays: Number(settings.analyticsWindowDays),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to save settings");
      }

      setSettings({ ...defaultSettings, ...(data.settings || {}) });
      setSettingsMessage(data.message || "Settings saved");
    } catch (error) {
      setSettingsMessage(error.message || "Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return incidents;
    }

    return incidents.filter((incident) =>
      [
        incident.code,
        incident.title,
        incident.location,
        incident.status,
        incident.hospital,
        incident.userName,
        incident.userEmail,
        incident.userPhone,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [incidents, searchTerm]);

  const categorizedIncidents = useMemo(() => {
    switch (incidentCategory) {
      case "pending":
        return filteredIncidents.filter((incident) => incident.hospital === "Awaiting assignment");
      case "assigned":
        return filteredIncidents.filter(
          (incident) => incident.hospital !== "Awaiting assignment" && !incident.hospitalAccepted
        );
      case "accepted":
        return filteredIncidents.filter(
          (incident) => incident.hospital !== "Awaiting assignment" && incident.hospitalAccepted && incident.status !== "resolved"
        );
      case "resolved":
        return filteredIncidents.filter((incident) => incident.status === "resolved");
      default:
        return filteredIncidents;
    }
  }, [filteredIncidents, incidentCategory]);

  const filteredHospitals = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return hospitals;
    }

    return hospitals.filter((hospital) =>
      [
        hospital.hospitalName,
        hospital.address,
        hospital.userName,
        hospital.userEmail,
        hospital.userPhone,
        hospital.profileStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [hospitals, searchTerm]);

  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    if (!query) {
      return users;
    }

    return users.filter((user) =>
      [
        user.name,
        user.email,
        user.phone,
        user.primaryHospital,
        user.alertMethod,
        user.profileStatus,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [users, searchTerm]);

  const liveIncidents = incidents.slice(0, 6);
  const trendMax = Math.max(...analytics.trend.map((item) => item.total), 1);

  const renderDashboard = () => (
    <>
      <section className="hero-panel glass-card">
        <div className="hero-copy">
          <p className="eyebrow">Live overview</p>
          <h2>Monitoring incidents, hospital routing, and emergency response in real time.</h2>
          <p className="hero-text">
            This control panel reads incident totals directly from your backend and refreshes
            automatically so admins always see the latest alert counts and case activity.
          </p>

          <div className="hero-actions">
            <button
              className="primary-btn"
              onClick={refreshDashboardNow}
              type="button"
              disabled={isRefreshingDashboard}
            >
              {isRefreshingDashboard ? "Refreshing..." : "Refresh Now"}
            </button>
            <button
              className="secondary-btn"
              onClick={exportAdminReport}
              type="button"
              disabled={isExportingReport}
            >
              {isExportingReport ? "Exporting..." : "Export Report"}
            </button>
          </div>
          {dashboardMessage ? <div className="admin-inline-alert admin-inline-success">{dashboardMessage}</div> : null}
        </div>

        <div className="hero-visual">
          <div className="visual-ring">
            <div className="visual-core">
              <span>{stats.activeAlerts}</span>
              <p>Live Active Alerts</p>
            </div>
          </div>
        </div>
      </section>

      {loadError && <div className="admin-inline-alert">{loadError}</div>}

      <section className="stats-grid">
        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Total Incidents</span>
            <div className="stat-icon">AL</div>
          </div>
          <h3>{stats.totalAlerts}</h3>
          <p className="trend up">Live total from incident alert database</p>
        </article>

        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Active Alerts</span>
            <div className="stat-icon">ON</div>
          </div>
          <h3>{stats.activeAlerts}</h3>
          <p className="trend warn">Updated automatically every {settings.autoRefreshSeconds} seconds</p>
        </article>

        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Resolved Alerts</span>
            <div className="stat-icon">OK</div>
          </div>
          <h3>{stats.resolvedAlerts}</h3>
          <p className="trend up">Resolved incidents from backend records</p>
        </article>

        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Incidents Visible</span>
            <div className="stat-icon">FD</div>
          </div>
          <h3>{incidents.length}</h3>
          <p className="trend neutral">Realtime feed available for admins</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="panel glass-card incidents-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Real-time feed</p>
              <h3>Live Incidents</h3>
            </div>
            <button className="ghost-btn" onClick={() => setActiveNav("incidents")} type="button">
              Open Incidents
            </button>
          </div>

          <div className="incident-list">
            {isLoading && !liveIncidents.length ? (
              <div className="admin-empty-state">Loading live incident data...</div>
            ) : liveIncidents.length ? (
              liveIncidents.map((incident) => (
                <div className="incident-item" key={incident.id}>
                  <div className="incident-top">
                    <div>
                      <div className="incident-title">{incident.title}</div>
                      <div className="incident-location">{incident.location}</div>
                    </div>
                    <span className={`status-pill ${incident.status}`}>{incident.status}</span>
                  </div>

                  <div className="incident-meta">
                    <span className="meta-pill">{incident.code}</span>
                    <span className="meta-pill">{formatTimeAgo(incident.createdAt)}</span>
                    <span className="meta-pill">{incident.hospital}</span>
                    <span className="meta-pill">{incident.userName || "Unknown user"}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-empty-state">No incidents have been recorded yet.</div>
            )}
          </div>
        </div>

        <div className="right-column">
          <div className="panel glass-card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Response activity</p>
                <h3>Recent Actions</h3>
              </div>
            </div>

            <div className="activity-list">
              {activities.map((activity) => (
                <div className="activity-item" key={activity.title}>
                  <div className={`activity-dot ${activity.tone}`}></div>
                  <div className="activity-text">
                    <h4>{activity.title}</h4>
                    <p>{activity.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel glass-card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Quick summary</p>
                <h3>System Highlights</h3>
              </div>
            </div>

            <div className="summary-boxes">
              <div className="summary-item">
                <span>Latest Sync</span>
                <strong>{isLoading ? "Refreshing..." : `Every ${settings.autoRefreshSeconds} sec`}</strong>
              </div>
              <div className="summary-item">
                <span>Platform Name</span>
                <strong>{settings.platformName}</strong>
              </div>
              <div className="summary-item">
                <span>Default Hospital Label</span>
                <strong>{settings.defaultHospitalLabel}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );

  const renderIncidents = () => (
    <section className="incidents-page glass-card">
      <div className="panel-head incidents-page-head">
        <div>
          <p className="eyebrow">Admin incident feed</p>
          <h3>All Incidents</h3>
        </div>
        <div className="incidents-toolbar">
          <span className="meta-pill">{filteredIncidents.length} visible</span>
          <button className="ghost-btn" onClick={() => fetchAdminDashboard()} type="button">
            Refresh
          </button>
        </div>
      </div>

      <div className="admin-incident-filters">
        <button
          className={`admin-incident-filter ${incidentCategory === "all" ? "active" : ""}`}
          type="button"
          onClick={() => setIncidentCategory("all")}
        >
          All
        </button>
        <button
          className={`admin-incident-filter ${incidentCategory === "pending" ? "active" : ""}`}
          type="button"
          onClick={() => setIncidentCategory("pending")}
        >
          Pending
        </button>
        <button
          className={`admin-incident-filter ${incidentCategory === "assigned" ? "active" : ""}`}
          type="button"
          onClick={() => setIncidentCategory("assigned")}
        >
          Assigned
        </button>
        <button
          className={`admin-incident-filter ${incidentCategory === "accepted" ? "active" : ""}`}
          type="button"
          onClick={() => setIncidentCategory("accepted")}
        >
          Accepted
        </button>
        <button
          className={`admin-incident-filter ${incidentCategory === "resolved" ? "active" : ""}`}
          type="button"
          onClick={() => setIncidentCategory("resolved")}
        >
          Resolved
        </button>
      </div>

      {loadError && <div className="admin-inline-alert">{loadError}</div>}

      {isLoading && !categorizedIncidents.length ? (
        <div className="admin-empty-state">Loading incident records...</div>
      ) : categorizedIncidents.length ? (
        <div className="admin-incident-grid">
          {categorizedIncidents.map((incident) => (
            <article className="admin-incident-card" key={incident.id}>
              <div className="admin-incident-top">
                <div>
                  <p className="admin-incident-code">{incident.code}</p>
                  <h4>{incident.title}</h4>
                </div>
                <span className={`status-pill ${incident.status}`}>{incident.status}</span>
              </div>

              <div className="admin-incident-section">
                <span className="admin-label">Location</span>
                <p>{incident.location}</p>
                <div className="incident-meta">
                  <span className="meta-pill">{formatTimeAgo(incident.createdAt)}</span>
                  <span className="meta-pill">{incident.hospital}</span>
                  <span className={`meta-pill ${incident.hospital !== "Awaiting assignment" ? "admin-meta-success" : "admin-meta-warn"}`}>
                    {incident.hospital !== "Awaiting assignment" ? "Sent to hospital" : "Awaiting admin send"}
                  </span>
                  {incident.hospitalAccepted ? (
                    <span className="meta-pill admin-meta-success">Accepted by hospital</span>
                  ) : null}
                  {incident.ambulanceAssignment ? (
                    <span className="meta-pill admin-meta-success">Ambulance assigned</span>
                  ) : null}
                </div>
              </div>

              <div className="admin-incident-section">
                <span className="admin-label">User</span>
                <p>{incident.userName || "Unknown user"}</p>
                <div className="incident-meta">
                  {incident.userEmail ? <span className="meta-pill">{incident.userEmail}</span> : null}
                  {incident.userPhone ? <span className="meta-pill">{incident.userPhone}</span> : null}
                  <span className="meta-pill">{incident.userRole || "user"}</span>
                </div>
              </div>

              <div className="admin-incident-section">
                <span className="admin-label">Alert Delivery</span>
                <div className="incident-meta">
                  <span className="meta-pill">Contacts {incident.totalContacts}</span>
                  <span className="meta-pill">Sent {incident.sentContacts}</span>
                  <span className="meta-pill">Failed {incident.failedContacts}</span>
                </div>
              </div>

              {incident.ambulanceAssignment ? (
                <div className="admin-incident-section">
                  <span className="admin-label">Ambulance Driver</span>
                  <p>
                    {incident.ambulanceAssignment.name}
                    {incident.ambulanceAssignment.vehicleNumber
                      ? ` (${incident.ambulanceAssignment.vehicleNumber})`
                      : ""}
                  </p>
                </div>
              ) : null}

              {incident.message ? (
                <div className="admin-incident-section">
                  <span className="admin-label">Message</span>
                  <p className="admin-incident-message">{incident.message}</p>
                </div>
              ) : null}

              {incident.mapUrl ? (
                <a className="admin-map-link" href={incident.mapUrl} target="_blank" rel="noreferrer">
                  Open map location
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty-state">No incidents match the current search.</div>
      )}
    </section>
  );

  const renderPopups = () => (
    <section className="incidents-page glass-card">
      <div className="panel-head incidents-page-head">
        <div>
          <p className="eyebrow">Realtime archive</p>
          <h3>Popup Alert History</h3>
        </div>
        <div className="incidents-toolbar">
          <span className="meta-pill">{popupData.unreadCount} unread</span>
          <button className="ghost-btn" onClick={() => fetchAdminDashboard()} type="button">
            Refresh
          </button>
        </div>
      </div>

      {loadError && <div className="admin-inline-alert">{loadError}</div>}

      {isLoading && !popupData.notifications.length ? (
        <div className="admin-empty-state">Loading popup alerts...</div>
      ) : popupData.notifications.length ? (
        <div className="admin-popup-grid">
          {popupData.notifications.map((popup) => (
            <article
              className={`admin-popup-card ${popup.isRead ? "read" : "unread"}`}
              key={popup.id}
            >
              <div className="admin-popup-card-top">
                <div>
                  <p className="admin-incident-code">{popup.code}</p>
                  <h4>{popup.title}</h4>
                </div>
                <span className={`status-pill ${popup.status}`}>{popup.status}</span>
              </div>

              <p className="admin-popup-card-location">{popup.location}</p>

              <div className="incident-meta">
                <span className="meta-pill">{formatTimeAgo(popup.createdAt)}</span>
                <span className="meta-pill">{popup.userName}</span>
                <span className="meta-pill">{popup.hospital}</span>
                <span className={`meta-pill ${popup.sentToHospitalDashboard ? "admin-meta-success" : "admin-meta-warn"}`}>
                  {popup.sentToHospitalDashboard
                    ? `Sent to ${popup.assignedHospitalName || popup.hospital}`
                    : "Awaiting admin send"}
                </span>
              </div>

              {popup.message ? (
                <p className="admin-popup-card-message">{popup.message}</p>
              ) : null}

              {renderNearestHospitals({
                hospitals: popup.nearestHospitals,
                incidentId: popup.incidentId,
                onSendToHospital: sendIncidentToHospitalDashboard,
                canSend: !popup.sentToHospitalDashboard,
              })}

              <div className="admin-popup-card-actions">
                {popup.mapUrl ? (
                  <a className="admin-map-link" href={popup.mapUrl} target="_blank" rel="noreferrer">
                    Open map
                  </a>
                ) : null}
                {!popup.isRead ? (
                  <button className="ghost-btn" type="button" onClick={() => markPopupAsRead(popup.id)}>
                    Mark Read
                  </button>
                ) : (
                  <span className="meta-pill">Read</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty-state">No popup alerts stored yet.</div>
      )}
    </section>
  );

  const renderAnalytics = () => (
    <section className="incidents-page glass-card">
      <div className="panel-head incidents-page-head">
        <div>
          <p className="eyebrow">Database analytics</p>
          <h3>Incident Analytics</h3>
        </div>
        <div className="incidents-toolbar">
          <span className="meta-pill">{settings.analyticsWindowDays} day live trend</span>
          <button className="ghost-btn" onClick={() => fetchAdminDashboard()} type="button">
            Refresh
          </button>
        </div>
      </div>

      {loadError && <div className="admin-inline-alert">{loadError}</div>}

      <div className="analytics-grid">
        <article className="analytics-card glass-card">
          <span className="admin-label">Incidents Today</span>
          <h3>{analytics.summary.incidentsToday}</h3>
          <p>
            {analytics.summary.incidentsThisWeek} incidents created in the last{" "}
            {settings.analyticsWindowDays} days.
          </p>
        </article>

        <article className="analytics-card glass-card">
          <span className="admin-label">Resolution Rate</span>
          <h3>{analytics.summary.resolutionRate}%</h3>
          <p>{analytics.summary.resolvedAlerts} total resolved incidents in the database.</p>
        </article>

        <article className="analytics-card glass-card">
          <span className="admin-label">Avg Resolution Time</span>
          <h3>{formatResolutionTime(analytics.summary.averageResolutionMinutes)}</h3>
          <p>
            {analytics.summary.resolvedThisWeek} incidents resolved in the last{" "}
            {settings.analyticsWindowDays} days.
          </p>
        </article>

        <article className="analytics-card glass-card">
          <span className="admin-label">SMS Delivery Success</span>
          <h3>{analytics.summary.deliverySuccessRate}%</h3>
          <p>
            {analytics.summary.totalContactsReached} successful deliveries out of{" "}
            {analytics.summary.totalContactAttempts} attempts.
          </p>
        </article>
      </div>

      <div className="analytics-dashboard-grid">
        <section className="panel glass-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">{settings.analyticsWindowDays} day trend</p>
              <h3>Incident Volume</h3>
            </div>
          </div>

          <div className="trend-chart">
            {analytics.trend.length ? (
              analytics.trend.map((point) => (
                <div className="trend-bar-item" key={point.label}>
                  <span className="trend-value">{point.total}</span>
                  <div className="trend-bar-track">
                    <div
                      className="trend-bar-fill"
                      style={{
                        height: `${Math.max((point.total / trendMax) * 100, point.total ? 14 : 6)}%`,
                      }}
                    ></div>
                  </div>
                  <span className="trend-label">{point.label}</span>
                </div>
              ))
            ) : (
              <div className="admin-empty-state">No trend data yet.</div>
            )}
          </div>
        </section>

        <section className="panel glass-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Current status</p>
              <h3>Status Breakdown</h3>
            </div>
          </div>

          <div className="analytics-list">
            <div className="analytics-list-row">
              <span>Active</span>
              <strong>{analytics.statusBreakdown.active}</strong>
            </div>
            <div className="analytics-list-row">
              <span>Pending</span>
              <strong>{analytics.statusBreakdown.pending}</strong>
            </div>
            <div className="analytics-list-row">
              <span>Resolved</span>
              <strong>{analytics.statusBreakdown.resolved}</strong>
            </div>
            <div className="analytics-list-row">
              <span>Failed Deliveries</span>
              <strong>{analytics.summary.failedDeliveries}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="analytics-dashboard-grid">
        <section className="panel glass-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">User load</p>
              <h3>Top Reporting Users</h3>
            </div>
          </div>

          <div className="analytics-list">
            {analytics.topUsers.length ? (
              analytics.topUsers.map((user) => (
                <div className="analytics-user-row" key={user.userId}>
                  <div>
                    <strong>{user.name}</strong>
                    <p>{user.email || "No email available"}</p>
                  </div>
                  <span className="meta-pill">{user.totalIncidents} incidents</span>
                </div>
              ))
            ) : (
              <div className="admin-empty-state">No user analytics available yet.</div>
            )}
          </div>
        </section>

        <section className="panel glass-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Hotspots</p>
              <h3>Top Incident Locations</h3>
            </div>
          </div>

          <div className="analytics-list">
            {analytics.topLocations.length ? (
              analytics.topLocations.map((location) => (
                <div className="analytics-location-row" key={location.location}>
                  <span>{location.location}</span>
                  <strong>{location.totalIncidents}</strong>
                </div>
              ))
            ) : (
              <div className="admin-empty-state">No location analytics available yet.</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );

  const renderSettings = () => (
    <section className="incidents-page glass-card">
      <div className="panel-head incidents-page-head">
        <div>
          <p className="eyebrow">Admin configuration</p>
          <h3>System Settings</h3>
        </div>
        <div className="incidents-toolbar">
          <span className="meta-pill">
            {settings.updatedAt ? `Updated ${formatTimeAgo(settings.updatedAt)}` : "Default settings"}
          </span>
          <button className="ghost-btn" onClick={() => fetchAdminDashboard()} type="button">
            Reload
          </button>
        </div>
      </div>

      {loadError && <div className="admin-inline-alert">{loadError}</div>}
      {settingsMessage && <div className="admin-inline-alert admin-inline-success">{settingsMessage}</div>}

      <form className="admin-settings-form" onSubmit={saveSettings}>
        <div className="admin-settings-grid">
          <div className="admin-settings-card">
            <p className="eyebrow">Platform</p>
            <label className="admin-settings-field">
              <span>Platform Name</span>
              <input
                name="platformName"
                value={settings.platformName}
                onChange={handleSettingsChange}
                placeholder="Platform name"
              />
            </label>
            <label className="admin-settings-field">
              <span>Control Room Email</span>
              <input
                type="email"
                name="controlRoomEmail"
                value={settings.controlRoomEmail}
                onChange={handleSettingsChange}
                placeholder="controlroom@example.com"
              />
            </label>
            <label className="admin-settings-field">
              <span>Control Room Phone</span>
              <input
                name="controlRoomPhone"
                value={settings.controlRoomPhone}
                onChange={handleSettingsChange}
                placeholder="+91..."
              />
            </label>
            <label className="admin-settings-field">
              <span>Default Hospital Label</span>
              <input
                name="defaultHospitalLabel"
                value={settings.defaultHospitalLabel}
                onChange={handleSettingsChange}
                placeholder="Awaiting assignment"
              />
            </label>
          </div>

          <div className="admin-settings-card">
            <p className="eyebrow">Realtime</p>
            <label className="admin-settings-field">
              <span>Auto Refresh Seconds</span>
              <input
                type="number"
                min="5"
                max="300"
                name="autoRefreshSeconds"
                value={settings.autoRefreshSeconds}
                onChange={handleSettingsChange}
              />
            </label>
            <label className="admin-settings-field">
              <span>Analytics Window Days</span>
              <input
                type="number"
                min="7"
                max="90"
                name="analyticsWindowDays"
                value={settings.analyticsWindowDays}
                onChange={handleSettingsChange}
              />
            </label>
            <label className="admin-settings-field admin-settings-toggle">
              <input
                type="checkbox"
                name="allowUserRegistration"
                checked={settings.allowUserRegistration}
                onChange={handleSettingsChange}
              />
              <span>Allow User Registration</span>
            </label>
            <label className="admin-settings-field admin-settings-toggle">
              <input
                type="checkbox"
                name="maintenanceMode"
                checked={settings.maintenanceMode}
                onChange={handleSettingsChange}
              />
              <span>Maintenance Mode</span>
            </label>
          </div>

          <div className="admin-settings-card">
            <p className="eyebrow">Alerts</p>
            <label className="admin-settings-field admin-settings-toggle">
              <input
                type="checkbox"
                name="smsAlertsEnabled"
                checked={settings.smsAlertsEnabled}
                onChange={handleSettingsChange}
              />
              <span>SMS Alerts Enabled</span>
            </label>
            <label className="admin-settings-field admin-settings-toggle">
              <input
                type="checkbox"
                name="emailAlertsEnabled"
                checked={settings.emailAlertsEnabled}
                onChange={handleSettingsChange}
              />
              <span>Email Alerts Enabled</span>
            </label>
            <label className="admin-settings-field admin-settings-toggle">
              <input
                type="checkbox"
                name="incidentAutoAssignment"
                checked={settings.incidentAutoAssignment}
                onChange={handleSettingsChange}
              />
              <span>Incident Auto Assignment</span>
            </label>
            <label className="admin-settings-field">
              <span>Admin Notes</span>
              <textarea
                name="adminNotes"
                value={settings.adminNotes}
                onChange={handleSettingsChange}
                placeholder="Internal operational notes..."
                rows="5"
              />
            </label>
          </div>
        </div>

        <div className="admin-settings-actions">
          <button className="primary-btn" type="submit" disabled={isSavingSettings}>
            {isSavingSettings ? "Saving..." : "Save Settings"}
          </button>
          <button className="secondary-btn" onClick={() => fetchAdminDashboard()} type="button">
            Reset From Server
          </button>
        </div>
      </form>
    </section>
  );

  const renderHospitals = () => (
    <section className="incidents-page glass-card">
      <div className="panel-head incidents-page-head">
        <div>
          <p className="eyebrow">Connected facilities</p>
          <h3>Hospitals</h3>
        </div>
        <div className="incidents-toolbar">
          <span className="meta-pill">{filteredHospitals.length} connected</span>
          <button className="ghost-btn" onClick={() => fetchAdminDashboard()} type="button">
            Refresh
          </button>
        </div>
      </div>

      {loadError && <div className="admin-inline-alert">{loadError}</div>}

      <div className="admin-hospital-grid">
        {isLoading && !filteredHospitals.length ? (
          <div className="admin-empty-state">Loading connected hospital data...</div>
        ) : filteredHospitals.length ? (
          filteredHospitals.map((hospital) => (
            <article className="admin-hospital-card" key={hospital.id}>
              <div className="admin-hospital-top">
                <div>
                  <p className="admin-incident-code">{hospital.profileStatus || "Active"}</p>
                  <h4>{hospital.hospitalName}</h4>
                </div>
                <span className="admin-connect-badge connected">Connected</span>
              </div>

              <p className="admin-hospital-address">
                {hospital.address || "No address added yet."}
              </p>

              <div className="admin-hospital-meta">
                <span className="meta-pill">Beds {hospital.freeBeds}/{hospital.totalBeds}</span>
                <span className="meta-pill">ICU {hospital.icuFree}</span>
                <span className="meta-pill">ETA {hospital.ambulanceEtaMinutes} min</span>
                <span className="meta-pill">{hospital.occupiedPercent}% occupied</span>
              </div>

              <div className="admin-hospital-stats">
                <div>
                  <span>Total Incidents</span>
                  <strong>{hospital.totalIncidents}</strong>
                </div>
                <div>
                  <span>Active</span>
                  <strong>{hospital.activeIncidents}</strong>
                </div>
                <div>
                  <span>Resolved</span>
                  <strong>{hospital.resolvedIncidents}</strong>
                </div>
              </div>

              <div className="admin-hospital-contact">
                <span>{hospital.userName || "Hospital admin"}</span>
                <span>{hospital.userEmail || "No email available"}</span>
                <span>{hospital.userPhone || "No phone available"}</span>
              </div>

              <div className="admin-hospital-meta">
                <span className="meta-pill">
                  Updated {formatTimeAgo(hospital.updatedAt)}
                </span>
                {hospital.latitude !== null && hospital.longitude !== null ? (
                  <span className="meta-pill">
                    {hospital.latitude}, {hospital.longitude}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="admin-empty-state">No connected hospitals found yet.</div>
        )}
      </div>
    </section>
  );

  const renderUsers = () => (
    <section className="incidents-page glass-card">
      <div className="panel-head incidents-page-head">
        <div>
          <p className="eyebrow">Registered accounts</p>
          <h3>Users</h3>
        </div>
        <div className="incidents-toolbar">
          <span className="meta-pill">{filteredUsers.length} registered</span>
          <button className="ghost-btn" onClick={() => fetchAdminDashboard()} type="button">
            Refresh
          </button>
        </div>
      </div>

      {loadError && <div className="admin-inline-alert">{loadError}</div>}

      <div className="admin-user-grid">
        {isLoading && !filteredUsers.length ? (
          <div className="admin-empty-state">Loading registered user data...</div>
        ) : filteredUsers.length ? (
          filteredUsers.map((user) => (
            <article className="admin-user-card" key={user.id}>
              <div className="admin-user-top">
                <div className="admin-user-identity">
                  <div className="profile-avatar">
                    {(user.name || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="admin-incident-code">{user.profileStatus || "Active"}</p>
                    <h4>{user.name || "Registered User"}</h4>
                  </div>
                </div>
                <span className="meta-pill">{user.alertMethod || "SMS + Push"}</span>
              </div>

              <div className="admin-user-contact">
                <span>{user.email || "No email available"}</span>
                <span>{user.phone || "No phone available"}</span>
                <span>{user.primaryHospital || "No preferred hospital"}</span>
              </div>

              <div className="admin-user-stats">
                <div>
                  <span>Total Incidents</span>
                  <strong>{user.totalIncidents}</strong>
                </div>
                <div>
                  <span>Active</span>
                  <strong>{user.activeIncidents}</strong>
                </div>
                <div>
                  <span>Resolved</span>
                  <strong>{user.resolvedIncidents}</strong>
                </div>
              </div>

              <div className="admin-user-meta">
                <span className="meta-pill">Contacts {user.activeContacts}/{user.emergencyContacts}</span>
                <span className="meta-pill">
                  Location {user.locationSharing ? "On" : "Off"}
                </span>
                <span className="meta-pill">
                  Joined {formatTimeAgo(user.createdAt)}
                </span>
                {user.lastIncidentAt ? (
                  <span className="meta-pill">
                    Last incident {formatTimeAgo(user.lastIncidentAt)}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="admin-empty-state">No registered users found yet.</div>
        )}
      </div>
    </section>
  );

  const renderContent = () => {
    switch (activeNav) {
      case "popups":
        return renderPopups();
      case "incidents":
        return renderIncidents();
      case "hospitals":
        return renderHospitals();
      case "users":
        return renderUsers();
      case "analytics":
        return renderAnalytics();
      case "settings":
        return renderSettings();
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="admin-dashboard-shell">
      {incidentPopup ? (
        <div className="admin-incident-popup" role="status" aria-live="polite">
          <div className="admin-incident-popup-top">
            <div>
              <p className="admin-incident-popup-label">New Incident Alert</p>
              <h3>{incidentPopup.title}</h3>
            </div>
            <button
              className="admin-incident-popup-close"
              type="button"
              onClick={() => {
                markPopupAsRead(incidentPopup.id);
                setIncidentPopup(null);
              }}
              aria-label="Close incident popup"
            >
              X
            </button>
          </div>
          <p className="admin-incident-popup-text">{incidentPopup.location}</p>
          <div className="admin-incident-popup-meta">
            <span className={`status-pill ${incidentPopup.status}`}>{incidentPopup.status}</span>
            <span className="meta-pill">{incidentPopup.code}</span>
            <span className="meta-pill">{incidentPopup.userName || "Unknown user"}</span>
          </div>
          {renderNearestHospitals({
            hospitals: incidentPopup.nearestHospitals,
            compact: true,
            incidentId: incidentPopup.incidentId,
            onSendToHospital: sendIncidentToHospitalDashboard,
            canSend: !incidentPopup.sentToHospitalDashboard,
          })}
        </div>
      ) : null}

      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="bg-grid"></div>

      <div className="mobile-topbar">
        <button
          className="menu-btn"
          type="button"
          aria-label="Open menu"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <img src="/logo.png" alt="Prana Raksha Logo" className="mobile-logo" />
      </div>

      {mobileMenuOpen && (
        <button
          className="sidebar-overlay"
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={`admin-sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <img src="/logo.png" alt="Prana Raksha Logo" className="sidebar-logo" />
          <div className="sidebar-profile-chip profile-chip">
            <div className="profile-avatar">A</div>
            <div>
              <h4>Admin</h4>
              <p>{loadError ? "Sync issue" : "Control Room"}</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-link nav-btn-link ${activeNav === item.key ? "active" : ""}`}
              onClick={() => {
                setActiveNav(item.key);
                setMobileMenuOpen(false);
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom glass-card">
          <p className="mini-label">System Status</p>
          <h4>{loadError ? "Attention needed" : "Operational"}</h4>
          <span className="status-dot"></span>
          <button className="secondary-btn full-btn admin-logout-btn" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar glass-card">
          <div className="topbar-left">
            <p className="eyebrow">Emergency Intelligence Center</p>
            <h1>{getPageTitle(activeNav)}</h1>
          </div>

          <div className="topbar-right">
            <div className="search-box">
              <span className="search-icon">SR</span>
              <input
                type="text"
                placeholder="Search incidents, users, hospitals..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>

            <div className="notification-bell-wrap" ref={notificationPanelRef}>
              <button
                className={`icon-btn notification-bell-btn ${isNotificationPanelOpen ? "active" : ""}`}
                type="button"
                aria-label="Open popup alerts"
                aria-expanded={isNotificationPanelOpen}
                onClick={() => setIsNotificationPanelOpen((current) => !current)}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                  <path d="M10 21a2 2 0 0 0 4 0" />
                </svg>
                {popupData.unreadCount ? (
                  <span className="notification-badge">
                    {popupData.unreadCount > 99 ? "99+" : popupData.unreadCount}
                  </span>
                ) : null}
              </button>

              {isNotificationPanelOpen ? (
                <div className="notification-panel glass-card">
                  <div className="notification-panel-head">
                    <div>
                      <p className="mini-label">Popup Alerts</p>
                      <h4>All Notifications</h4>
                    </div>
                    <button
                      className="ghost-btn notification-refresh-btn"
                      type="button"
                      onClick={() => fetchAdminDashboard({ silent: true })}
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="notification-panel-meta">
                    <span className="meta-pill">{popupData.notifications.length} total</span>
                    <span className="meta-pill">{popupData.unreadCount} unread</span>
                  </div>

                  <div className="notification-panel-list">
                    {popupData.notifications.length ? (
                      popupData.notifications.map((popup) => (
                        <article
                          className={`notification-panel-item ${popup.isRead ? "read" : "unread"}`}
                          key={popup.id}
                        >
                          <div className="notification-panel-item-top">
                            <div>
                              <p className="admin-incident-code">{popup.code}</p>
                              <h5>{popup.title}</h5>
                            </div>
                            <span className={`status-pill ${popup.status}`}>{popup.status}</span>
                          </div>

                          <p className="notification-panel-location">{popup.location}</p>

                          <div className="incident-meta">
                            <span className="meta-pill">{formatTimeAgo(popup.createdAt)}</span>
                            <span className="meta-pill">{popup.userName}</span>
                          </div>

                          {popup.message ? (
                            <p className="notification-panel-message">{popup.message}</p>
                          ) : null}

                          <div className="notification-panel-actions">
                            <button
                              className="ghost-btn"
                              type="button"
                              onClick={() => {
                                setActiveNav("popups");
                                setIsNotificationPanelOpen(false);
                              }}
                            >
                              Open details
                            </button>
                            {!popup.isRead ? (
                              <button
                                className="ghost-btn"
                                type="button"
                                onClick={() => markPopupAsRead(popup.id)}
                              >
                                Mark Read
                              </button>
                            ) : (
                              <span className="meta-pill">Read</span>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="admin-empty-state">No popup alerts stored yet.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="profile-chip">
              <div className="profile-avatar">A</div>
              <div>
                <h4>Admin</h4>
                <p>{loadError ? "Sync issue" : "Control Room"}</p>
              </div>
            </div>
            <button className="secondary-btn admin-top-logout-btn" onClick={handleLogout} type="button">
              Logout
            </button>
          </div>
        </header>

        {renderContent()}
      </main>
    </div>
  );
}
