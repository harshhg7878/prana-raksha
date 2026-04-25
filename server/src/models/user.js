const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "hospital", "admin"],
      default: "user",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    primaryHospital: {
      type: String,
      trim: true,
      default: "",
    },
    locationSharing: {
      type: Boolean,
      default: true,
    },
    alertMethod: {
      type: String,
      enum: ["SMS", "Push", "SMS + Push"],
      default: "SMS + Push",
    },
    profileStatus: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
