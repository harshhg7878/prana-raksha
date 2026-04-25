const mongoose = require("mongoose");

const aiAlertSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "cancelled", "sent", "failed"],
      default: "pending",
      index: true,
    },
    alertMessage: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      default: "AI Accident Detected",
      trim: true,
    },
    triggerType: {
      type: String,
      default: "ai-accident-detected",
      trim: true,
    },
    sourceFile: {
      filename: {
        type: String,
        default: "",
        trim: true,
      },
      contentType: {
        type: String,
        default: "",
        trim: true,
      },
    },
    incidentLocation: {
      address: {
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
    },
    prediction: {
      provider: {
        type: String,
        default: "",
        trim: true,
      },
      modelId: {
        type: String,
        default: "",
        trim: true,
      },
      accidentConfidence: {
        type: Number,
        default: 0,
      },
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    failedAt: {
      type: Date,
      default: null,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    incidentAlertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IncidentAlert",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AiAlertSession", aiAlertSessionSchema);
