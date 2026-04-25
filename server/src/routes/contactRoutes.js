const express = require("express");

const {
  getMyContacts,
  streamRealtimeEvents,
  addContact,
  deleteContact,
  alertAllContacts,
  getAlertHistory,
  getDashboardAlerts,
  getAdminDashboardAlerts,
  getAdminPopupNotifications,
  getAdminIncidents,
  getAdminHospitals,
  getAdminUsers,
  exportAdminReport,
  assignIncidentToHospitalByAdmin,
  getAdminAnalytics,
  getAdminSettings,
  getHospitalDashboard,
  getHospitalNotifications,
  getHospitalAmbulanceDrivers,
  updateHospitalProfile,
  saveHospitalAmbulanceDrivers,
  claimHospitalIncident,
  acceptHospitalIncident,
  markHospitalNotificationRead,
  assignHospitalIncidentDriver,
  updateHospitalIncidentStatus,
  updateAdminSettings,
  markAdminPopupNotificationRead,
  updateIncidentAlertStatus,
} = require("../controllers/contactController");
const { protect, protectEventStream } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getMyContacts);
router.get("/events", protectEventStream, streamRealtimeEvents);
router.post("/", protect, addContact);
router.delete("/:id", protect, deleteContact);

router.post("/alert-all", protect, alertAllContacts);
router.get("/alert-history", protect, getAlertHistory);
router.get("/dashboard-alerts", protect, getDashboardAlerts);
router.get("/admin-dashboard-alerts", protect, getAdminDashboardAlerts);
router.get("/admin-popup-alerts", protect, getAdminPopupNotifications);
router.get("/admin-incidents", protect, getAdminIncidents);
router.get("/admin-hospitals", protect, getAdminHospitals);
router.get("/admin-users", protect, getAdminUsers);
router.get("/admin-report", protect, exportAdminReport);
router.patch("/admin-incidents/:id/assign-hospital", protect, assignIncidentToHospitalByAdmin);
router.get("/admin-analytics", protect, getAdminAnalytics);
router.get("/admin-settings", protect, getAdminSettings);
router.patch("/admin-settings", protect, updateAdminSettings);
router.patch("/admin-popup-alerts/:id/read", protect, markAdminPopupNotificationRead);
router.get("/hospital-dashboard", protect, getHospitalDashboard);
router.get("/hospital-notifications", protect, getHospitalNotifications);
router.get("/hospital-ambulance-drivers", protect, getHospitalAmbulanceDrivers);
router.put("/hospital-ambulance-drivers", protect, saveHospitalAmbulanceDrivers);
router.patch("/hospital-notifications/:id/read", protect, markHospitalNotificationRead);
router.patch("/hospital-profile", protect, updateHospitalProfile);
router.patch("/hospital-incidents/:id/claim", protect, claimHospitalIncident);
router.patch("/hospital-incidents/:id/accept", protect, acceptHospitalIncident);
router.patch("/hospital-incidents/:id/assign-driver", protect, assignHospitalIncidentDriver);
router.patch("/hospital-incidents/:id/status", protect, updateHospitalIncidentStatus);
router.patch("/alerts/:id/status", protect, updateIncidentAlertStatus);

module.exports = router;
