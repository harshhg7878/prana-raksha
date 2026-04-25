import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/hospital.css";
import { apiFetch, logoutSession } from "../lib/api";
import { subscribeToRealtimeUpdates } from "../lib/realtime";

const defaultNotifications = {
  unreadCount: 0,
  notifications: [],
};

const getLatestUnreadNotification = (notifications = []) =>
  notifications.find((notification) => !notification.isRead) || null;

const defaultAmbulanceDrivers = [];

const defaultProfile = {
  hospitalName: "Hospital",
  address: "",
  latitude: "",
  longitude: "",
  distanceKm: 0,
  freeBeds: 0,
  totalBeds: 0,
  icuFree: 0,
  occupiedPercent: 0,
  ambulanceEtaMinutes: 0,
  bedAvailability: [],
  staff: [],
  updatedAt: "",
};

const sectionConfig = [
  { key: "overview", label: "Overview", icon: "Home" },
  { key: "available", label: "Available", icon: "Open" },
  { key: "myCases", label: "My Cases", icon: "Care" },
  { key: "ambulance", label: "Ambulance", icon: "Ride" },
  { key: "staff", label: "Staff", icon: "Team" },
  { key: "facility", label: "Facility", icon: "Unit" },
  { key: "resolved", label: "Resolved", icon: "Done" },
];

const shiftOptions = ["On Duty", "On Call", "Off Duty"];
const ambulanceStatusOptions = ["available", "on-trip", "off-duty"];

const formatTimeAgo = (value) => {
  if (!value) {
    return "Just now";
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return "Just now";
  }

  const diffMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
};

const createEmptyStaff = () => ({
  id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: "",
  department: "",
  initials: "",
  shiftStatus: "On Duty",
});

const createEmptyBedUnit = () => ({
  id: `bed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  unit: "",
  available: 0,
  total: 0,
});

const createEmptyAmbulanceDriver = () => ({
  id: `driver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: "",
  phone: "",
  vehicleNumber: "",
  status: "available",
});

const hasIncompleteProfileEntries = (profile) => {
  const hasIncompleteStaff = (profile.staff || []).some(
    (member) => !String(member.name || "").trim()
  );

  const hasIncompleteBedUnits = (profile.bedAvailability || []).some(
    (item) => !String(item.unit || "").trim()
  );

  return hasIncompleteStaff || hasIncompleteBedUnits;
};

export default function Hospital() {
  const [hospitalName, setHospitalName] = useState("Hospital");
  const [profile, setProfile] = useState(defaultProfile);
  const [incidents, setIncidents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationData, setNotificationData] = useState(defaultNotifications);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [liveNotification, setLiveNotification] = useState(null);
  const shownLiveNotificationIdRef = useRef("");
  const [ambulanceDrivers, setAmbulanceDrivers] = useState(defaultAmbulanceDrivers);
  const [isSavingDrivers, setIsSavingDrivers] = useState(false);
  const [selectedDriverByIncident, setSelectedDriverByIncident] = useState({});
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [hasUnsavedProfileChanges, setHasUnsavedProfileChanges] = useState(false);
  const navigate = useNavigate();
  const isProfileEditSection = activeSection === "staff" || activeSection === "facility";

  const validateSession = () => {
    const user = JSON.parse(localStorage.getItem("user") || "null");

    if (user?.role !== "hospital") {
      navigate("/login", { replace: true });
      return false;
    }

    return true;
  };

  const fetchHospitalDashboard = async ({ silent = false } = {}) => {
    if (!validateSession()) {
      return;
    }

    if (!silent) {
      setIsLoading(true);
    }

    try {
      const res = await apiFetch("/api/contacts/hospital-dashboard");

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load hospital dashboard");
      }

      setHospitalName(data.hospitalName || "Hospital");
      setIncidents(data.incidents || []);
      if (!isEditingProfile && !isProfileEditSection) {
        setProfile({ ...defaultProfile, ...(data.profile || {}) });
      }
      setMessage("");
    } catch (error) {
      setMessage(error.message || "Failed to load hospital dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHospitalNotifications = async () => {
    if (!validateSession()) {
      return;
    }

    try {
      const res = await apiFetch("/api/contacts/hospital-notifications");

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load hospital notifications");
      }

      setNotificationData({
        unreadCount: data.unreadCount || 0,
        notifications: data.notifications || [],
      });

      const latestUnread = getLatestUnreadNotification(data.notifications || []);
      if (
        latestUnread &&
        latestUnread.id !== shownLiveNotificationIdRef.current &&
        Date.now() - new Date(latestUnread.createdAt).getTime() < 30000
      ) {
        shownLiveNotificationIdRef.current = latestUnread.id;
        setLiveNotification(latestUnread);
      }
    } catch (error) {
      setMessage(error.message || "Failed to load hospital notifications");
    }
  };

  const fetchAmbulanceDrivers = async () => {
    if (!validateSession()) {
      return;
    }

    try {
      const res = await apiFetch("/api/contacts/hospital-ambulance-drivers");

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to load ambulance drivers");
      }

      setAmbulanceDrivers(data.drivers || []);
    } catch (error) {
      setMessage(error.message || "Failed to load ambulance drivers");
    }
  };

  useEffect(() => {
    if (!validateSession()) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      fetchHospitalDashboard();
      fetchHospitalNotifications();
      fetchAmbulanceDrivers();
    }, 0);

    const intervalId = window.setInterval(() => {
      fetchHospitalDashboard({ silent: true });
      fetchHospitalNotifications();
    }, 5000);

    const handlePageShow = () => validateSession();
    const handleStorage = () => validateSession();

    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorage);
    };
  }, [isEditingProfile, isProfileEditSection]);

  useEffect(() => {
    if (!validateSession()) {
      return undefined;
    }

    return subscribeToRealtimeUpdates({
      onEvent: (event) => {
        if (
          ![
            "incident-updated",
            "hospital-profile-updated",
            "hospital-notification-created",
            "connected",
          ].includes(event.type)
        ) {
          return;
        }

        if (event.type === "hospital-notification-created") {
          if (event.notification) {
            shownLiveNotificationIdRef.current = event.notification.id;
            setLiveNotification(event.notification);
            setNotificationData((current) => ({
              unreadCount:
                current.unreadCount +
                (event.notification.isRead ||
                current.notifications.some(
                  (notification) => notification.id === event.notification.id
                )
                  ? 0
                  : 1),
              notifications: [
                event.notification,
                ...current.notifications.filter(
                  (notification) => notification.id !== event.notification.id
                ),
              ],
            }));
          } else {
            apiFetch("/api/contacts/hospital-notifications")
              .then((res) => res.json())
              .then((data) => {
                const nextNotification = data.notifications?.[0];
                if (nextNotification) {
                  shownLiveNotificationIdRef.current = nextNotification.id;
                  setLiveNotification(nextNotification);
                }
              })
              .catch(() => {});
          }
        }

        fetchHospitalDashboard({ silent: true });
        fetchHospitalNotifications();
        fetchAmbulanceDrivers();
      },
    });
  }, [isEditingProfile, isProfileEditSection]);

  useEffect(() => {
    if (!liveNotification) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setLiveNotification(null);
    }, 8000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [liveNotification]);

  useEffect(() => {
    if (!isProfileEditSection && !hasUnsavedProfileChanges) {
      const timeoutId = window.setTimeout(() => {
        setIsEditingProfile(false);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    return undefined;
  }, [hasUnsavedProfileChanges, isProfileEditSection]);

  const claimIncident = async (incidentId) => {
    try {
      const res = await apiFetch(`/api/contacts/hospital-incidents/${incidentId}/claim`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to claim incident");
      }

      setMessage(data.message || "Incident claimed");
      await fetchHospitalDashboard({ silent: true });
      setActiveSection("myCases");
    } catch (error) {
      setMessage(error.message || "Failed to claim incident");
    }
  };

  const updateIncidentStatus = async (incidentId, status) => {
    try {
      const res = await apiFetch(`/api/contacts/hospital-incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to update incident status");
      }

      setMessage(data.message || "Incident updated");
      await fetchHospitalDashboard({ silent: true });
    } catch (error) {
      setMessage(error.message || "Failed to update incident status");
    }
  };

  const acceptIncident = async (incidentId) => {
    try {
      const res = await apiFetch(`/api/contacts/hospital-incidents/${incidentId}/accept`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to accept case");
      }

      setMessage(data.message || "Case accepted");
      await fetchHospitalDashboard({ silent: true });
      await fetchAmbulanceDrivers();
      setActiveSection("myCases");
    } catch (error) {
      setMessage(error.message || "Failed to accept case");
    }
  };

  const assignAmbulanceDriver = async (incidentId) => {
    const driverId = selectedDriverByIncident[incidentId];

    if (!driverId) {
      setMessage("Select an ambulance driver first");
      return;
    }

    try {
      const res = await apiFetch(`/api/contacts/hospital-incidents/${incidentId}/assign-driver`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driverId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to assign ambulance driver");
      }

      setMessage(data.message || "Ambulance driver assigned");
      await fetchHospitalDashboard({ silent: true });
      await fetchAmbulanceDrivers();
    } catch (error) {
      setMessage(error.message || "Failed to assign ambulance driver");
    }
  };

  const saveHospitalProfile = async ({ showMessage = true, syncProfile = true } = {}) => {
    try {
      setIsSavingProfile(true);

      const payload = {
        address: profile.address,
        latitude: Number(profile.latitude),
        longitude: Number(profile.longitude),
        distanceKm: Number(profile.distanceKm) || 0,
        freeBeds: Number(profile.freeBeds) || 0,
        totalBeds: Number(profile.totalBeds) || 0,
        icuFree: Number(profile.icuFree) || 0,
        occupiedPercent: Number(profile.occupiedPercent) || 0,
        ambulanceEtaMinutes: Number(profile.ambulanceEtaMinutes) || 0,
        bedAvailability: (profile.bedAvailability || []).map((item) => ({
          unit: item.unit,
          available: Number(item.available) || 0,
          total: Number(item.total) || 0,
        })),
        staff: (profile.staff || []).map((member) => ({
          name: member.name,
          department: member.department,
          initials: member.initials,
          shiftStatus: member.shiftStatus,
        })),
      };

      const res = await apiFetch("/api/contacts/hospital-profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to save hospital profile");
      }

      if (syncProfile) {
        setProfile({ ...defaultProfile, ...(data.profile || {}) });
        setIsEditingProfile(false);
      } else {
        setProfile((current) => ({
          ...current,
          updatedAt: data.profile?.updatedAt || current.updatedAt,
        }));
      }
      setHasUnsavedProfileChanges(false);
      if (showMessage) {
        setMessage(data.message || "Hospital profile updated");
      }
    } catch (error) {
      setMessage(error.message || "Failed to save hospital profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    if (!hasUnsavedProfileChanges || isSavingProfile) {
      return undefined;
    }

    if (!["staff", "facility"].includes(activeSection)) {
      return undefined;
    }

    if (hasIncompleteProfileEntries(profile)) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      saveHospitalProfile({ showMessage: false, syncProfile: false });
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeSection, hasUnsavedProfileChanges, isSavingProfile, profile]);

  const handleLogout = async () => {
    await logoutSession();
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const markNotificationAsRead = async (notificationId) => {
    if (!notificationId || !validateSession()) {
      return;
    }

    try {
      const res = await apiFetch(`/api/contacts/hospital-notifications/${notificationId}/read`, {
        method: "PATCH",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to mark notification as read");
      }

      setNotificationData((current) => ({
        unreadCount: Math.max(
          0,
          current.unreadCount -
            (current.notifications.some((item) => item.id === notificationId && !item.isRead) ? 1 : 0)
        ),
        notifications: current.notifications.map((item) =>
          item.id === notificationId
            ? { ...item, isRead: true, readAt: data.notification?.readAt || new Date().toISOString() }
            : item
        ),
      }));
    } catch (error) {
      setMessage(error.message || "Failed to mark notification as read");
    }
  };

  const updateAmbulanceDriver = (id, field, value) => {
    setAmbulanceDrivers((current) =>
      current.map((driver) =>
        driver.id === id ? { ...driver, [field]: value } : driver
      )
    );
  };

  const addAmbulanceDriver = () => {
    setAmbulanceDrivers((current) => [...current, createEmptyAmbulanceDriver()]);
  };

  const removeAmbulanceDriver = (id) => {
    setAmbulanceDrivers((current) => current.filter((driver) => driver.id !== id));
  };

  const saveAmbulanceDrivers = async () => {
    try {
      setIsSavingDrivers(true);

      const res = await apiFetch("/api/contacts/hospital-ambulance-drivers", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ drivers: ambulanceDrivers }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to save ambulance drivers");
      }

      setAmbulanceDrivers(data.drivers || []);
      setMessage(data.message || "Ambulance drivers updated");
    } catch (error) {
      setMessage(error.message || "Failed to save ambulance drivers");
    } finally {
      setIsSavingDrivers(false);
    }
  };

  const updateProfileField = (name, value) => {
    setIsEditingProfile(true);
    setHasUnsavedProfileChanges(true);
    setProfile((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const updateBedUnit = (id, field, value) => {
    setIsEditingProfile(true);
    setHasUnsavedProfileChanges(true);
    setProfile((current) => ({
      ...current,
      bedAvailability: current.bedAvailability.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addBedUnit = () => {
    setIsEditingProfile(true);
    setHasUnsavedProfileChanges(true);
    setProfile((current) => ({
      ...current,
      bedAvailability: [...current.bedAvailability, createEmptyBedUnit()],
    }));
  };

  const removeBedUnit = (id) => {
    setIsEditingProfile(true);
    setHasUnsavedProfileChanges(true);
    setProfile((current) => ({
      ...current,
      bedAvailability: current.bedAvailability.filter((item) => item.id !== id),
    }));
  };

  const updateStaffMember = (id, field, value) => {
    setIsEditingProfile(true);
    setHasUnsavedProfileChanges(true);
    setProfile((current) => ({
      ...current,
      staff: current.staff.map((member) =>
        member.id === id ? { ...member, [field]: value } : member
      ),
    }));
  };

  const addStaffMember = () => {
    setIsEditingProfile(true);
    setHasUnsavedProfileChanges(true);
    setProfile((current) => ({
      ...current,
      staff: [...current.staff, createEmptyStaff()],
    }));
  };

  const removeStaffMember = (id) => {
    setIsEditingProfile(true);
    setHasUnsavedProfileChanges(true);
    setProfile((current) => ({
      ...current,
      staff: current.staff.filter((member) => member.id !== id),
    }));
  };

  const filteredIncidents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return incidents.filter((incident) => {
      const matchesSection =
        activeSection === "overview"
          ? true
          : activeSection === "available"
          ? incident.hospital === "Awaiting assignment"
          : activeSection === "myCases"
          ? incident.hospital === hospitalName && incident.status !== "resolved"
          : activeSection === "resolved"
          ? incident.hospital === hospitalName && incident.status === "resolved"
          : true;

      const matchesSearch = [incident.code, incident.title, incident.location, incident.userName, incident.userEmail]
        .join(" ")
        .toLowerCase()
        .includes(query);

      return matchesSection && matchesSearch;
    });
  }, [activeSection, hospitalName, incidents, searchTerm]);

  const staffCounts = useMemo(
    () => ({
      onDuty: profile.staff.filter((member) => member.shiftStatus === "On Duty").length,
      onCall: profile.staff.filter((member) => member.shiftStatus === "On Call").length,
      offDuty: profile.staff.filter((member) => member.shiftStatus === "Off Duty").length,
    }),
    [profile.staff]
  );

  const getTitle = () => {
    switch (activeSection) {
      case "available":
        return "Available Incidents";
      case "myCases":
        return "My Active Cases";
      case "ambulance":
        return "Ambulance Drivers";
      case "staff":
        return "Hospital Staff";
      case "facility":
        return "Facility Details";
      case "resolved":
        return "Resolved Cases";
      default:
        return "Hospital Response Center";
    }
  };

  const renderStats = () => (
    <section className="hospital-stats-grid">
      <article className="hospital-stat-card">
        <span>Free Beds</span>
        <strong>{profile.freeBeds}</strong>
        <p>Live free bed count for the hospital.</p>
      </article>

      <article className="hospital-stat-card">
        <span>Total Beds</span>
        <strong>{profile.totalBeds}</strong>
        <p>Total bed capacity stored in the hospital record.</p>
      </article>

      <article className="hospital-stat-card">
        <span>ICU Free</span>
        <strong>{profile.icuFree}</strong>
        <p>Available ICU beds right now.</p>
      </article>

      <article className="hospital-stat-card">
        <span>Occupied</span>
        <strong>{profile.occupiedPercent}%</strong>
        <p>Current estimated occupancy percentage.</p>
      </article>
    </section>
  );

  const renderIncidents = () => (
    <section className="hospital-incidents-grid">
      {isLoading && !filteredIncidents.length ? (
        <div className="hospital-empty-card">Loading incidents...</div>
      ) : filteredIncidents.length ? (
        filteredIncidents.map((incident) => {
          const isMine = incident.hospital === hospitalName;
          const isUnassigned = incident.hospital === "Awaiting assignment";

          return (
            <article className="hospital-incident-card" key={incident.id}>
              <div className="hospital-incident-head">
                <div>
                  <p className="hospital-incident-code">{incident.code}</p>
                  <h3>{incident.title}</h3>
                  <p className="hospital-incident-time">{formatTimeAgo(incident.createdAt)}</p>
                </div>
                <span className={`hospital-status-pill ${incident.status}`}>{incident.status}</span>
              </div>

              <div className="hospital-incident-block">
                <span>Location</span>
                <p>{incident.location}</p>
              </div>

              <div className="hospital-incident-block">
                <span>User Details</span>
                <p>{incident.userName || "Unknown user"}</p>
                <div className="hospital-chip-row">
                  {incident.userEmail ? <span className="hospital-chip">{incident.userEmail}</span> : null}
                  {incident.userPhone ? <span className="hospital-chip">{incident.userPhone}</span> : null}
                </div>
              </div>

              <div className="hospital-incident-block">
                <span>Assignment</span>
                <div className="hospital-chip-row">
                  <span className="hospital-chip">{incident.hospital}</span>
                  <span className="hospital-chip">Sent {incident.sentContacts}</span>
                  <span className="hospital-chip">Failed {incident.failedContacts}</span>
                </div>
              </div>

              {incident.message ? (
                <div className="hospital-incident-block">
                  <span>Alert Message</span>
                  <p>{incident.message}</p>
                </div>
              ) : null}

              <div className="hospital-actions">
                {isUnassigned ? (
                  <button className="hospital-primary-btn" onClick={() => claimIncident(incident.id)} type="button">
                    Claim Case
                  </button>
                ) : null}

              {isMine && incident.status !== "active" ? (
                <button
                  className="hospital-secondary-btn"
                  onClick={() => updateIncidentStatus(incident.id, "active")}
                  type="button"
                >
                  Mark Active
                </button>
              ) : null}

                {isMine && !incident.hospitalAccepted ? (
                  <button
                    className="hospital-primary-btn"
                    onClick={() => acceptIncident(incident.id)}
                    type="button"
                  >
                    Accept Case
                  </button>
                ) : null}

                {isMine && incident.hospitalAccepted && !incident.ambulanceAssignment ? (
                  <>
                    <select
                      className="hospital-driver-select"
                      value={selectedDriverByIncident[incident.id] || ""}
                      onChange={(event) =>
                        setSelectedDriverByIncident((current) => ({
                          ...current,
                          [incident.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select ambulance driver</option>
                      {ambulanceDrivers
                        .filter((driver) => driver.status !== "off-duty")
                        .map((driver) => (
                          <option key={driver.id} value={driver.id}>
                            {driver.name} - {driver.vehicleNumber || "Vehicle pending"}
                          </option>
                        ))}
                    </select>
                    <button
                      className="hospital-secondary-btn"
                      onClick={() => assignAmbulanceDriver(incident.id)}
                      type="button"
                    >
                      Assign Ambulance
                    </button>
                  </>
                ) : null}

                {incident.ambulanceAssignment ? (
                  <div className="hospital-assigned-driver">
                    Driver: {incident.ambulanceAssignment.name} ({incident.ambulanceAssignment.vehicleNumber || "No vehicle"})
                  </div>
                ) : null}

                {isMine && incident.status !== "resolved" ? (
                  <button
                    className="hospital-primary-btn"
                    onClick={() => updateIncidentStatus(incident.id, "resolved")}
                    type="button"
                  >
                    Mark Resolved
                  </button>
                ) : null}

                {incident.mapUrl ? (
                  <a className="hospital-link-btn" href={incident.mapUrl} target="_blank" rel="noreferrer">
                    Open Map
                  </a>
                ) : null}
              </div>
            </article>
          );
        })
      ) : (
        <div className="hospital-empty-card">No incidents match the current section.</div>
      )}
    </section>
  );

  const renderOverview = () => (
    <>
      {renderStats()}

      <section className="hospital-overview-grid">
        <div className="hospital-panel-card">
          <div className="hospital-panel-head">
            <div>
              <p className="hospital-eyebrow">Facility snapshot</p>
              <h3>{profile.hospitalName}</h3>
            </div>
          </div>
          <p className="hospital-overview-text">{profile.address || "No hospital address added yet."}</p>
          <div className="hospital-chip-row">
            <span className="hospital-chip">
              {profile.distanceKm ? `${profile.distanceKm} km` : "Distance not set"}
            </span>
            <span className="hospital-chip">
              Ambulance ETA {profile.ambulanceEtaMinutes || 0} min
            </span>
          </div>
        </div>

        <div className="hospital-panel-card">
          <div className="hospital-panel-head">
            <div>
              <p className="hospital-eyebrow">Staff on shift</p>
              <h3>Shift Status</h3>
            </div>
          </div>
          <div className="hospital-shift-stats">
            <div className="hospital-shift-pill">On Duty {staffCounts.onDuty}</div>
            <div className="hospital-shift-pill warn">On Call {staffCounts.onCall}</div>
            <div className="hospital-shift-pill mute">Off Duty {staffCounts.offDuty}</div>
          </div>
        </div>
      </section>

      <section className="hospital-panel-card">
        <div className="hospital-panel-head">
          <div>
            <p className="hospital-eyebrow">Bed availability</p>
            <h3>Unit Breakdown</h3>
          </div>
        </div>

        <div className="hospital-bed-list">
          {(profile.bedAvailability || []).length ? (
            profile.bedAvailability.map((item) => {
              const width = item.total ? Math.min((item.available / item.total) * 100, 100) : 0;

              return (
                <div className="hospital-bed-row" key={item.id}>
                  <span>{item.unit}</span>
                  <div className="hospital-bed-track">
                    <div className="hospital-bed-fill" style={{ width: `${width}%` }}></div>
                  </div>
                  <strong>
                    {item.available}/{item.total}
                  </strong>
                </div>
              );
            })
          ) : (
            <div className="hospital-empty-card">No bed availability units added yet.</div>
          )}
        </div>
      </section>

      <section className="hospital-panel-card">
        <div className="hospital-panel-head">
          <div>
            <p className="hospital-eyebrow">Doctors on duty</p>
            <h3>Staff Preview</h3>
          </div>
        </div>

        <div className="hospital-staff-preview">
          {(profile.staff || []).length ? (
            profile.staff.slice(0, 4).map((member) => (
              <div className="hospital-staff-row" key={member.id}>
                <div className="hospital-staff-avatar">{member.initials || member.name.slice(0, 2).toUpperCase()}</div>
                <div className="hospital-staff-meta">
                  <strong>{member.name}</strong>
                  <p>{member.department || "Department not set"}</p>
                </div>
                <span className={`hospital-shift-pill ${member.shiftStatus === "On Call" ? "warn" : member.shiftStatus === "Off Duty" ? "mute" : ""}`}>
                  {member.shiftStatus}
                </span>
              </div>
            ))
          ) : (
            <div className="hospital-empty-card">No staff records added yet.</div>
          )}
        </div>
      </section>
    </>
  );

  const renderStaff = () => (
    <section className="hospital-panel-card">
      <div className="hospital-panel-head">
        <div>
          <p className="hospital-eyebrow">Hospital staff</p>
          <h3>Staff Records</h3>
        </div>
        <div className="hospital-actions">
          <button className="hospital-secondary-btn" onClick={addStaffMember} type="button">
            Add Staff
          </button>
          <button className="hospital-primary-btn" onClick={saveHospitalProfile} type="button" disabled={isSavingProfile}>
            {isSavingProfile ? "Saving..." : "Save Staff"}
          </button>
        </div>
      </div>

      <div className="hospital-form-grid">
        {(profile.staff || []).length ? (
          profile.staff.map((member) => (
            <div className="hospital-form-card" key={member.id}>
              <div className="hospital-form-row">
                <label>Name</label>
                <input value={member.name} onChange={(event) => updateStaffMember(member.id, "name", event.target.value)} />
              </div>
              <div className="hospital-form-row">
                <label>Department</label>
                <input
                  value={member.department}
                  onChange={(event) => updateStaffMember(member.id, "department", event.target.value)}
                />
              </div>
              <div className="hospital-form-row">
                <label>Initials</label>
                <input
                  value={member.initials}
                  onChange={(event) => updateStaffMember(member.id, "initials", event.target.value.toUpperCase().slice(0, 4))}
                />
              </div>
              <div className="hospital-form-row">
                <label>Shift Status</label>
                <select
                  value={member.shiftStatus}
                  onChange={(event) => updateStaffMember(member.id, "shiftStatus", event.target.value)}
                >
                  {shiftOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <button className="hospital-remove-btn" onClick={() => removeStaffMember(member.id)} type="button">
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="hospital-empty-card">No staff records yet. Add one to start.</div>
        )}
      </div>
    </section>
  );

  const renderFacility = () => (
    <section className="hospital-panel-card">
      <div className="hospital-panel-head">
        <div>
          <p className="hospital-eyebrow">Facility management</p>
          <h3>Hospital Details</h3>
        </div>
        <button className="hospital-primary-btn" onClick={saveHospitalProfile} type="button" disabled={isSavingProfile}>
          {isSavingProfile ? "Saving..." : "Save Facility"}
        </button>
      </div>

      <div className="hospital-form-grid hospital-form-grid-wide">
        <div className="hospital-form-card">
          <div className="hospital-form-row">
            <label>Hospital Name</label>
            <input value={profile.hospitalName} readOnly />
          </div>
          <div className="hospital-form-row">
            <label>Address</label>
            <input value={profile.address} onChange={(event) => updateProfileField("address", event.target.value)} />
          </div>
          <div className="hospital-form-row">
            <label>Latitude</label>
            <input
              type="number"
              step="any"
              value={profile.latitude ?? ""}
              onChange={(event) => updateProfileField("latitude", event.target.value)}
            />
          </div>
          <div className="hospital-form-row">
            <label>Longitude</label>
            <input
              type="number"
              step="any"
              value={profile.longitude ?? ""}
              onChange={(event) => updateProfileField("longitude", event.target.value)}
            />
          </div>
          <div className="hospital-form-row">
            <label>Distance (km)</label>
            <input
              type="number"
              value={profile.distanceKm}
              onChange={(event) => updateProfileField("distanceKm", event.target.value)}
            />
          </div>
          <div className="hospital-form-row">
            <label>Ambulance ETA (min)</label>
            <input
              type="number"
              value={profile.ambulanceEtaMinutes}
              onChange={(event) => updateProfileField("ambulanceEtaMinutes", event.target.value)}
            />
          </div>
        </div>

        <div className="hospital-form-card">
          <div className="hospital-form-row">
            <label>Free Beds</label>
            <input type="number" value={profile.freeBeds} onChange={(event) => updateProfileField("freeBeds", event.target.value)} />
          </div>
          <div className="hospital-form-row">
            <label>Total Beds</label>
            <input type="number" value={profile.totalBeds} onChange={(event) => updateProfileField("totalBeds", event.target.value)} />
          </div>
          <div className="hospital-form-row">
            <label>ICU Free</label>
            <input type="number" value={profile.icuFree} onChange={(event) => updateProfileField("icuFree", event.target.value)} />
          </div>
          <div className="hospital-form-row">
            <label>Occupied %</label>
            <input
              type="number"
              value={profile.occupiedPercent}
              onChange={(event) => updateProfileField("occupiedPercent", event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="hospital-panel-head hospital-subhead">
        <div>
          <p className="hospital-eyebrow">Bed units</p>
          <h3>Availability Units</h3>
        </div>
        <button className="hospital-secondary-btn" onClick={addBedUnit} type="button">
          Add Unit
        </button>
      </div>

      <div className="hospital-form-grid">
        {(profile.bedAvailability || []).length ? (
          profile.bedAvailability.map((item) => (
            <div className="hospital-form-card" key={item.id}>
              <div className="hospital-form-row">
                <label>Unit</label>
                <input value={item.unit} onChange={(event) => updateBedUnit(item.id, "unit", event.target.value)} />
              </div>
              <div className="hospital-form-row">
                <label>Available</label>
                <input
                  type="number"
                  value={item.available}
                  onChange={(event) => updateBedUnit(item.id, "available", event.target.value)}
                />
              </div>
              <div className="hospital-form-row">
                <label>Total</label>
                <input
                  type="number"
                  value={item.total}
                  onChange={(event) => updateBedUnit(item.id, "total", event.target.value)}
                />
              </div>
              <button className="hospital-remove-btn" onClick={() => removeBedUnit(item.id)} type="button">
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="hospital-empty-card">No bed units added yet.</div>
        )}
      </div>
    </section>
  );

  const renderAmbulance = () => (
    <section className="hospital-panel-card">
      <div className="hospital-panel-head">
        <div>
          <p className="hospital-eyebrow">Ambulance database</p>
          <h3>Ambulance Drivers</h3>
        </div>
        <div className="hospital-actions">
          <button className="hospital-secondary-btn" onClick={addAmbulanceDriver} type="button">
            Add Driver
          </button>
          <button
            className="hospital-primary-btn"
            onClick={saveAmbulanceDrivers}
            type="button"
            disabled={isSavingDrivers}
          >
            {isSavingDrivers ? "Saving..." : "Save Drivers"}
          </button>
        </div>
      </div>

      <div className="hospital-form-grid">
        {ambulanceDrivers.length ? (
          ambulanceDrivers.map((driver) => (
            <div className="hospital-form-card" key={driver.id}>
              <div className="hospital-form-row">
                <label>Driver Name</label>
                <input
                  value={driver.name}
                  onChange={(event) => updateAmbulanceDriver(driver.id, "name", event.target.value)}
                />
              </div>
              <div className="hospital-form-row">
                <label>Phone</label>
                <input
                  value={driver.phone}
                  onChange={(event) => updateAmbulanceDriver(driver.id, "phone", event.target.value)}
                />
              </div>
              <div className="hospital-form-row">
                <label>Vehicle Number</label>
                <input
                  value={driver.vehicleNumber}
                  onChange={(event) => updateAmbulanceDriver(driver.id, "vehicleNumber", event.target.value)}
                />
              </div>
              <div className="hospital-form-row">
                <label>Status</label>
                <select
                  value={driver.status}
                  onChange={(event) => updateAmbulanceDriver(driver.id, "status", event.target.value)}
                >
                  {ambulanceStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <button className="hospital-remove-btn" onClick={() => removeAmbulanceDriver(driver.id)} type="button">
                Remove
              </button>
            </div>
          ))
        ) : (
          <div className="hospital-empty-card">No ambulance drivers added yet.</div>
        )}
      </div>
    </section>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "ambulance":
        return renderAmbulance();
      case "staff":
        return renderStaff();
      case "facility":
        return renderFacility();
      case "overview":
        return renderOverview();
      default:
        return renderIncidents();
    }
  };

  return (
    <div className="hospital-shell">
      {liveNotification ? (
        <div className="hospital-live-popup" role="status" aria-live="polite">
          <div className="hospital-live-popup-top">
            <div>
              <p className="hospital-eyebrow">New Hospital Alert</p>
              <h3>{liveNotification.title}</h3>
            </div>
            <button
              className="hospital-live-popup-close"
              type="button"
              onClick={() => setLiveNotification(null)}
              aria-label="Close hospital notification popup"
            >
              X
            </button>
          </div>
          <p className="hospital-live-popup-text">{liveNotification.location}</p>
          <div className="hospital-chip-row">
            <span className={`hospital-status-pill ${liveNotification.status}`}>
              {liveNotification.status}
            </span>
            {liveNotification.hospitalDetails?.distanceKm ? (
              <span className="hospital-chip">
                {liveNotification.hospitalDetails.distanceKm} km away
              </span>
            ) : null}
            {liveNotification.hospitalDetails ? (
              <span className="hospital-chip">
                Beds {liveNotification.hospitalDetails.freeBeds}/{liveNotification.hospitalDetails.totalBeds}
              </span>
            ) : null}
            <span className="hospital-chip">{formatTimeAgo(liveNotification.createdAt)}</span>
          </div>
          {liveNotification.mapUrl ? (
            <a className="hospital-link-btn" href={liveNotification.mapUrl} target="_blank" rel="noreferrer">
              Open Map
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="hospital-bg hospital-bg-1"></div>
      <div className="hospital-bg hospital-bg-2"></div>
      <div className="hospital-grid"></div>

      <div className="hospital-mobile-topbar">
        <button
          className="hospital-menu-btn"
          type="button"
          aria-label="Open hospital menu"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <img src="/logo.png" alt="Prana Raksha Logo" className="hospital-mobile-logo" />
      </div>

      {mobileMenuOpen ? (
        <button
          className="hospital-sidebar-overlay"
          type="button"
          aria-label="Close hospital menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <aside className={`hospital-sidebar ${mobileMenuOpen ? "open" : ""}`}>
        <div className="hospital-brand">
          <img src="/logo.png" alt="Prana Raksha Logo" className="hospital-logo" />
        </div>

        <nav className="hospital-nav">
          {sectionConfig.map((section) => (
            <button
              key={section.key}
              type="button"
              className={`hospital-nav-link ${activeSection === section.key ? "active" : ""}`}
              onClick={() => {
                setActiveSection(section.key);
                setMobileMenuOpen(false);
              }}
            >
              <span className="hospital-nav-icon">{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </nav>

        <div className="hospital-status-card">
          <p className="hospital-eyebrow">Connected Facility</p>
          <h3>{hospitalName}</h3>
          <p>{profile.address || "Add your hospital address in the Facility section."}</p>
        </div>

        <button className="hospital-logout-btn" onClick={handleLogout} type="button">
          Logout
        </button>
      </aside>

      <main className="hospital-main">
        <header className="hospital-topbar">
          <div>
            <p className="hospital-eyebrow">Hospital Dashboard</p>
            <h1>{getTitle()}</h1>
          </div>

          <div className="hospital-top-actions">
            <div className="hospital-notification-wrap">
              <button
                className="hospital-notification-btn"
                type="button"
                aria-label="Open hospital notifications"
                onClick={() => setNotificationsOpen((prev) => !prev)}
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
                {notificationData.unreadCount ? (
                  <span className="hospital-notification-count">{notificationData.unreadCount}</span>
                ) : null}
              </button>

              {notificationsOpen ? (
                <div className="hospital-notification-panel">
                  <div className="hospital-notification-head">
                    <div>
                      <p className="hospital-eyebrow">Notifications</p>
                      <h3>Hospital Alerts</h3>
                    </div>
                  </div>

                  <div className="hospital-notification-list">
                    {notificationData.notifications.length ? (
                      notificationData.notifications.map((notification) => (
                        <div
                          className={`hospital-notification-item ${notification.isRead ? "read" : "unread"}`}
                          key={notification.id}
                        >
                          <div className="hospital-notification-top">
                            <strong>{notification.title}</strong>
                            <span className={`hospital-status-pill ${notification.status}`}>
                              {notification.status}
                            </span>
                          </div>
                          <p>{notification.location}</p>
                          {notification.hospitalDetails ? (
                            <div className="hospital-chip-row">
                              <span className="hospital-chip">
                                {notification.hospitalDetails.distanceKm || 0} km
                              </span>
                              <span className="hospital-chip">
                                Beds {notification.hospitalDetails.freeBeds}/{notification.hospitalDetails.totalBeds}
                              </span>
                              <span className="hospital-chip">
                                ETA {notification.hospitalDetails.ambulanceEtaMinutes || 0} min
                              </span>
                            </div>
                          ) : null}
                          <span className="hospital-notification-time">
                            {formatTimeAgo(notification.createdAt)}
                          </span>
                          {notification.mapUrl ? (
                            <a className="hospital-link-btn" href={notification.mapUrl} target="_blank" rel="noreferrer">
                              Open Map
                            </a>
                          ) : null}
                          {!notification.isRead ? (
                            <button
                              className="hospital-secondary-btn"
                              type="button"
                              onClick={() => markNotificationAsRead(notification.id)}
                            >
                              Mark Read
                            </button>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="hospital-empty-card">No notifications yet.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="hospital-search">
              <input
                type="text"
                placeholder="Search incident, user, location..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <button className="hospital-refresh-btn" onClick={() => fetchHospitalDashboard()} type="button">
              Refresh
            </button>
          </div>
        </header>

        {message ? <div className="hospital-message">{message}</div> : null}

        {renderContent()}
      </main>
    </div>
  );
}
