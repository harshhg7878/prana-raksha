const mongoose = require("mongoose");

const ambulanceDriverSchema = new mongoose.Schema(
  {
    hospitalUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    vehicleNumber: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["available", "on-trip", "off-duty"],
      default: "available",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AmbulanceDriver", ambulanceDriverSchema);
