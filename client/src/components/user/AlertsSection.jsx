export default function AlertsSection({ alerts, setActiveSection, onResolveAlert }) {
  return (
    <section className="panel glass-card section-page">
      <div className="section-head-row">
        <div>
          <p className="eyebrow">Alert history</p>
          <h2>My Alerts</h2>
        </div>
        <button className="secondary-btn" onClick={() => setActiveSection("dashboard")}>
          Back to Dashboard
        </button>
      </div>

      <div className="incident-list">
        {alerts.map((alert) => (
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

            {alert.status !== "resolved" && (
              <div style={{ marginTop: "12px" }}>
                <button
                  className="secondary-btn small-btn"
                  onClick={() => onResolveAlert(alert.id)}
                >
                  Mark Resolved
                </button>
              </div>
            )}
          </div>
        ))}

        {alerts.length === 0 && (
          <div className="incident-item">
            <div className="incident-title">No alerts found</div>
            <div className="incident-location">
              New alert records will appear here after you send an emergency alert.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
