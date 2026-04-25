const mongoose = require("mongoose");

const hospitalNotificationSchema = new mongoose.Schema(
  {
    hospitalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncidentAlert",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
    alertCode: {
      type: String,
      default: "",
      trim: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    mapUrl: {
      type: String,
      default: "",
      trim: true,
    },
    hospitalName: {
      type: String,
      default: "",
      trim: true,
    },
    hospitalDetails: {
      hospitalName: {
        type: String,
        default: "",
        trim: true,
      },
      address: {
        type: String,
        default: "",
        trim: true,
      },
      distanceKm: {
        type: Number,
        default: 0,
        min: 0,
      },
      freeBeds: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalBeds: {
        type: Number,
        default: 0,
        min: 0,
      },
      icuFree: {
        type: Number,
        default: 0,
        min: 0,
      },
      ambulanceEtaMinutes: {
        type: Number,
        default: 0,
        min: 0,
      },
      occupiedPercent: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },
      source: {
        type: String,
        default: "",
        trim: true,
      },
      isConnected: {
        type: Boolean,
        default: true,
      },
    },
    userName: {
      type: String,
      default: "",
      trim: true,
    },
    userEmail: {
      type: String,
      default: "",
      trim: true,
    },
    userPhone: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "resolved"],
      default: "pending",
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HospitalNotification", hospitalNotificationSchema);
