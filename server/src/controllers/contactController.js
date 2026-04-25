const EmergencyContact = require("../models/EmergencyContact");
const ContactAlertLog = require("../models/ContactAlertLog");
const IncidentAlert = require("../models/IncidentAlert");
const AdminSettings = require("../models/AdminSettings");
const HospitalProfile = require("../models/HospitalProfile");
const HospitalNotification = require("../models/HospitalNotification");
const AmbulanceDriver = require("../models/AmbulanceDriver");
const AdminPopupNotification = require("../models/AdminPopupNotification");
const User = require("../models/user");
const { sendSms } = require("../services/smsService");
const { findNearestHospitalsFromMap } = require("../services/openStreetMapService");
const {
  emitRealtimeEvent,
  registerRealtimeClient,
} = require("../services/realtimeService");

const buildLocationDetails = (incidentLocation = {}) => {
  const latitude = Number(incidentLocation.latitude);
  const longitude = Number(incidentLocation.longitude);
  const hasCoordinates =
    Number.isFinite(latitude) && Number.isFinite(longitude);
  const address = (incidentLocation.address || "").trim();
  const mapUrl = hasCoordinates
    ? `https://www.google.com/maps?q=${latitude},${longitude}`
    : "";

  return {
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    address,
    mapUrl,
  };
};

const formatNearestHospitalsForMessage = (nearestHospitals = []) =>
  nearestHospitals
    .slice(0, 3)
    .map((hospital, index) => {
      const details = [
        hospital.distanceKm ? `${hospital.distanceKm} km away` : "",
        hospital.address || "",
        `Beds ${hospital.freeBeds || 0}/${hospital.totalBeds || 0}`,
        `ICU ${hospital.icuFree || 0}`,
        `ETA ${hospital.ambulanceEtaMinutes || 0} min`,
      ].filter(Boolean);

      return `Nearest hospital ${index + 1}: ${hospital.hospitalName || "Hospital"} - ${details.join(", ")}`;
    });

const buildAlertMessage = ({
  baseMessage,
  incidentLocation,
  nearestHospitals = [],
}) => {
  const messageParts = [baseMessage.trim()];

  if (incidentLocation.address) {
    messageParts.push(`Location: ${incidentLocation.address}`);
  }

  if (
    incidentLocation.latitude !== null &&
    incidentLocation.longitude !== null
  ) {
    messageParts.push(
      `Coordinates: ${incidentLocation.latitude}, ${incidentLocation.longitude}`
    );
  }

  if (incidentLocation.mapUrl) {
    messageParts.push(`Map: ${incidentLocation.mapUrl}`);
  }

  const nearestHospitalLines = formatNearestHospitalsForMessage(nearestHospitals);
  if (nearestHospitalLines.length) {
    messageParts.push("Nearest hospitals:");
    messageParts.push(...nearestHospitalLines);
  }

  return messageParts.join("\n");
};

const buildSmsAlertMessage = ({
  incidentLocation,
  nearestHospitals = [],
}) => {
  const messageParts = ["Prana Raksha: accident detected."];

  if (incidentLocation.address) {
    messageParts.push(`Location: ${incidentLocation.address}`);
  }

  if (incidentLocation.mapUrl) {
    messageParts.push(`Map: ${incidentLocation.mapUrl}`);
  } else if (
    incidentLocation.latitude !== null &&
    incidentLocation.longitude !== null
  ) {
    messageParts.push(
      `Map: https://www.google.com/maps?q=${incidentLocation.latitude},${incidentLocation.longitude}`
    );
  }

  if (nearestHospitals.length) {
    const nearestHospital = nearestHospitals[0];
    const hospitalSummary = [
      nearestHospital.hospitalName || "Nearby hospital",
      nearestHospital.distanceKm ? `${nearestHospital.distanceKm} km` : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (hospitalSummary) {
      messageParts.push(`Nearest: ${hospitalSummary}`);
    }
  }

  return messageParts
    .join(" | ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 155);
};

const formatAlertCode = () => `AL-${Date.now()}`;

const formatDashboardAlert = (alert) => ({
  id: alert._id,
  code: alert.alertCode,
  title: alert.title,
  location: alert.location?.address || "Location unavailable",
  status: alert.status,
  time: new Date(alert.createdAt).toLocaleString(),
  hospital: alert.hospital || "Awaiting assignment",
  hospitalAccepted: Boolean(alert.hospitalAccepted),
  hospitalAcceptedAt: alert.hospitalAcceptedAt || null,
  ambulanceAssignment: alert.ambulanceAssignment?.driverId
    ? {
        driverId:
          alert.ambulanceAssignment.driverId?._id?.toString?.() ||
          alert.ambulanceAssignment.driverId?.toString?.() ||
          "",
        name: alert.ambulanceAssignment.name || "",
        phone: alert.ambulanceAssignment.phone || "",
        vehicleNumber: alert.ambulanceAssignment.vehicleNumber || "",
        assignedAt: alert.ambulanceAssignment.assignedAt || null,
      }
    : null,
  resolvedAt: alert.resolvedAt || null,
  createdAt: alert.createdAt,
});

const formatAdminDashboardAlert = (alert) => ({
  ...formatDashboardAlert(alert),
  userName: alert.userId?.name || "Unknown user",
  userEmail: alert.userId?.email || "",
  userPhone: alert.userId?.phone || "",
  userRole: alert.userId?.role || "user",
  message: alert.message || "",
  totalContacts: alert.totalContacts || 0,
  sentContacts: alert.sentContacts || 0,
  failedContacts: alert.failedContacts || 0,
  mapUrl: alert.location?.mapUrl || "",
  latitude: alert.location?.latitude ?? null,
  longitude: alert.location?.longitude ?? null,
  hospitalAccepted: Boolean(alert.hospitalAccepted),
  hospitalAcceptedAt: alert.hospitalAcceptedAt || null,
  ambulanceAssignment: alert.ambulanceAssignment?.driverId
    ? {
        driverId:
          alert.ambulanceAssignment.driverId?._id?.toString?.() ||
          alert.ambulanceAssignment.driverId?.toString?.() ||
          "",
        name: alert.ambulanceAssignment.name || "",
        phone: alert.ambulanceAssignment.phone || "",
        vehicleNumber: alert.ambulanceAssignment.vehicleNumber || "",
        assignedAt: alert.ambulanceAssignment.assignedAt || null,
      }
    : null,
});

const formatHospitalIncident = (alert) => ({
  ...formatAdminDashboardAlert(alert),
  id: alert._id,
  hospitalAccepted: Boolean(alert.hospitalAccepted),
  hospitalAcceptedAt: alert.hospitalAcceptedAt || null,
  ambulanceAssignment: alert.ambulanceAssignment?.driverId
    ? {
        driverId:
          alert.ambulanceAssignment.driverId?._id?.toString?.() ||
          alert.ambulanceAssignment.driverId?.toString?.() ||
          "",
        name: alert.ambulanceAssignment.name || "",
        phone: alert.ambulanceAssignment.phone || "",
        vehicleNumber: alert.ambulanceAssignment.vehicleNumber || "",
        assignedAt: alert.ambulanceAssignment.assignedAt || null,
      }
    : null,
});

const formatAmbulanceDriver = (driver) => ({
  id: driver._id,
  name: driver.name,
  phone: driver.phone || "",
  vehicleNumber: driver.vehicleNumber || "",
  status: driver.status,
  hospitalName: driver.hospitalName || "",
  createdAt: driver.createdAt,
  updatedAt: driver.updatedAt,
});

const formatHospitalNotification = (notification) => ({
  id: notification._id,
  incidentId:
    notification.incidentId?._id?.toString?.() ||
    notification.incidentId?.toString?.() ||
    "",
  alertCode: notification.alertCode || "",
  title: notification.title,
  message: notification.message || "",
  location: notification.location || "Location unavailable",
  latitude: notification.latitude ?? null,
  longitude: notification.longitude ?? null,
  mapUrl: notification.mapUrl || "",
  hospitalName: notification.hospitalName || "",
  hospitalDetails: notification.hospitalDetails
    ? {
        hospitalName: notification.hospitalDetails.hospitalName || "",
        address: notification.hospitalDetails.address || "",
        distanceKm: notification.hospitalDetails.distanceKm || 0,
        freeBeds: notification.hospitalDetails.freeBeds || 0,
        totalBeds: notification.hospitalDetails.totalBeds || 0,
        icuFree: notification.hospitalDetails.icuFree || 0,
        ambulanceEtaMinutes: notification.hospitalDetails.ambulanceEtaMinutes || 0,
        occupiedPercent: notification.hospitalDetails.occupiedPercent || 0,
        source: notification.hospitalDetails.source || "",
        isConnected: Boolean(notification.hospitalDetails.isConnected),
      }
    : null,
  userName: notification.userName || "",
  userEmail: notification.userEmail || "",
  userPhone: notification.userPhone || "",
  status: notification.status,
  isRead: Boolean(notification.isRead),
  createdAt: notification.createdAt,
  readAt: notification.readAt,
});

const formatAdminPopupNotification = (notification) => ({
  id: notification._id,
  incidentId:
    notification.incidentId?._id?.toString?.() ||
    notification.incidentId?.toString?.() ||
    "",
  code: notification.alertCode,
  title: notification.title,
  location: notification.location || "Location unavailable",
  status: notification.status,
  hospital: notification.hospital || "Awaiting assignment",
  userName: notification.userName || "Unknown user",
  userEmail: notification.userEmail || "",
  userPhone: notification.userPhone || "",
  message: notification.message || "",
  mapUrl: notification.mapUrl || "",
  nearestHospitals: Array.isArray(notification.nearestHospitals)
    ? notification.nearestHospitals.map((hospital) => ({
        hospitalName: hospital.hospitalName || "Hospital",
        address: hospital.address || "",
        distanceKm: hospital.distanceKm || 0,
        freeBeds: hospital.freeBeds || 0,
        totalBeds: hospital.totalBeds || 0,
        icuFree: hospital.icuFree || 0,
        ambulanceEtaMinutes: hospital.ambulanceEtaMinutes || 0,
        occupiedPercent: hospital.occupiedPercent || 0,
        source: hospital.source || "",
        isConnected: Boolean(hospital.isConnected),
      }))
    : [],
  triggerType: notification.triggerType || "incident-created",
  sentToHospitalDashboard: Boolean(notification.sentToHospitalDashboard),
  sentToHospitalAt: notification.sentToHospitalAt,
  assignedHospitalName: notification.assignedHospitalName || "",
  isRead: Boolean(notification.isRead),
  createdAt: notification.createdAt,
  readAt: notification.readAt,
});

const buildRealtimeTargetsForIncident = (incident, extraRoles = []) => {
  const roles = ["admin", "hospital", ...extraRoles];
  const uniqueRoles = [...new Set(roles)];
  const userIds = [incident.userId].filter(Boolean).map((value) => value.toString());

  return {
    roles: uniqueRoles,
    userIds,
  };
};

const emitIncidentRealtimeUpdate = (incident, reason) => {
  emitRealtimeEvent(
    {
      type: "incident-updated",
      reason,
      incidentId: incident._id?.toString?.() || "",
    },
    buildRealtimeTargetsForIncident(incident)
  );
};

const toFiniteCoordinate = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const toRadians = (value) => (value * Math.PI) / 180;

const normalizeHospitalName = (value = "") =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const calculateDistanceKm = (from, to) => {
  const fromLat = toFiniteCoordinate(from?.latitude);
  const fromLng = toFiniteCoordinate(from?.longitude);
  const toLat = toFiniteCoordinate(to?.latitude);
  const toLng = toFiniteCoordinate(to?.longitude);

  if ([fromLat, fromLng, toLat, toLng].some((value) => value === null)) {
    return null;
  }

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(fromLat)) *
      Math.cos(toRadians(toLat)) *
      Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Number((earthRadiusKm * c).toFixed(1));
};

const resolveNearestHospitalsForIncident = async ({
  latitude,
  longitude,
  limit = 3,
}) => {
  const incidentCoordinates = { latitude, longitude };
  const connectedHospitalProfiles = await HospitalProfile.find({})
    .select(
      "hospitalName address latitude longitude distanceKm freeBeds totalBeds icuFree ambulanceEtaMinutes occupiedPercent updatedAt"
    )
    .lean();
  const connectedHospitalProfilesByName = new Map(
    connectedHospitalProfiles
      .map((profile) => [normalizeHospitalName(profile.hospitalName), profile])
      .filter(([name]) => Boolean(name))
  );
  const connectedHospitalNames = new Set(connectedHospitalProfilesByName.keys());
  const connectedNearestHospitals = connectedHospitalProfiles
    .map((profile) => {
      const mapDistanceKm = calculateDistanceKm(incidentCoordinates, {
        latitude: profile.latitude,
        longitude: profile.longitude,
      });

      return {
        hospitalName: profile.hospitalName || "Hospital",
        address: profile.address || "",
        distanceKm:
          mapDistanceKm !== null ? mapDistanceKm : Number(profile.distanceKm) || 0,
        freeBeds: profile.freeBeds || 0,
        totalBeds: profile.totalBeds || 0,
        icuFree: profile.icuFree || 0,
        ambulanceEtaMinutes: profile.ambulanceEtaMinutes || 0,
        occupiedPercent: profile.occupiedPercent || 0,
        hasCoordinates:
          toFiniteCoordinate(profile.latitude) !== null &&
          toFiniteCoordinate(profile.longitude) !== null,
        updatedAt: profile.updatedAt,
        source: "Hospital Database",
        isConnected: true,
      };
    })
    .filter((hospital) => Number.isFinite(hospital.distanceKm))
    .sort((first, second) => {
      if (first.distanceKm !== second.distanceKm) {
        return first.distanceKm - second.distanceKm;
      }

      if (first.freeBeds !== second.freeBeds) {
        return second.freeBeds - first.freeBeds;
      }

      return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
    })
    .map(({ hasCoordinates, updatedAt, ...hospital }) => hospital);

  let nearestHospitals = [];

  try {
    nearestHospitals = await findNearestHospitalsFromMap({
      latitude: incidentCoordinates.latitude,
      longitude: incidentCoordinates.longitude,
      limit,
    });
  } catch {
    nearestHospitals = [];
  }

  const mapHospitals = nearestHospitals.map((hospital) => {
    const normalizedName = normalizeHospitalName(hospital.hospitalName);
    const matchedProfile = connectedHospitalProfilesByName.get(normalizedName);

    if (!matchedProfile) {
      return {
        ...hospital,
        isConnected: false,
      };
    }

    return {
      ...hospital,
      address: hospital.address || matchedProfile.address || "",
      freeBeds: matchedProfile.freeBeds || 0,
      totalBeds: matchedProfile.totalBeds || 0,
      icuFree: matchedProfile.icuFree || 0,
      ambulanceEtaMinutes: matchedProfile.ambulanceEtaMinutes || 0,
      occupiedPercent: matchedProfile.occupiedPercent || 0,
      source: "Hospital Database",
      isConnected: true,
    };
  });

  const combinedHospitals = mapHospitals.length
    ? mapHospitals.slice(0, limit)
    : connectedNearestHospitals.slice(0, limit);

  return combinedHospitals.map((hospital) => ({
    ...hospital,
    isConnected: connectedHospitalNames.has(
      normalizeHospitalName(hospital.hospitalName)
    ) || Boolean(hospital.isConnected),
  }));
};

const createAdminPopupNotification = async ({
  incident,
  user,
  triggerType,
  nearestHospitals = [],
}) => {
  const notification = await AdminPopupNotification.create({
    incidentId: incident._id,
    userId: user._id,
    alertCode: incident.alertCode,
    title: incident.title,
    location: incident.location?.address || "Location unavailable",
    status: incident.status,
    hospital: incident.hospital || "Awaiting assignment",
    userName: user.name || "Unknown user",
    userEmail: user.email || "",
    userPhone: user.phone || "",
    message: incident.message || "",
    mapUrl: incident.location?.mapUrl || "",
    nearestHospitals,
    triggerType,
  });

  emitRealtimeEvent(
    {
      type: "admin-popup-created",
      reason: triggerType,
      notificationId: notification._id.toString(),
      incidentId: incident._id.toString(),
      notification: formatAdminPopupNotification(notification),
    },
    {
      roles: ["admin"],
    }
  );

  return notification;
};

const getStartOfDay = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getAnalyticsDayKey = (date) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const ensureAdminSettings = async () => {
  let settings = await AdminSettings.findOne({ key: "global" });

  if (!settings) {
    settings = await AdminSettings.create({ key: "global" });
  }

  return settings;
};

const serializeAdminSettings = (settings) => ({
  platformName: settings.platformName,
  controlRoomEmail: settings.controlRoomEmail,
  controlRoomPhone: settings.controlRoomPhone,
  defaultHospitalLabel: settings.defaultHospitalLabel,
  autoRefreshSeconds: settings.autoRefreshSeconds,
  analyticsWindowDays: settings.analyticsWindowDays,
  allowUserRegistration: settings.allowUserRegistration,
  maintenanceMode: settings.maintenanceMode,
  smsAlertsEnabled: settings.smsAlertsEnabled,
  emailAlertsEnabled: settings.emailAlertsEnabled,
  incidentAutoAssignment: settings.incidentAutoAssignment,
  adminNotes: settings.adminNotes,
  updatedAt: settings.updatedAt,
});

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }

  const text = value instanceof Date ? value.toISOString() : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const buildCsvRow = (values) => values.map(escapeCsvValue).join(",");

const serializeHospitalProfile = (profile) => ({
  id: profile._id,
  hospitalName: profile.hospitalName,
  address: profile.address,
  latitude: profile.latitude,
  longitude: profile.longitude,
  distanceKm: profile.distanceKm,
  freeBeds: profile.freeBeds,
  totalBeds: profile.totalBeds,
  icuFree: profile.icuFree,
  occupiedPercent: profile.occupiedPercent,
  ambulanceEtaMinutes: profile.ambulanceEtaMinutes,
  bedAvailability: profile.bedAvailability.map((item) => ({
    id: item._id,
    unit: item.unit,
    available: item.available,
    total: item.total,
  })),
  staff: profile.staff.map((member) => ({
    id: member._id,
    name: member.name,
    department: member.department,
    initials: member.initials,
    shiftStatus: member.shiftStatus,
  })),
  updatedAt: profile.updatedAt,
});

const ensureHospitalProfile = async (user) => {
  const hospitalName = (user.primaryHospital || user.name || "Hospital").trim();
  let profile = await HospitalProfile.findOne({ userId: user._id });

  if (!profile) {
    profile = await HospitalProfile.create({
      userId: user._id,
      hospitalName,
      address: "",
      latitude: null,
      longitude: null,
      distanceKm: 0,
      freeBeds: 0,
      totalBeds: 0,
      icuFree: 0,
      occupiedPercent: 0,
      bedAvailability: [
        { unit: "General", available: 0, total: 0 },
        { unit: "ICU", available: 0, total: 0 },
        { unit: "Trauma", available: 0, total: 0 },
        { unit: "Cardiac", available: 0, total: 0 },
      ],
      staff: [],
      ambulanceEtaMinutes: 0,
    });
  }

  if (profile.hospitalName !== hospitalName && hospitalName) {
    profile.hospitalName = hospitalName;
    await profile.save();
  }

  return profile;
};

const createEmergencyIncidentAndNotify = async ({
  user,
  message,
  incidentLocation,
  title = "Emergency Alert Sent",
  triggerType = "incident-created",
  requireContacts = true,
}) => {
  if (!message) {
    const error = new Error("Alert message is required");
    error.statusCode = 400;
    throw error;
  }

  const adminSettings = await ensureAdminSettings();

  if (!adminSettings.smsAlertsEnabled) {
    const error = new Error("SMS alerts are disabled by admin settings");
    error.statusCode = 403;
    throw error;
  }

  const locationDetails = buildLocationDetails(incidentLocation);
  const nearestHospitals = await resolveNearestHospitalsForIncident({
    latitude: locationDetails.latitude,
    longitude: locationDetails.longitude,
    limit: 5,
  });
  const finalMessage = buildAlertMessage({
    baseMessage: message,
    incidentLocation: locationDetails,
    nearestHospitals,
  });
  const smsMessage = buildSmsAlertMessage({
    incidentLocation: locationDetails,
    nearestHospitals,
  });

  const contacts = await EmergencyContact.find({
    userId: user._id,
    isActive: true,
  });
  const smsContacts = contacts.filter(
    (contact) => contact.channels?.sms !== false && String(contact.phoneNumber || "").trim()
  );

  if (!smsContacts.length && requireContacts) {
    const error = new Error("No active SMS contacts found");
    error.statusCode = 404;
    throw error;
  }

  const results = [];
  let sentContacts = 0;
  let failedContacts = 0;

  for (const contact of smsContacts) {
    try {
      const providerResult = await sendSms({
        to: contact.phoneNumber,
        body: smsMessage,
      });

      contact.lastAlertAt = new Date();
      await contact.save();

      await ContactAlertLog.create({
        userId: user._id,
        contactId: contact._id,
        fullName: contact.fullName,
        phoneNumber: contact.phoneNumber,
        channel: "sms",
        message: smsMessage,
        status: "sent",
        providerResponse: providerResult.sid || "sent",
        incidentLocation: locationDetails,
      });

      results.push({
        contact: contact.fullName,
        phoneNumber: contact.phoneNumber,
        status: "sent",
      });
      sentContacts += 1;
    } catch (error) {
      await ContactAlertLog.create({
        userId: user._id,
        contactId: contact._id,
        fullName: contact.fullName,
        phoneNumber: contact.phoneNumber,
        channel: "sms",
        message: smsMessage,
        status: "failed",
        providerResponse: error.message,
        incidentLocation: locationDetails,
      });

      results.push({
        contact: contact.fullName,
        phoneNumber: contact.phoneNumber,
        status: "failed",
        error: error.message,
      });
      failedContacts += 1;
    }
  }

  const incidentAlert = await IncidentAlert.create({
    userId: user._id,
    alertCode: formatAlertCode(),
    title,
    location: {
      address: locationDetails.address,
      latitude: locationDetails.latitude,
      longitude: locationDetails.longitude,
      mapUrl: locationDetails.mapUrl,
    },
    status: sentContacts > 0 || !smsContacts.length ? "active" : "pending",
    hospital: adminSettings.defaultHospitalLabel || "Awaiting assignment",
    message: finalMessage,
    totalContacts: smsContacts.length,
    sentContacts,
    failedContacts,
    lastSentAt: new Date(),
  });

  const adminNotification = await createAdminPopupNotification({
    incident: incidentAlert,
    user,
    triggerType,
    nearestHospitals,
  });

  emitIncidentRealtimeUpdate(incidentAlert, "created");

  return {
    alertMessage: finalMessage,
    incidentLocation: locationDetails,
    incidentAlert,
    adminNotification,
    results,
  };
};

const getMyContacts = async (req, res) => {
  try {
    const contacts = await EmergencyContact.find({ userId: req.user._id }).sort({
      createdAt: -1,
    });

    return res.status(200).json(contacts);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const streamRealtimeEvents = async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write(
    `data: ${JSON.stringify({
      type: "connected",
      role: req.user.role,
      userId: req.user._id,
      timestamp: new Date().toISOString(),
    })}\n\n`
  );

  const unregister = registerRealtimeClient({
    userId: req.user._id,
    role: req.user.role,
    res,
  });

  req.on("close", unregister);
};

const addContact = async (req, res) => {
  try {
    const {
      fullName,
      relationship,
      city,
      phoneNumber,
      priority,
      channels,
      note,
      isPrimary,
    } = req.body;

    if (!fullName || !phoneNumber) {
      return res
        .status(400)
        .json({ message: "Full name and phone number are required" });
    }

    const contact = await EmergencyContact.create({
      userId: req.user._id,
      fullName,
      relationship,
      city,
      phoneNumber,
      priority: priority || "P2",
      channels: {
        sms: channels?.sms ?? true,
        whatsapp: channels?.whatsapp ?? false,
        call: channels?.call ?? false,
        push: channels?.push ?? false,
      },
      note: note || "",
      isPrimary: isPrimary || false,
    });

    return res.status(201).json({
      message: "Contact added successfully",
      contact,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const deleteContact = async (req, res) => {
  try {
    const contact = await EmergencyContact.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    await EmergencyContact.deleteOne({ _id: contact._id });

    return res.status(200).json({ message: "Contact deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const alertAllContacts = async (req, res) => {
  try {
    const { message, incidentLocation } = req.body;

    const alertResult = await createEmergencyIncidentAndNotify({
      user: req.user,
      message,
      incidentLocation,
      title: "Emergency Alert Sent",
      triggerType: "incident-created",
      requireContacts: true,
    });

    return res.status(200).json({
      message: "Alert process completed",
      ...alertResult,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getAlertHistory = async (req, res) => {
  try {
    const logs = await ContactAlertLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json(logs);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getDashboardAlerts = async (req, res) => {
  try {
    const alerts = await IncidentAlert.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const stats = {
      totalAlerts: await IncidentAlert.countDocuments({ userId: req.user._id }),
      activeAlerts: await IncidentAlert.countDocuments({
        userId: req.user._id,
        status: "active",
      }),
      resolvedAlerts: await IncidentAlert.countDocuments({
        userId: req.user._id,
        status: "resolved",
      }),
    };

    return res.status(200).json({
      stats,
      alerts: alerts.map(formatDashboardAlert),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAdminDashboardAlerts = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const alerts = await IncidentAlert.find({})
      .populate("userId", "name email phone role")
      .sort({ createdAt: -1 })
      .limit(20);

    const stats = {
      totalAlerts: await IncidentAlert.countDocuments({}),
      activeAlerts: await IncidentAlert.countDocuments({
        status: "active",
      }),
      resolvedAlerts: await IncidentAlert.countDocuments({
        status: "resolved",
      }),
    };

    return res.status(200).json({
      stats,
      alerts: alerts.map(formatAdminDashboardAlert),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAdminPopupNotifications = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const notifications = await AdminPopupNotification.find({})
      .sort({ createdAt: -1 })
      .limit(150);

    const unreadCount = await AdminPopupNotification.countDocuments({
      isRead: false,
    });

    return res.status(200).json({
      unreadCount,
      notifications: notifications.map(formatAdminPopupNotification),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAdminIncidents = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const incidents = await IncidentAlert.find({})
      .populate("userId", "name email phone role")
      .sort({ createdAt: -1 })
      .limit(200);

    return res.status(200).json({
      incidents: incidents.map(formatAdminDashboardAlert),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAdminHospitals = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const hospitalProfiles = await HospitalProfile.find({})
      .populate("userId", "name email phone profileStatus")
      .sort({ updatedAt: -1 });

    const hospitalNames = hospitalProfiles
      .map((profile) => profile.hospitalName)
      .filter(Boolean);

    const incidentCounts = hospitalNames.length
      ? await IncidentAlert.aggregate([
          {
            $match: {
              hospital: { $in: hospitalNames },
            },
          },
          {
            $group: {
              _id: "$hospital",
              totalIncidents: { $sum: 1 },
              activeIncidents: {
                $sum: {
                  $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                },
              },
              resolvedIncidents: {
                $sum: {
                  $cond: [{ $eq: ["$status", "resolved"] }, 1, 0],
                },
              },
            },
          },
        ])
      : [];

    const countsByHospital = new Map(
      incidentCounts.map((item) => [item._id, item])
    );

    return res.status(200).json({
      hospitals: hospitalProfiles.map((profile) => {
        const counts = countsByHospital.get(profile.hospitalName) || {};

        return {
          ...serializeHospitalProfile(profile),
          isConnected: true,
          userName: profile.userId?.name || "",
          userEmail: profile.userId?.email || "",
          userPhone: profile.userId?.phone || "",
          profileStatus: profile.userId?.profileStatus || "Active",
          totalIncidents: counts.totalIncidents || 0,
          activeIncidents: counts.activeIncidents || 0,
          resolvedIncidents: counts.resolvedIncidents || 0,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAdminUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const users = await User.find({ role: "user" })
      .select("name email phone primaryHospital locationSharing alertMethod profileStatus createdAt updatedAt")
      .sort({ createdAt: -1 });

    const userIds = users.map((user) => user._id);
    const [incidentCounts, contactCounts] = userIds.length
      ? await Promise.all([
          IncidentAlert.aggregate([
            {
              $match: {
                userId: { $in: userIds },
              },
            },
            {
              $group: {
                _id: "$userId",
                totalIncidents: { $sum: 1 },
                activeIncidents: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                  },
                },
                resolvedIncidents: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "resolved"] }, 1, 0],
                  },
                },
                lastIncidentAt: { $max: "$createdAt" },
              },
            },
          ]),
          EmergencyContact.aggregate([
            {
              $match: {
                userId: { $in: userIds },
              },
            },
            {
              $group: {
                _id: "$userId",
                emergencyContacts: { $sum: 1 },
                activeContacts: {
                  $sum: {
                    $cond: [{ $eq: ["$isActive", true] }, 1, 0],
                  },
                },
              },
            },
          ]),
        ])
      : [[], []];

    const incidentCountsByUser = new Map(
      incidentCounts.map((item) => [item._id.toString(), item])
    );
    const contactCountsByUser = new Map(
      contactCounts.map((item) => [item._id.toString(), item])
    );

    return res.status(200).json({
      users: users.map((user) => {
        const userId = user._id.toString();
        const incidents = incidentCountsByUser.get(userId) || {};
        const contacts = contactCountsByUser.get(userId) || {};

        return {
          id: userId,
          name: user.name,
          email: user.email,
          phone: user.phone || "",
          primaryHospital: user.primaryHospital || "",
          locationSharing: Boolean(user.locationSharing),
          alertMethod: user.alertMethod || "SMS + Push",
          profileStatus: user.profileStatus || "Active",
          totalIncidents: incidents.totalIncidents || 0,
          activeIncidents: incidents.activeIncidents || 0,
          resolvedIncidents: incidents.resolvedIncidents || 0,
          lastIncidentAt: incidents.lastIncidentAt || null,
          emergencyContacts: contacts.emergencyContacts || 0,
          activeContacts: contacts.activeContacts || 0,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        };
      }),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const exportAdminReport = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const [incidents, hospitalProfiles, users, settings] = await Promise.all([
      IncidentAlert.find({})
        .populate("userId", "name email phone role")
        .sort({ createdAt: -1 })
        .limit(500),
      HospitalProfile.find({})
        .populate("userId", "name email phone profileStatus")
        .sort({ updatedAt: -1 }),
      User.find({ role: "user" })
        .select("name email phone primaryHospital locationSharing alertMethod profileStatus createdAt")
        .sort({ createdAt: -1 }),
      ensureAdminSettings(),
    ]);

    const rows = [
      ["Prana Raksha Admin Report"],
      ["Generated At", new Date()],
      ["Platform", settings.platformName || "Prana Raksha"],
      [],
      ["Summary"],
      ["Total Incidents", incidents.length],
      ["Active Incidents", incidents.filter((incident) => incident.status === "active").length],
      ["Pending Incidents", incidents.filter((incident) => incident.status === "pending").length],
      ["Resolved Incidents", incidents.filter((incident) => incident.status === "resolved").length],
      ["Connected Hospitals", hospitalProfiles.length],
      ["Registered Users", users.length],
      [],
      ["Incidents"],
      [
        "Alert Code",
        "Title",
        "Status",
        "Hospital",
        "Location",
        "User Name",
        "User Email",
        "User Phone",
        "Created At",
        "Resolved At",
      ],
      ...incidents.map((incident) => [
        incident.alertCode,
        incident.title,
        incident.status,
        incident.hospital,
        incident.location?.address || "",
        incident.userId?.name || "",
        incident.userId?.email || "",
        incident.userId?.phone || "",
        incident.createdAt,
        incident.resolvedAt || "",
      ]),
      [],
      ["Connected Hospitals"],
      [
        "Hospital Name",
        "Address",
        "Admin Name",
        "Admin Email",
        "Phone",
        "Free Beds",
        "Total Beds",
        "ICU Free",
        "Ambulance ETA Minutes",
        "Updated At",
      ],
      ...hospitalProfiles.map((profile) => [
        profile.hospitalName,
        profile.address,
        profile.userId?.name || "",
        profile.userId?.email || "",
        profile.userId?.phone || "",
        profile.freeBeds,
        profile.totalBeds,
        profile.icuFree,
        profile.ambulanceEtaMinutes,
        profile.updatedAt,
      ]),
      [],
      ["Registered Users"],
      [
        "Name",
        "Email",
        "Phone",
        "Preferred Hospital",
        "Location Sharing",
        "Alert Method",
        "Profile Status",
        "Joined At",
      ],
      ...users.map((user) => [
        user.name,
        user.email,
        user.phone || "",
        user.primaryHospital || "",
        user.locationSharing ? "On" : "Off",
        user.alertMethod,
        user.profileStatus,
        user.createdAt,
      ]),
    ];

    const csv = rows.map(buildCsvRow).join("\n");
    const timestamp = new Date().toISOString().slice(0, 10);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="prana-raksha-admin-report-${timestamp}.csv"`
    );

    return res.status(200).send(csv);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const assignIncidentToHospitalByAdmin = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const requestedHospitalName = String(req.body.hospitalName || "").trim();

    if (!requestedHospitalName) {
      return res.status(400).json({ message: "Hospital name is required" });
    }

    const normalizedRequestedName = normalizeHospitalName(requestedHospitalName);
    const connectedProfiles = await HospitalProfile.find({}).lean();
    const matchedHospital = connectedProfiles.find(
      (profile) =>
        normalizeHospitalName(profile.hospitalName) === normalizedRequestedName
    );

    if (!matchedHospital) {
      return res.status(404).json({ message: "Connected hospital not found" });
    }

    const incident = await IncidentAlert.findById(req.params.id).populate(
      "userId",
      "name email phone role"
    );

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    if (incident.hospital && incident.hospital !== "Awaiting assignment") {
      return res.status(409).json({
        message: `Incident already sent to ${incident.hospital}`,
      });
    }

    const popupNotification = await AdminPopupNotification.findOne({
      incidentId: incident._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    const selectedNearestHospital = (popupNotification?.nearestHospitals || []).find(
      (hospital) =>
        normalizeHospitalName(hospital.hospitalName) === normalizedRequestedName
    );

    if (popupNotification?.nearestHospitals?.length && !selectedNearestHospital) {
      return res.status(400).json({
        message: "Selected hospital is not available in the nearest connected hospital list",
      });
    }

    if (selectedNearestHospital && !selectedNearestHospital.isConnected) {
      return res.status(400).json({
        message: "Only connected hospitals can receive admin alerts",
      });
    }
    const calculatedDistanceKm = calculateDistanceKm(
      {
        latitude: incident.location?.latitude,
        longitude: incident.location?.longitude,
      },
      {
        latitude: matchedHospital.latitude,
        longitude: matchedHospital.longitude,
      }
    );
    const profileDistanceKm = Number(matchedHospital.distanceKm);

    const hospitalDetails = {
      hospitalName:
        selectedNearestHospital?.hospitalName ||
        matchedHospital.hospitalName ||
        requestedHospitalName,
      address: selectedNearestHospital?.address || matchedHospital.address || "",
      distanceKm:
        selectedNearestHospital?.distanceKm ??
        calculatedDistanceKm ??
        (Number.isFinite(profileDistanceKm) ? profileDistanceKm : 0) ??
        0,
      freeBeds: selectedNearestHospital?.freeBeds ?? matchedHospital.freeBeds ?? 0,
      totalBeds: selectedNearestHospital?.totalBeds ?? matchedHospital.totalBeds ?? 0,
      icuFree: selectedNearestHospital?.icuFree ?? matchedHospital.icuFree ?? 0,
      ambulanceEtaMinutes:
        selectedNearestHospital?.ambulanceEtaMinutes ??
        matchedHospital.ambulanceEtaMinutes ??
        0,
      occupiedPercent:
        selectedNearestHospital?.occupiedPercent ??
        matchedHospital.occupiedPercent ??
        0,
      source:
        selectedNearestHospital?.source ||
        (selectedNearestHospital ? "Nearest Hospital List" : "Hospital Database"),
      isConnected: true,
    };

    incident.hospital = matchedHospital.hospitalName;
    if (incident.status === "pending") {
      incident.status = "active";
    }
    await incident.save();

    await AdminPopupNotification.updateMany(
      { incidentId: incident._id },
      {
        $set: {
          sentToHospitalDashboard: true,
          sentToHospitalAt: new Date(),
          assignedHospitalName: matchedHospital.hospitalName,
          hospital: matchedHospital.hospitalName,
        },
      }
    );

    const hospitalNotification = await HospitalNotification.create({
      hospitalUserId: matchedHospital.userId,
      incidentId: incident._id,
      title: incident.title,
      message: `Admin forwarded a new incident to ${matchedHospital.hospitalName}.`,
      alertCode: incident.alertCode,
      location: incident.location?.address || "Location unavailable",
      latitude: incident.location?.latitude ?? null,
      longitude: incident.location?.longitude ?? null,
      mapUrl: incident.location?.mapUrl || "",
      hospitalName: matchedHospital.hospitalName,
      hospitalDetails,
      userName: incident.userId?.name || "Unknown user",
      userEmail: incident.userId?.email || "",
      userPhone: incident.userId?.phone || "",
      status: incident.status,
    });

    emitIncidentRealtimeUpdate(incident, "admin-assigned-hospital");
    emitRealtimeEvent(
      {
        type: "hospital-notification-created",
        reason: "admin-assigned-hospital",
        notificationId: hospitalNotification._id.toString(),
        incidentId: incident._id.toString(),
        notification: formatHospitalNotification(hospitalNotification),
      },
      {
        userIds: [matchedHospital.userId.toString()],
      }
    );

    return res.status(200).json({
      message: "Incident sent to hospital dashboard successfully",
      incident: formatAdminDashboardAlert(incident),
      hospitalNotification: formatHospitalNotification(hospitalNotification),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const markAdminPopupNotificationRead = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const notification = await AdminPopupNotification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Popup notification not found" });
    }

    notification.isRead = true;
    notification.readAt = notification.readAt || new Date();
    await notification.save();

    return res.status(200).json({
      message: "Popup marked as read",
      notification: formatAdminPopupNotification(notification),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAdminAnalytics = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const adminSettings = await ensureAdminSettings();
    const analyticsWindowDays = adminSettings.analyticsWindowDays || 7;

    const incidents = await IncidentAlert.find({})
      .populate("userId", "name email phone role")
      .sort({ createdAt: -1 });

    const now = new Date();
    const startOfToday = getStartOfDay(now);
    const sevenDaysAgo = getStartOfDay(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - (analyticsWindowDays - 1))
    );

    const statusBreakdown = {
      active: 0,
      pending: 0,
      resolved: 0,
    };

    const deliveryTotals = {
      totalContacts: 0,
      sentContacts: 0,
      failedContacts: 0,
    };

    const recentTrendMap = new Map();
    const topUsersMap = new Map();
    const topLocationsMap = new Map();

    for (let index = 0; index < analyticsWindowDays; index += 1) {
      const day = new Date(
        sevenDaysAgo.getFullYear(),
        sevenDaysAgo.getMonth(),
        sevenDaysAgo.getDate() + index
      );
      recentTrendMap.set(getAnalyticsDayKey(day), 0);
    }

    let incidentsToday = 0;
    let incidentsThisWeek = 0;
    let resolvedThisWeek = 0;
    let totalResolutionMinutes = 0;
    let resolvedWithTime = 0;

    incidents.forEach((incident) => {
      const createdAt = new Date(incident.createdAt);
      const createdAtMs = createdAt.getTime();
      const isToday = createdAtMs >= startOfToday.getTime();
      const isThisWeek = createdAtMs >= sevenDaysAgo.getTime();

      if (isToday) {
        incidentsToday += 1;
      }

      if (isThisWeek) {
        incidentsThisWeek += 1;
        const trendKey = getAnalyticsDayKey(createdAt);
        recentTrendMap.set(trendKey, (recentTrendMap.get(trendKey) || 0) + 1);
      }

      if (statusBreakdown[incident.status] !== undefined) {
        statusBreakdown[incident.status] += 1;
      }

      deliveryTotals.totalContacts += incident.totalContacts || 0;
      deliveryTotals.sentContacts += incident.sentContacts || 0;
      deliveryTotals.failedContacts += incident.failedContacts || 0;

      const userId = incident.userId?._id?.toString() || "unknown";
      const existingUser = topUsersMap.get(userId) || {
        userId,
        name: incident.userId?.name || "Unknown user",
        email: incident.userId?.email || "",
        totalIncidents: 0,
        activeIncidents: 0,
        resolvedIncidents: 0,
      };

      existingUser.totalIncidents += 1;
      if (incident.status === "active") {
        existingUser.activeIncidents += 1;
      }
      if (incident.status === "resolved") {
        existingUser.resolvedIncidents += 1;
      }
      topUsersMap.set(userId, existingUser);

      const locationKey = incident.location?.address?.trim() || "Location unavailable";
      const existingLocation = topLocationsMap.get(locationKey) || {
        location: locationKey,
        totalIncidents: 0,
      };
      existingLocation.totalIncidents += 1;
      topLocationsMap.set(locationKey, existingLocation);

      if (incident.status === "resolved" && incident.resolvedAt) {
        resolvedThisWeek += isThisWeek ? 1 : 0;
        const resolvedAt = new Date(incident.resolvedAt).getTime();
        const createdAtTime = createdAt.getTime();
        if (!Number.isNaN(resolvedAt) && resolvedAt >= createdAtTime) {
          totalResolutionMinutes += Math.round((resolvedAt - createdAtTime) / 60000);
          resolvedWithTime += 1;
        }
      }
    });

    const totalIncidents = incidents.length;
    const resolutionRate = totalIncidents
      ? Math.round((statusBreakdown.resolved / totalIncidents) * 100)
      : 0;
    const deliverySuccessRate = deliveryTotals.totalContacts
      ? Math.round((deliveryTotals.sentContacts / deliveryTotals.totalContacts) * 100)
      : 0;
    const averageResolutionMinutes = resolvedWithTime
      ? Math.round(totalResolutionMinutes / resolvedWithTime)
      : 0;

    const trend = Array.from(recentTrendMap.entries()).map(([label, total]) => ({
      label,
      total,
    }));

    const topUsers = Array.from(topUsersMap.values())
      .sort((first, second) => second.totalIncidents - first.totalIncidents)
      .slice(0, 5);

    const topLocations = Array.from(topLocationsMap.values())
      .sort((first, second) => second.totalIncidents - first.totalIncidents)
      .slice(0, 5);

    return res.status(200).json({
      summary: {
        totalIncidents,
        incidentsToday,
        incidentsThisWeek,
        activeAlerts: statusBreakdown.active,
        pendingAlerts: statusBreakdown.pending,
        resolvedAlerts: statusBreakdown.resolved,
        resolvedThisWeek,
        resolutionRate,
        averageResolutionMinutes,
        totalContactsReached: deliveryTotals.sentContacts,
        totalContactAttempts: deliveryTotals.totalContacts,
        failedDeliveries: deliveryTotals.failedContacts,
        deliverySuccessRate,
        analyticsWindowDays,
      },
      statusBreakdown,
      trend,
      topUsers,
      topLocations,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getAdminSettings = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const settings = await ensureAdminSettings();

    return res.status(200).json({
      settings: serializeAdminSettings(settings),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getHospitalDashboard = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const hospitalName = (req.user.primaryHospital || req.user.name || "").trim();
    const assignmentLabel = hospitalName || "Awaiting assignment";

    const profile = await ensureHospitalProfile(req.user);

    const incidents = await IncidentAlert.find({
      hospital: assignmentLabel,
    })
      .populate("userId", "name email phone role")
      .sort({ createdAt: -1 })
      .limit(100);

    const assignedToThisHospital = incidents.filter(
      (incident) => incident.hospital === assignmentLabel
    );

    const stats = {
      availableIncidents: 0,
      myActiveIncidents: assignedToThisHospital.filter(
        (incident) => incident.status === "active"
      ).length,
      myResolvedIncidents: assignedToThisHospital.filter(
        (incident) => incident.status === "resolved"
      ).length,
      totalVisibleIncidents: incidents.length,
    };

    return res.status(200).json({
      hospitalName: assignmentLabel,
      stats,
      profile: serializeHospitalProfile(profile),
      incidents: incidents.map(formatHospitalIncident),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getHospitalNotifications = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const notifications = await HospitalNotification.find({
      hospitalUserId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(100);

    const unreadCount = await HospitalNotification.countDocuments({
      hospitalUserId: req.user._id,
      isRead: false,
    });

    return res.status(200).json({
      unreadCount,
      notifications: notifications.map(formatHospitalNotification),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getHospitalAmbulanceDrivers = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const drivers = await AmbulanceDriver.find({
      hospitalUserId: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      drivers: drivers.map(formatAmbulanceDriver),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const saveHospitalAmbulanceDrivers = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const hospitalName = (req.user.primaryHospital || req.user.name || "Hospital").trim();
    const driverPayload = Array.isArray(req.body.drivers) ? req.body.drivers : [];
    const existingDrivers = await AmbulanceDriver.find({ hospitalUserId: req.user._id });
    const existingById = new Map(existingDrivers.map((driver) => [driver._id.toString(), driver]));
    const nextIds = new Set();

    for (const item of driverPayload) {
      const driverId = String(item.id || "").trim();
      const name = String(item.name || "").trim();

      if (!name) {
        continue;
      }

      const normalizedStatus = ["available", "on-trip", "off-duty"].includes(item.status)
        ? item.status
        : "available";

      if (driverId && existingById.has(driverId)) {
        const driver = existingById.get(driverId);
        driver.name = name;
        driver.phone = String(item.phone || "").trim();
        driver.vehicleNumber = String(item.vehicleNumber || "").trim();
        driver.status = normalizedStatus;
        driver.hospitalName = hospitalName;
        await driver.save();
        nextIds.add(driver._id.toString());
        continue;
      }

      const createdDriver = await AmbulanceDriver.create({
        hospitalUserId: req.user._id,
        hospitalName,
        name,
        phone: String(item.phone || "").trim(),
        vehicleNumber: String(item.vehicleNumber || "").trim(),
        status: normalizedStatus,
      });

      nextIds.add(createdDriver._id.toString());
    }

    for (const driver of existingDrivers) {
      if (!nextIds.has(driver._id.toString())) {
        await AmbulanceDriver.deleteOne({ _id: driver._id });
      }
    }

    const drivers = await AmbulanceDriver.find({
      hospitalUserId: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Ambulance drivers updated successfully",
      drivers: drivers.map(formatAmbulanceDriver),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const markHospitalNotificationRead = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const notification = await HospitalNotification.findOne({
      _id: req.params.id,
      hospitalUserId: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.isRead = true;
    notification.readAt = notification.readAt || new Date();
    await notification.save();

    return res.status(200).json({
      message: "Notification marked as read",
      notification: formatHospitalNotification(notification),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateHospitalProfile = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const profile = await ensureHospitalProfile(req.user);

    const nextBedAvailability = Array.isArray(req.body.bedAvailability)
      ? req.body.bedAvailability
          .filter((item) => item && String(item.unit || "").trim())
          .map((item) => ({
            unit: String(item.unit || "").trim(),
            available: Math.max(0, Number(item.available) || 0),
            total: Math.max(0, Number(item.total) || 0),
          }))
      : profile.bedAvailability;

    const nextStaff = Array.isArray(req.body.staff)
      ? req.body.staff
          .filter((member) => member && String(member.name || "").trim())
          .map((member) => ({
            name: String(member.name || "").trim(),
            department: String(member.department || "").trim(),
            initials: String(member.initials || "")
              .trim()
              .slice(0, 4)
              .toUpperCase(),
            shiftStatus: ["On Duty", "On Call", "Off Duty"].includes(member.shiftStatus)
              ? member.shiftStatus
              : "On Duty",
          }))
      : profile.staff;

    profile.address =
      typeof req.body.address === "string" ? req.body.address.trim() : profile.address;
    profile.latitude = toFiniteCoordinate(req.body.latitude);
    profile.longitude = toFiniteCoordinate(req.body.longitude);
    profile.distanceKm = Math.max(0, Number(req.body.distanceKm) || 0);
    profile.freeBeds = Math.max(0, Number(req.body.freeBeds) || 0);
    profile.totalBeds = Math.max(0, Number(req.body.totalBeds) || 0);
    profile.icuFree = Math.max(0, Number(req.body.icuFree) || 0);
    profile.occupiedPercent = Math.min(
      100,
      Math.max(0, Number(req.body.occupiedPercent) || 0)
    );
    profile.ambulanceEtaMinutes = Math.max(0, Number(req.body.ambulanceEtaMinutes) || 0);
    profile.bedAvailability = nextBedAvailability;
    profile.staff = nextStaff;

    await profile.save();

    emitRealtimeEvent(
      {
        type: "hospital-profile-updated",
        reason: "profile-saved",
        hospitalUserId: req.user._id.toString(),
      },
      {
        userIds: [req.user._id.toString()],
      }
    );

    return res.status(200).json({
      message: "Hospital profile updated successfully",
      profile: serializeHospitalProfile(profile),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const claimHospitalIncident = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const hospitalName = (req.user.primaryHospital || req.user.name || "").trim();

    if (!hospitalName) {
      return res.status(400).json({ message: "Hospital profile is incomplete" });
    }

    const incident = await IncidentAlert.findById(req.params.id).populate(
      "userId",
      "name email phone role"
    );

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    if (
      incident.hospital &&
      incident.hospital !== "Awaiting assignment" &&
      incident.hospital !== hospitalName
    ) {
      return res.status(409).json({ message: "Incident is already assigned to another hospital" });
    }

    incident.hospital = hospitalName;
    if (incident.status === "pending") {
      incident.status = "active";
    }
    await incident.save();

    emitIncidentRealtimeUpdate(incident, "claimed");

    return res.status(200).json({
      message: "Incident assigned to hospital successfully",
      incident: formatHospitalIncident(incident),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const acceptHospitalIncident = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const hospitalName = (req.user.primaryHospital || req.user.name || "").trim();
    const incident = await IncidentAlert.findById(req.params.id).populate(
      "userId",
      "name email phone role"
    );

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    if (incident.hospital !== hospitalName) {
      return res.status(403).json({ message: "Incident is not assigned to this hospital" });
    }

    incident.hospitalAccepted = true;
    incident.hospitalAcceptedAt = incident.hospitalAcceptedAt || new Date();
    if (incident.status === "pending") {
      incident.status = "active";
    }
    await incident.save();

    emitIncidentRealtimeUpdate(incident, "hospital-accepted-incident");

    return res.status(200).json({
      message: "Case accepted successfully",
      incident: formatHospitalIncident(incident),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const assignHospitalIncidentDriver = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const hospitalName = (req.user.primaryHospital || req.user.name || "").trim();
    const { driverId } = req.body;

    if (!driverId) {
      return res.status(400).json({ message: "Driver is required" });
    }

    const [incident, driver] = await Promise.all([
      IncidentAlert.findById(req.params.id).populate("userId", "name email phone role"),
      AmbulanceDriver.findOne({
        _id: driverId,
        hospitalUserId: req.user._id,
      }),
    ]);

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    if (incident.hospital !== hospitalName) {
      return res.status(403).json({ message: "Incident is not assigned to this hospital" });
    }

    if (!incident.hospitalAccepted) {
      return res.status(400).json({ message: "Accept the case before assigning an ambulance" });
    }

    if (!driver) {
      return res.status(404).json({ message: "Ambulance driver not found" });
    }

    if (driver.status === "off-duty") {
      return res.status(400).json({ message: "Selected driver is off duty" });
    }

    incident.ambulanceAssignment = {
      driverId: driver._id,
      name: driver.name,
      phone: driver.phone,
      vehicleNumber: driver.vehicleNumber,
      assignedAt: new Date(),
    };
    await incident.save();

    driver.status = "on-trip";
    await driver.save();

    emitIncidentRealtimeUpdate(incident, "ambulance-driver-assigned");

    return res.status(200).json({
      message: "Ambulance driver assigned successfully",
      incident: formatHospitalIncident(incident),
      driver: formatAmbulanceDriver(driver),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateHospitalIncidentStatus = async (req, res) => {
  try {
    if (req.user.role !== "hospital") {
      return res.status(403).json({ message: "Hospital access required" });
    }

    const hospitalName = (req.user.primaryHospital || req.user.name || "").trim();
    const { status } = req.body;

    if (!["active", "resolved"].includes(status)) {
      return res.status(400).json({ message: "Invalid hospital incident status" });
    }

    const incident = await IncidentAlert.findById(req.params.id).populate(
      "userId",
      "name email phone role"
    );

    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }

    if (incident.hospital !== hospitalName) {
      return res.status(403).json({ message: "Incident is not assigned to this hospital" });
    }

    incident.status = status;
    incident.resolvedAt = status === "resolved" ? new Date() : null;
    await incident.save();

    if (status === "resolved" && incident.ambulanceAssignment?.driverId) {
      await AmbulanceDriver.findByIdAndUpdate(incident.ambulanceAssignment.driverId, {
        status: "available",
      });
    }

    emitIncidentRealtimeUpdate(incident, "hospital-status-updated");

    return res.status(200).json({
      message: "Hospital incident status updated successfully",
      incident: formatHospitalIncident(incident),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateAdminSettings = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const settings = await ensureAdminSettings();

    const updates = {
      platformName: (req.body.platformName || "").trim() || settings.platformName,
      controlRoomEmail: (req.body.controlRoomEmail || "").trim(),
      controlRoomPhone: (req.body.controlRoomPhone || "").trim(),
      defaultHospitalLabel:
        (req.body.defaultHospitalLabel || "").trim() || settings.defaultHospitalLabel,
      autoRefreshSeconds: Number(req.body.autoRefreshSeconds) || settings.autoRefreshSeconds,
      analyticsWindowDays:
        Number(req.body.analyticsWindowDays) || settings.analyticsWindowDays,
      allowUserRegistration: Boolean(req.body.allowUserRegistration),
      maintenanceMode: Boolean(req.body.maintenanceMode),
      smsAlertsEnabled: Boolean(req.body.smsAlertsEnabled),
      emailAlertsEnabled: Boolean(req.body.emailAlertsEnabled),
      incidentAutoAssignment: Boolean(req.body.incidentAutoAssignment),
      adminNotes: (req.body.adminNotes || "").trim(),
    };

    if (updates.autoRefreshSeconds < 5 || updates.autoRefreshSeconds > 300) {
      return res
        .status(400)
        .json({ message: "Auto refresh seconds must be between 5 and 300" });
    }

    if (updates.analyticsWindowDays < 7 || updates.analyticsWindowDays > 90) {
      return res
        .status(400)
        .json({ message: "Analytics window must be between 7 and 90 days" });
    }

    Object.assign(settings, updates);
    await settings.save();

    emitRealtimeEvent(
      {
        type: "admin-settings-updated",
        reason: "settings-saved",
      },
      {
        roles: ["admin"],
      }
    );

    return res.status(200).json({
      message: "Admin settings updated successfully",
      settings: serializeAdminSettings(settings),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const updateIncidentAlertStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!["pending", "active", "resolved"].includes(status)) {
      return res.status(400).json({ message: "Invalid alert status" });
    }

    const alert = await IncidentAlert.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    alert.status = status;
    alert.resolvedAt = status === "resolved" ? new Date() : null;
    await alert.save();

    emitIncidentRealtimeUpdate(alert, "user-status-updated");

    return res.status(200).json({
      message: "Alert status updated successfully",
      alert: formatDashboardAlert(alert),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
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
  createEmergencyIncidentAndNotify,
};
