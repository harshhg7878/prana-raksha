const mongoose = require("mongoose");

const adminPopupNotificationSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncidentAlert",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    alertCode: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "resolved"],
      default: "pending",
    },
    hospital: {
      type: String,
      default: "Awaiting assignment",
      trim: true,
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
    message: {
      type: String,
      default: "",
    },
    mapUrl: {
      type: String,
      default: "",
      trim: true,
    },
    nearestHospitals: {
      type: [
        new mongoose.Schema(
          {
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
              default: false,
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    triggerType: {
      type: String,
      default: "incident-created",
      trim: true,
    },
    sentToHospitalDashboard: {
      type: Boolean,
      default: false,
      index: true,
    },
    sentToHospitalAt: {
      type: Date,
      default: null,
    },
    assignedHospitalName: {
      type: String,
      default: "",
      trim: true,
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

module.exports = mongoose.model(
  "AdminPopupNotification",
  adminPopupNotificationSchema
);
