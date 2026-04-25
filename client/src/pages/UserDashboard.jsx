import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/userDashboard.css";

import DashboardHome from "../components/user/DashboardHome";
import AlertsSection from "../components/user/AlertsSection";
import DashcamSection from "../components/user/DashcamSection";
import TrackStatusSection from "../components/user/TrackStatusSection";
import ProfileSection from "../components/user/ProfileSection";
import { apiFetch, logoutSession } from "../lib/api";
import { subscribeToRealtimeUpdates } from "../lib/realtime";

const defaultStats = {
  totalAlerts: 0,
  activeAlerts: 0,
  resolvedAlerts: 0,
};

const defaultProfile = {
  name: "",
  email: "",
  role: "",
  phone: "",
  primaryHospital: "",
  locationSharing: true,
  alertMethod: "SMS + Push",
  profileStatus: "Active",
};

export default function UserDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(defaultStats);
  const [profile, setProfile] = useState(defaultProfile);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dashcamStream, setDashcamStream] = useState(null);
  const [dashcamError, setDashcamError] = useState("");
  const [isStartingDashcam, setIsStartingDashcam] = useState(false);
  const navigate = useNavigate();

  const storedUser = JSON.parse(localStorage.getItem("user") || "null");

  const fetchDashboardData = async () => {
    if (!storedUser) {
      return;
    }

    const res = await apiFetch("/api/contacts/dashboard-alerts");

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load dashboard alerts");
    }

    setStats(data.stats || defaultStats);
    setAlerts(data.alerts || []);
  };

  const fetchProfile = async () => {
    if (!storedUser) {
      return;
    }

    const res = await apiFetch("/api/auth/profile");

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to load profile");
    }

    setProfile(data.user || defaultProfile);
    localStorage.setItem("user", JSON.stringify(data.user || defaultProfile));
  };

  useEffect(() => {
    if (!storedUser) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      fetchDashboardData().catch(() => {});
      fetchProfile().catch(() => {});
    }, 0);

    const intervalId = window.setInterval(() => {
      fetchDashboardData().catch(() => {});
      fetchProfile().catch(() => {});
    }, 10000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [storedUser?.role]);

  useEffect(() => {
    if (!storedUser) {
      return undefined;
    }

    return subscribeToRealtimeUpdates({
      onEvent: (event) => {
        if (
          ![
            "incident-updated",
            "profile-updated",
            "connected",
          ].includes(event.type)
        ) {
          return;
        }

        fetchDashboardData().catch(() => {});
        fetchProfile().catch(() => {});
      },
    });
  }, [storedUser?.role]);

  const resolveAlert = async (alertId) => {
    try {
      const res = await apiFetch(`/api/contacts/alerts/${alertId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "resolved" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to resolve alert");
      }

      await fetchDashboardData();
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = async () => {
    await logoutSession();
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const stopDashcam = () => {
    setDashcamError("");
    setDashcamStream((currentStream) => {
      currentStream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  };

  const startDashcam = async () => {
    if (dashcamStream) {
      setDashcamError("");
      setActiveSection("dashcam");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setDashcamError("Camera access is not supported in this browser.");
      setActiveSection("dashcam");
      return;
    }

    setIsStartingDashcam(true);
    setDashcamError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      setDashcamStream(stream);
      setActiveSection("dashcam");
    } catch (error) {
      setDashcamError(error?.message || "Unable to access the camera.");
      setActiveSection("dashcam");
    } finally {
      setIsStartingDashcam(false);
    }
  };

  useEffect(() => () => {
    dashcamStream?.getTracks().forEach((track) => track.stop());
  }, [dashcamStream]);

  const renderSection = () => {
    switch (activeSection) {
      case "alerts":
        return (
          <AlertsSection
            alerts={alerts}
            setActiveSection={setActiveSection}
            onResolveAlert={resolveAlert}
          />
        );
      case "dashcam":
        return (
          <DashcamSection
            setActiveSection={setActiveSection}
            dashcamStream={dashcamStream}
            dashcamError={dashcamError}
            isStartingDashcam={isStartingDashcam}
            onStartDashcam={startDashcam}
            onStopDashcam={stopDashcam}
          />
        );
      case "track":
        return <TrackStatusSection alerts={alerts} setActiveSection={setActiveSection} />;
      case "profile":
        return (
          <ProfileSection
            profile={profile}
            setProfile={setProfile}
            setActiveSection={setActiveSection}
          />
        );
      default:
        return (
          <DashboardHome
            alerts={alerts}
            profile={profile}
            stats={stats}
            setActiveSection={setActiveSection}
            dashcamStream={dashcamStream}
            dashcamError={dashcamError}
            isStartingDashcam={isStartingDashcam}
            onStartDashcam={startDashcam}
            onStopDashcam={stopDashcam}
          />
        );
    }
  };

  const getTitle = () => {
    switch (activeSection) {
      case "alerts":
        return "My Alerts";
      case "dashcam":
        return "Dashcam";
      case "track":
        return "Track Status";
      case "profile":
        return "Profile";
      default:
        return "My Dashboard";
    }
  };

  const selectSection = (section) => {
    setActiveSection(section);
    setMobileMenuOpen(false);
  };

  return (
    <div className="dashboard-shell">
      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="bg-grid"></div>

      <div className="mobile-topbar">
        <button
          className="menu-btn"
          type="button"
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
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

      <aside className={`sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <img src="/logo.png" alt="Prana Raksha Logo" className="sidebar-logo" />
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-link nav-btn-link ${activeSection === "dashboard" ? "active" : ""}`}
            onClick={() => selectSection("dashboard")}
          >
            <span className="nav-icon">Home</span>
            <span>Dashboard</span>
          </button>

          <button
            className={`nav-link nav-btn-link ${activeSection === "alerts" ? "active" : ""}`}
            onClick={() => selectSection("alerts")}
          >
            <span className="nav-icon">Alert</span>
            <span>My Alerts</span>
          </button>

          <button
            className={`nav-link nav-btn-link ${activeSection === "dashcam" ? "active" : ""}`}
            onClick={() => selectSection("dashcam")}
          >
            <span className="nav-icon">Cam</span>
            <span>Dashcam</span>
          </button>

          <button
            className={`nav-link nav-btn-link ${activeSection === "track" ? "active" : ""}`}
            onClick={() => selectSection("track")}
          >
            <span className="nav-icon">Track</span>
            <span>Track Status</span>
          </button>

          <button
            className={`nav-link nav-btn-link ${activeSection === "profile" ? "active" : ""}`}
            onClick={() => selectSection("profile")}
          >
            <span className="nav-icon">User</span>
            <span>Profile</span>
          </button>
        </nav>

        <div className="sidebar-bottom glass-card">
          <p className="mini-label">Emergency Link</p>
          <h4>Ready to Alert</h4>
          <span className="status-dot"></span>
          <button
            className="secondary-btn full-btn logout-btn"
            onClick={handleLogout}
            type="button"
          >
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar glass-card">
          <div className="topbar-left">
            <p className="eyebrow">User Emergency Panel</p>
            <h1>{getTitle()}</h1>
          </div>

          <div className="topbar-right">
            <div className="profile-chip">
              <div className="profile-avatar">
                {(profile.name || "U").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <h4>{profile.name || "User"}</h4>
                <p>{profile.role || "Emergency Access"}</p>
              </div>
            </div>
            <button className="secondary-btn logout-top-btn" onClick={handleLogout} type="button">
              Logout
            </button>
          </div>
        </header>

        {renderSection()}
      </main>
    </div>
  );
}
