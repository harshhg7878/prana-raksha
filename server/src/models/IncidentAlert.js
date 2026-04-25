const mongoose = require("mongoose");

const incidentAlertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    alertCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      default: "Emergency Alert",
      trim: true,
    },
    location: {
      address: {
        type: String,
        default: "",
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
      },
    },
    status: {
      type: String,
      enum: ["pending", "active", "resolved"],
      default: "pending",
      index: true,
    },
    hospital: {
      type: String,
      default: "Awaiting assignment",
      trim: true,
    },
    hospitalAccepted: {
      type: Boolean,
      default: false,
    },
    hospitalAcceptedAt: {
      type: Date,
      default: null,
    },
    ambulanceAssignment: {
      driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AmbulanceDriver",
        default: null,
      },
      name: {
        type: String,
        default: "",
      },
      phone: {
        type: String,
        default: "",
      },
      vehicleNumber: {
        type: String,
        default: "",
      },
      assignedAt: {
        type: Date,
        default: null,
      },
    },
    message: {
      type: String,
      default: "",
    },
    totalContacts: {
      type: Number,
      default: 0,
    },
    sentContacts: {
      type: Number,
      default: 0,
    },
    failedContacts: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IncidentAlert", incidentAlertSchema);
