import EmergencyContactsSection from "./EmergencyContactsSection";
import { useEffect, useRef, useState } from "react";

export default function DashboardHome({
  alerts,
  profile,
  stats,
  setActiveSection,
  dashcamStream,
  dashcamError,
  isStartingDashcam,
  onStartDashcam,
  onStopDashcam,
}) {
  const videoRef = useRef(null);
  const [scrollRequest, setScrollRequest] = useState(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = dashcamStream || null;
  }, [dashcamStream]);

  return (
    <>
      <section className="hero-panel glass-card">
        <div className="hero-copy">
          <p className="eyebrow">Emergency Access</p>
          <h2>Detect accidents, send alerts, and track emergency response in real time.</h2>
          <p className="hero-text">
            Use dashcam monitoring, upload accident evidence, or manually send
            emergency alerts to trusted contacts and response teams.
          </p>

          <div className="hero-actions">
            <button
              className="primary-btn"
              type="button"
              onClick={() => setScrollRequest({ target: "manual-alert", requestedAt: Date.now() })}
            >
              Report Incident
            </button>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => setScrollRequest({ target: "incident-map", requestedAt: Date.now() })}
            >
              Share Location
            </button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="visual-ring">
            <div className="visual-core">
              <span>24/7</span>
              <p>Safety Monitoring</p>
            </div>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Total Alerts</span>
            <div className="stat-icon">!</div>
          </div>
          <h3>{stats.totalAlerts}</h3>
          <p className="trend neutral">Your submitted emergency cases</p>
        </article>

        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Active Alert</span>
            <div className="stat-icon">...</div>
          </div>
          <h3>{stats.activeAlerts}</h3>
          <p className="trend warn">Alerts currently under response</p>
        </article>

        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Resolved</span>
            <div className="stat-icon">OK</div>
          </div>
          <h3>{stats.resolvedAlerts}</h3>
          <p className="trend up">Successfully handled alerts</p>
        </article>

        <article className="stat-card glass-card">
          <div className="stat-top">
            <span>Assigned Hospital</span>
            <div className="stat-icon">H</div>
          </div>
          <h3>{alerts.filter((alert) => alert.hospital !== "Awaiting assignment").length}</h3>
          <p className="trend neutral">Alerts with a linked response center</p>
        </article>
      </section>

      <section className="tools-grid">
        <div className="panel glass-card dashcam-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Live camera</p>
              <h3>Dashcam Monitoring</h3>
            </div>
          </div>

          <div className="dashcam-preview">
            {dashcamStream ? (
              <video ref={videoRef} autoPlay muted playsInline className="dashcam-video" />
            ) : (
              <div className="dashcam-overlay">
                <span className="live-badge">LIVE</span>
                <p>{dashcamError || "Dashcam preview area"}</p>
              </div>
            )}
          </div>

          <div className="hero-actions">
            <button
              className="primary-btn"
              type="button"
              onClick={onStartDashcam}
              disabled={isStartingDashcam}
            >
              {isStartingDashcam ? "Starting..." : "Start Dashcam"}
            </button>
            <button className="secondary-btn" type="button" onClick={onStopDashcam} disabled={!dashcamStream}>
              Stop
            </button>
          </div>
        </div>

        <div className="panel glass-card upload-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">AI Detection</p>
              <h3>Upload for Detection</h3>
            </div>
          </div>

          <div className="upload-grid">
            <button className="upload-card upload-card-button" type="button" onClick={() => setActiveSection("dashcam")}>
              <span className="upload-icon">IMG</span>
              <h4>Upload Image</h4>
              <p>Upload accident image for AI-based detection</p>
            </button>

            <button className="upload-card upload-card-button" type="button" onClick={() => setActiveSection("dashcam")}>
              <span className="upload-icon">VID</span>
              <h4>Upload Video</h4>
              <p>Upload footage for incident analysis</p>
            </button>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel glass-card">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Alert history</p>
              <h3>My Alerts</h3>
            </div>
            <button className="secondary-btn small-btn" onClick={() => setActiveSection("alerts")}>
              Open
            </button>
          </div>

          <div className="incident-list">
            {alerts.slice(0, 2).map((alert) => (
              <div className="incident-item" key={alert.id}>
                <div className="incident-top">
                  <div>
                    <div className="incident-title">{alert.title}</div>
                    <div className="incident-location">{alert.location}</div>
                  </div>
                  <span className={`status-pill ${alert.status}`}>{alert.status}</span>
                </div>

                <div className="incident-meta">
                  <span className="meta-pill">{alert.code}</span>
                  <span className="meta-pill">{alert.time}</span>
                  <span className="meta-pill">{alert.hospital}</span>
                </div>
              </div>
            ))}

            {alerts.length === 0 && (
              <div className="incident-item">
                <div className="incident-title">No alerts yet</div>
                <div className="incident-location">
                  Send your first emergency alert to see live dashboard data here.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="right-column">
          <div className="panel glass-card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Response timeline</p>
                <h3>Live Status</h3>
              </div>
              <button className="secondary-btn small-btn" onClick={() => setActiveSection("track")}>
                Open
              </button>
            </div>

            <div className="activity-list">
              <div className="activity-item">
                <div className="activity-dot green"></div>
                <div className="activity-text">
                  <h4>Dashboard Synced</h4>
                  <p>Stats and alert cards are now loaded from the database.</p>
                </div>
              </div>

              <div className="activity-item">
                <div className="activity-dot yellow"></div>
                <div className="activity-text">
                  <h4>Live Polling Active</h4>
                  <p>User dashboard refreshes recent alert data automatically.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="panel glass-card">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Account</p>
                <h3>Profile</h3>
              </div>
              <button className="secondary-btn small-btn" onClick={() => setActiveSection("profile")}>
                Open
              </button>
            </div>

            <div className="summary-boxes">
              <div className="summary-item">
                {profile.name || "User"} | {profile.email || "No email"}
              </div>
              <div className="summary-item">Phone: {profile.phone || "Not added"}</div>
              <div className="summary-item">
                Primary Hospital: {profile.primaryHospital || "Not set"}
              </div>
              <div className="summary-item">
                Alert Method: {profile.alertMethod || "SMS + Push"}
              </div>
              <div className="summary-item">
                Location Sharing: {profile.locationSharing ? "Enabled" : "Disabled"}
              </div>
              <div className="summary-item">
                Status: {profile.profileStatus || "Active"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <EmergencyContactsSection scrollRequest={scrollRequest} />
    </>
  );
}
