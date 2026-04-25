const mongoose = require("mongoose");

const bedAvailabilitySchema = new mongoose.Schema(
  {
    unit: {
      type: String,
      required: true,
      trim: true,
    },
    available: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: true }
);

const staffSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      default: "",
      trim: true,
    },
    initials: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4,
    },
    shiftStatus: {
      type: String,
      enum: ["On Duty", "On Call", "Off Duty"],
      default: "On Duty",
    },
  },
  { _id: true }
);

const hospitalProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
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
    occupiedPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    bedAvailability: {
      type: [bedAvailabilitySchema],
      default: [],
    },
    staff: {
      type: [staffSchema],
      default: [],
    },
    ambulanceEtaMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("HospitalProfile", hospitalProfileSchema);
