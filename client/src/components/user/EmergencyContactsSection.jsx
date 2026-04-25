import { useEffect, useRef, useState } from "react";
import IncidentLocationMap from "./IncidentLocationMap";
import { apiFetch } from "../../lib/api";

const emptyForm = {
  fullName: "",
  relationship: "",
  city: "",
  phoneNumber: "",
  priority: "P2",
  note: "",
  isPrimary: false,
  channels: {
    sms: true,
    whatsapp: false,
    call: false,
    push: false,
  },
};

const defaultLocationState = {
  lat: null,
  lng: null,
  address: "",
  updatedAt: "",
  loading: false,
  accuracy: null,
  source: "",
};

const TARGET_BROWSER_ACCURACY = 100;
const MAX_ACCEPTABLE_BROWSER_ACCURACY = 300;
const LOCATION_CAPTURE_WINDOW_MS = 30000;

const formatCoordinateLabel = (latitude, longitude) =>
  `Lat ${latitude.toFixed(6)}, Lng ${longitude.toFixed(6)}`;

export default function EmergencyContactsSection({ scrollRequest = null }) {
  const [contacts, setContacts] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("contacts");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [incidentLocation, setIncidentLocation] = useState(defaultLocationState);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const liveWatchIdRef = useRef(null);
  const incidentMapRef = useRef(null);
  const manualAlertRef = useRef(null);

  const storedUser = JSON.parse(localStorage.getItem("user") || "null");

  const fetchContacts = async () => {
    const res = await apiFetch("/api/contacts");

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to fetch contacts");
    }

    setContacts(data);
  };

  const fetchAlertHistory = async () => {
    const res = await apiFetch("/api/contacts/alert-history");

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Failed to fetch alert history");
    }

    setAlertHistory(data);
  };

  useEffect(() => {
    if (!storedUser) {
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([fetchContacts(), fetchAlertHistory()]);
      } catch (err) {
        setMessage(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [storedUser?.role]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name in form.channels) {
      setForm((prev) => ({
        ...prev,
        channels: {
          ...prev.channels,
          [name]: checked,
        },
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const updateLocationAddress = (e) => {
    const { value } = e.target;
    setIncidentLocation((prev) => ({
      ...prev,
      address: value,
    }));
  };

  const setManualLocation = ({ lat, lng }) => {
    setIncidentLocation((prev) => ({
      ...prev,
      lat,
      lng,
      address:
        prev.address && !prev.address.startsWith("Lat ")
          ? prev.address
          : formatCoordinateLabel(lat, lng),
      updatedAt: new Date().toLocaleString(),
      loading: false,
      accuracy: 0,
      source: "manual",
    }));
    setMessage("Incident pin updated from the map.");
  };

  const commitCapturedLocation = (position, options = {}) => {
    const { announceSuccess = false, announceFailure = true } = options;
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracy = Number.isFinite(position.coords.accuracy)
      ? Math.round(position.coords.accuracy)
      : null;

    if (
      accuracy !== null &&
      accuracy > MAX_ACCEPTABLE_BROWSER_ACCURACY
    ) {
      setIncidentLocation((prev) => ({
        ...prev,
        loading: false,
        accuracy,
        source: "",
      }));
      if (announceFailure) {
        setMessage(
          `Browser location is still too inaccurate (about ${accuracy} meters). Turn on precise device location or use a phone with GPS for accurate auto-detection.`
        );
      }
      return;
    }

    setIncidentLocation({
      lat: latitude,
      lng: longitude,
      address: formatCoordinateLabel(latitude, longitude),
      updatedAt: new Date().toLocaleString(),
      loading: false,
      accuracy,
      source: "browser",
    });

    if (announceSuccess) {
      setMessage("Current location captured successfully.");
    }
  };

  const stopLiveTracking = () => {
    if (liveWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(liveWatchIdRef.current);
      liveWatchIdRef.current = null;
    }

    setIsLiveTracking(false);
  };

  const startLiveTracking = ({ forceMessage = false } = {}) => {
    if (!window.isSecureContext) {
      if (forceMessage) {
        setMessage(
          "Location access needs HTTPS on mobile devices. Open this app from the secure HTTPS dev URL on your phone."
        );
      }
      return;
    }

    if (!navigator.geolocation) {
      if (forceMessage) {
        setMessage("Geolocation is not supported in this browser.");
      }
      return;
    }

    setMessage("");
    setIncidentLocation((prev) => ({
      ...prev,
      loading: true,
    }));
    stopLiveTracking();

    liveWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const isFirstAccurateFix =
          typeof incidentLocation.lat !== "number" ||
          typeof incidentLocation.lng !== "number";

        commitCapturedLocation(position, {
          announceSuccess: forceMessage || isFirstAccurateFix,
          announceFailure: forceMessage || isFirstAccurateFix,
        });
        setIsLiveTracking(true);
      },
      (error) => {
        setIncidentLocation((prev) => ({
          ...prev,
          loading: false,
        }));
        setIsLiveTracking(false);
        setMessage(error.message || "Unable to fetch current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: LOCATION_CAPTURE_WINDOW_MS,
        maximumAge: 0,
      }
    );
  };

  useEffect(() => {
    if (!storedUser) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      startLiveTracking();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      stopLiveTracking();
    };
  }, [storedUser?.role]);

  useEffect(() => {
    if (!scrollRequest?.target) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActiveTab("contacts");

      const targetElement =
        scrollRequest.target === "incident-map"
          ? incidentMapRef.current
          : manualAlertRef.current;

      targetElement?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [scrollRequest]);

  const addContact = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      setLoading(true);

      const res = await apiFetch("/api/contacts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to add contact");
      }

      setForm(emptyForm);
      setMessage("Contact added successfully.");
      setActiveTab("contacts");
      await fetchContacts();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteContact = async (id) => {
    try {
      setMessage("");
      setLoading(true);

      const res = await apiFetch(`/api/contacts/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to delete contact");
      }

      setMessage("Contact deleted successfully.");
      await fetchContacts();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAlertAll = async () => {
    if (
      typeof incidentLocation.lat !== "number" ||
      typeof incidentLocation.lng !== "number"
    ) {
      setMessage("Capture the current incident location before sending the alert.");
      return;
    }

    try {
      setMessage("");
      setLoading(true);

      const res = await apiFetch("/api/contacts/alert-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message:
            "Emergency alert from Prana Raksha. Possible accident detected. Please respond immediately.",
          incidentLocation: {
            latitude: incidentLocation.lat,
            longitude: incidentLocation.lng,
            address: incidentLocation.address,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to send alerts");
      }

      setMessage("Alert sent successfully with the incident location.");
      await Promise.all([fetchContacts(), fetchAlertHistory()]);
      setActiveTab("history");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name = "") =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const getPriorityClass = (priority) => {
    if (priority === "P1") return "red";
    if (priority === "P2") return "yellow";
    return "yellow";
  };

  const getPriorityText = (priority) => {
    if (priority === "P1") return "P1 Critical";
    if (priority === "P2") return "P2 Important";
    return "P3 Standard";
  };

  return (
    <section className="contacts-full-section">
      <div className="panel glass-card emergency-contacts-panel">
        <div className="contacts-header">
          <div className="contacts-header-left">
            <div className="contacts-icon-box">SOS</div>
            <div>
              <h3>Emergency Contacts</h3>
              <p className="contacts-subtitle">Auto-alert on incident detection</p>
            </div>
          </div>

          <div className="contacts-header-right">
            <span className="contacts-count">
              Total contacts: <strong>{contacts.length}</strong>
            </span>
          </div>
        </div>

        <div className="contacts-tabs">
          <button
            className={`contacts-tab ${activeTab === "contacts" ? "active" : ""}`}
            onClick={() => setActiveTab("contacts")}
            type="button"
          >
            Contacts ({contacts.length})
          </button>

          <button
            className={`contacts-tab ${activeTab === "add" ? "active" : ""}`}
            onClick={() => setActiveTab("add")}
            type="button"
          >
            Add New Contact
          </button>

          <button
            className={`contacts-tab ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
            type="button"
          >
            Alert History
          </button>
        </div>

        {message && (
          <div className="contacts-feedback">
            {message}
          </div>
        )}

        {activeTab === "contacts" && (
          <>
            <div className="contacts-section-label">Priority Contacts</div>

            <div className="incident-map-section scroll-target-section" ref={incidentMapRef}>
              <div className="incident-map-head">
                <div>
                  <h4>Incident Location</h4>
                  <p>Capture your current location or click directly on the map to place the incident pin manually.</p>
                </div>

                <button
                  className="secondary-btn small-btn"
                  type="button"
                  onClick={() => startLiveTracking({ forceMessage: true })}
                  disabled={loading || incidentLocation.loading}
                >
                  {incidentLocation.loading
                    ? "Capturing..."
                    : isLiveTracking
                    ? "Refresh Live Location"
                    : "Start Live Location"}
                </button>
              </div>

              <IncidentLocationMap
                location={
                  typeof incidentLocation.lat === "number" &&
                  typeof incidentLocation.lng === "number"
                    ? {
                        lat: incidentLocation.lat,
                        lng: incidentLocation.lng,
                        label: incidentLocation.address || "Incident Location",
                      }
                    : null
                }
                onSelectLocation={setManualLocation}
              />

              <div className="incident-location-grid">
                <div className="input-group">
                  <label>Incident Coordinates</label>
                  <input
                    type="text"
                    value={
                      typeof incidentLocation.lat === "number" &&
                      typeof incidentLocation.lng === "number"
                        ? `${incidentLocation.lat.toFixed(6)}, ${incidentLocation.lng.toFixed(6)}`
                        : ""
                    }
                    placeholder="Capture your location to fill this field"
                    readOnly
                  />
                </div>

                <div className="input-group">
                  <label>Location Label</label>
                  <input
                    type="text"
                    value={incidentLocation.address}
                    onChange={updateLocationAddress}
                    placeholder="Add landmark or area name"
                  />
                </div>
              </div>

              <div className="incident-location-meta">
                <span className="meta-pill">Tip: click anywhere on the map to set the incident pin manually.</span>
                <span className="meta-pill">
                  {isLiveTracking ? "Live tracking active" : "Live tracking paused"}
                </span>
                <span className="meta-pill">
                  {incidentLocation.updatedAt
                    ? `Updated ${incidentLocation.updatedAt}`
                    : "Location not captured yet"}
                </span>
                {incidentLocation.source && (
                  <span className="meta-pill">
                    Source: {incidentLocation.source === "manual" ? "Manual pin" : "Browser GPS"}
                  </span>
                )}
                {incidentLocation.accuracy !== null && (
                  <span className="meta-pill">
                    Accuracy about {incidentLocation.accuracy} m
                  </span>
                )}
              </div>
            </div>

            {loading ? (
              <div style={{ padding: "18px 24px 24px" }}>Loading contacts...</div>
            ) : contacts.length === 0 ? (
              <div style={{ padding: "18px 24px 24px", color: "rgba(255,255,255,0.7)" }}>
                No emergency contacts added yet.
              </div>
            ) : (
              contacts.map((contact) => (
                <div
                  className={`contact-card ${
                    contact.priority === "P1" ? "priority-red" : "priority-yellow"
                  }`}
                  key={contact._id}
                >
                  <div className="contact-main">
                    <div className="contact-avatar">{getInitials(contact.fullName)}</div>

                    <div className="contact-info">
                      <div className="contact-top-line">
                        <h4>{contact.fullName}</h4>
                        <span className={`priority-badge ${getPriorityClass(contact.priority)}`}>
                          {getPriorityText(contact.priority)}
                        </span>
                      </div>

                      <p className="contact-meta">
                        {contact.relationship || "Emergency Contact"}
                        {contact.city ? ` - ${contact.city}` : ""}
                      </p>

                      <p className="contact-phone">{contact.phoneNumber}</p>

                      <div className="contact-tags">
                        {contact.channels?.sms && <span>SMS</span>}
                        {contact.channels?.whatsapp && <span>WhatsApp</span>}
                        {contact.channels?.call && <span>Call</span>}
                        {contact.channels?.push && <span>Push</span>}
                      </div>

                      {(contact.note || contact.isPrimary) && (
                        <p className="contact-note">
                          {contact.isPrimary ? "Primary contact" : ""}
                          {contact.isPrimary && contact.note ? " | " : ""}
                          {contact.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="contact-actions">
                    <button
                      className="mini-action-btn"
                      type="button"
                      onClick={() => deleteContact(contact._id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}

            <div className="contacts-footer scroll-target-section" ref={manualAlertRef}>
              <div className="contacts-footer-text">
                <p>SMS alerts now include the incident coordinates and a map link.</p>
                <p>{contacts.length} contacts active | Alert system ready</p>
              </div>

              <button
                className="alert-all-btn"
                type="button"
                onClick={handleAlertAll}
                disabled={loading || incidentLocation.loading}
              >
                {loading ? "Sending..." : "Alert All Now"}
              </button>
            </div>
          </>
        )}

        {activeTab === "add" && (
          <div style={{ padding: "22px 24px 24px" }}>
            <form className="manual-alert-form" onSubmit={addContact}>
              <div className="input-group">
                <label>Full Name</label>
                <input
                  type="text"
                  name="fullName"
                  placeholder="Enter full name"
                  value={form.fullName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="input-group">
                <label>Relationship</label>
                <input
                  type="text"
                  name="relationship"
                  placeholder="Spouse, Parent, Doctor..."
                  value={form.relationship}
                  onChange={handleChange}
                />
              </div>

              <div className="input-group">
                <label>City</label>
                <input
                  type="text"
                  name="city"
                  placeholder="Enter city"
                  value={form.city}
                  onChange={handleChange}
                />
              </div>

              <div className="input-group">
                <label>Phone Number</label>
                <input
                  type="text"
                  name="phoneNumber"
                  placeholder="Enter phone number"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="input-group">
                <label>Priority</label>
                <select
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                  className="contact-select"
                >
                  <option value="P1">P1 Critical</option>
                  <option value="P2">P2 Important</option>
                  <option value="P3">P3 Standard</option>
                </select>
              </div>

              <div className="input-group">
                <label>Note</label>
                <textarea
                  rows="4"
                  name="note"
                  placeholder="Primary contact, family physician, etc."
                  value={form.note}
                  onChange={handleChange}
                />
              </div>

              <div className="contact-channel-grid">
                <label className="contact-check">
                  <input
                    type="checkbox"
                    name="sms"
                    checked={form.channels.sms}
                    onChange={handleChange}
                  />
                  <span>SMS</span>
                </label>

                <label className="contact-check">
                  <input
                    type="checkbox"
                    name="whatsapp"
                    checked={form.channels.whatsapp}
                    onChange={handleChange}
                  />
                  <span>WhatsApp</span>
                </label>

                <label className="contact-check">
                  <input
                    type="checkbox"
                    name="call"
                    checked={form.channels.call}
                    onChange={handleChange}
                  />
                  <span>Call</span>
                </label>

                <label className="contact-check">
                  <input
                    type="checkbox"
                    name="push"
                    checked={form.channels.push}
                    onChange={handleChange}
                  />
                  <span>Push</span>
                </label>
              </div>

              <label className="contact-check primary-check">
                <input
                  type="checkbox"
                  name="isPrimary"
                  checked={form.isPrimary}
                  onChange={handleChange}
                />
                <span>Set as primary emergency contact</span>
              </label>

              <button className="primary-btn full-btn" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Contact"}
              </button>
            </form>
          </div>
        )}

        {activeTab === "history" && (
          <div style={{ padding: "22px 24px 24px" }}>
            {loading ? (
              <div style={{ color: "rgba(255,255,255,0.7)" }}>Loading alert history...</div>
            ) : alertHistory.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.7)" }}>
                No alert history available yet.
              </div>
            ) : (
              <div className="incident-list">
                {alertHistory.map((entry) => (
                  <div className="incident-item" key={entry._id}>
                    <div className="incident-top">
                      <div>
                        <div className="incident-title">{entry.fullName}</div>
                        <div className="incident-location">{entry.phoneNumber}</div>
                      </div>
                      <span className="meta-pill">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="incident-meta">
                      <span className="meta-pill">{entry.status}</span>
                      <span className="meta-pill">{entry.channel}</span>
                      {entry.incidentLocation?.address && (
                        <span className="meta-pill">{entry.incidentLocation.address}</span>
                      )}
                    </div>

                    {entry.incidentLocation?.mapUrl && (
                      <a
                        className="history-map-link"
                        href={entry.incidentLocation.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open incident map
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
