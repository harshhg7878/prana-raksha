import { useMemo, useState } from "react";

const isAssignedHospital = (alert) =>
  Boolean(alert?.hospital && alert.hospital !== "Awaiting assignment");

const getTrackingSteps = (alert) => [
  {
    key: "sent",
    title: "Alert Sent",
    text: alert?.createdAt
      ? `Emergency alert created at ${new Date(alert.createdAt).toLocaleString()}.`
      : "Your emergency alert has been submitted.",
    done: Boolean(alert),
  },
  {
    key: "verified",
    title: "Verified",
    text: alert?.status === "pending"
      ? "Control room verification is still in progress."
      : "System and control room verified the incident.",
    done: Boolean(alert && alert.status !== "pending"),
  },
  {
    key: "hospital",
    title: "Hospital Assigned",
    text: isAssignedHospital(alert)
      ? `${alert.hospital} is assigned to this emergency.`
      : "Waiting for the nearest connected hospital to be assigned.",
    done: isAssignedHospital(alert),
  },
  {
    key: "ambulance",
    title: "Ambulance Dispatch",
    text: alert?.ambulanceAssignment
      ? `${alert.ambulanceAssignment.name || "Ambulance team"}${
          alert.ambulanceAssignment.vehicleNumber
            ? ` (${alert.ambulanceAssignment.vehicleNumber})`
            : ""
        } is assigned.`
      : alert?.hospitalAccepted
        ? "Hospital has accepted the case. Ambulance assignment is pending."
        : "Response team will be prepared after hospital acceptance.",
    done: Boolean(alert?.ambulanceAssignment),
  },
  {
    key: "resolved",
    title: "Resolved",
    text: alert?.resolvedAt
      ? `Case marked resolved at ${new Date(alert.resolvedAt).toLocaleString()}.`
      : "Case will be marked complete after final response.",
    done: alert?.status === "resolved",
  },
];

const getActiveStepIndex = (steps) => {
  const nextStepIndex = steps.findIndex((step) => !step.done);
  return nextStepIndex === -1 ? steps.length - 1 : nextStepIndex;
};

export default function TrackStatusSection({ alerts = [], setActiveSection }) {
  const [selectedAlertId, setSelectedAlertId] = useState("");

  const selectedAlert = useMemo(() => {
    if (!alerts.length) {
      return null;
    }

    return alerts.find((alert) => alert.id === selectedAlertId) || alerts[0];
  }, [alerts, selectedAlertId]);

  const trackingSteps = useMemo(
    () => getTrackingSteps(selectedAlert),
    [selectedAlert]
  );
  const activeStepIndex = getActiveStepIndex(trackingSteps);

  return (
    <section className="section-stack">
      <div className="panel glass-card section-page">
        <div className="section-head-row">
          <div>
            <p className="eyebrow">Emergency progress</p>
            <h2>Track Status</h2>
          </div>
          <button className="secondary-btn" onClick={() => setActiveSection("dashboard")}>
            Back to Dashboard
          </button>
        </div>

        {!alerts.length ? (
          <div className="incident-item">
            <div className="incident-title">No active tracking data</div>
            <div className="incident-location">
              Send an emergency alert first. Its live backend status will appear here.
            </div>
          </div>
        ) : (
          <>
            <div className="track-summary-card">
              <div className="track-summary-main">
                <p className="eyebrow">Current alert</p>
                <h3>{selectedAlert.title}</h3>
                <p>{selectedAlert.location}</p>
              </div>
              <div className="track-summary-actions">
                <select
                  value={selectedAlert.id}
                  onChange={(event) => setSelectedAlertId(event.target.value)}
                >
                  {alerts.map((alert) => (
                    <option key={alert.id} value={alert.id}>
                      {alert.code} - {alert.status}
                    </option>
                  ))}
                </select>
                <span className={`status-pill ${selectedAlert.status}`}>
                  {selectedAlert.status}
                </span>
              </div>
            </div>

            <div className="incident-meta track-meta-row">
              <span className="meta-pill">{selectedAlert.code}</span>
              <span className="meta-pill">{selectedAlert.time}</span>
              <span className="meta-pill">{selectedAlert.hospital}</span>
              {selectedAlert.ambulanceAssignment ? (
                <span className="meta-pill">
                  Ambulance {selectedAlert.ambulanceAssignment.vehicleNumber || "assigned"}
                </span>
              ) : null}
            </div>

            <div className="status-timeline">
              {trackingSteps.map((step, index) => (
                <div
                  className={`timeline-step ${step.done ? "done" : ""} ${
                    index === activeStepIndex ? "active-step" : ""
                  }`}
                  key={step.key}
                >
                  <div className="timeline-dot"></div>
                  <div>
                    <h4>{step.title}</h4>
                    <p>{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
