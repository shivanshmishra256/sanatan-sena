const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  membershipId: { type: String, required: true, unique: true, index: true },
  fullName: { type: String, required: true },
  fatherName: { type: String, default: "" },
  mobile: { type: String, required: true },
  email: { type: String, default: "" },
  dob: { type: String, default: "" },
  gender: { type: String, default: "" },
  state: { type: String, default: "" },
  district: { type: String, required: true },
  address: { type: String, required: true },
  photoBase64: { type: String, default: "" },  // Store photo as base64
  language: { type: String, default: "hi" },
  qrCodeDataUrl: { type: String, default: "" },
  verificationUrl: { type: String, default: "" },
  status: { type: String, default: "active", enum: ["active", "inactive"] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Member", memberSchema);
