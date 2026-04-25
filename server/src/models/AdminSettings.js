const mongoose = require("mongoose");

const adminSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
      index: true,
    },
    platformName: {
      type: String,
      trim: true,
      default: "Prana Raksha",
    },
    controlRoomEmail: {
      type: String,
      trim: true,
      default: "",
    },
    controlRoomPhone: {
      type: String,
      trim: true,
      default: "",
    },
    defaultHospitalLabel: {
      type: String,
      trim: true,
      default: "Awaiting assignment",
    },
    autoRefreshSeconds: {
      type: Number,
      min: 5,
      max: 300,
      default: 5,
    },
    analyticsWindowDays: {
      type: Number,
      min: 7,
      max: 90,
      default: 7,
    },
    allowUserRegistration: {
      type: Boolean,
      default: true,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    smsAlertsEnabled: {
      type: Boolean,
      default: true,
    },
    emailAlertsEnabled: {
      type: Boolean,
      default: false,
    },
    incidentAutoAssignment: {
      type: Boolean,
      default: false,
    },
    adminNotes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminSettings", adminSettingsSchema);
