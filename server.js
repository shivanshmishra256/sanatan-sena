if (process.env.NODE_ENV !== "production") require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const multer = require("multer");
const mongoose = require("mongoose");
const Member = require("./models/Member");

const app = express();
const PORT = process.env.PORT || 5050;

const JWT_SECRET = process.env.JWT_SECRET || "sanatan-sena-dev-secret-change-this";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "vivek1042x";
const ADMIN_MOBILE = process.env.ADMIN_MOBILE || "+91 93056 25421";
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "";
const MONGODB_URI = process.env.MONGODB_URI || "";
const OTP_TTL_MS = 5 * 60 * 1000;

const pendingOtps = new Map();

// ── MongoDB Connection ──
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("❌ MongoDB error:", err.message));
} else {
  console.warn("⚠️ MONGODB_URI not set — database features will not work");
}

app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Use memory storage for photos (store as base64 in MongoDB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function normalizeMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function generateMembershipId() {
  const lastMember = await Member.findOne({}, { membershipId: 1 })
    .sort({ membershipId: -1 })
    .lean();

  let nextNum = 1;
  if (lastMember && lastMember.membershipId) {
    const num = Number(lastMember.membershipId.replace("SS", ""));
    if (Number.isFinite(num)) nextNum = num + 1;
  }

  return `SS${nextNum.toString().padStart(6, "0")}`;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// ── Health ──
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", db: mongoose.connection.readyState === 1 ? "connected" : "disconnected" });
});

// ── OTP Send ──
app.post("/api/otp/send", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) {
    return res.status(400).json({ message: "mobile is required" });
  }

  const normalizedMobile = normalizeMobile(mobile);

  // Check if already registered
  const exists = await Member.findOne({
    $expr: {
      $eq: [
        { $substr: [{ $replaceAll: { input: "$mobile", find: " ", replacement: "" } }, -10, 10] },
        normalizedMobile
      ]
    }
  }).lean();

  if (!exists) {
    // Simple check with regex
    const allMembers = await Member.find({}, { mobile: 1, membershipId: 1 }).lean();
    const found = allMembers.find((m) => normalizeMobile(m.mobile) === normalizedMobile);
    if (found) {
      return res.status(409).json({
        message: "इस नंबर से पंजीकरण पहले ही हो चुका है। / Mobile already registered.",
        membershipId: found.membershipId
      });
    }
  } else {
    return res.status(409).json({
      message: "इस नंबर से पंजीकरण पहले ही हो चुका है। / Mobile already registered.",
      membershipId: exists.membershipId
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + OTP_TTL_MS;

  pendingOtps.set(normalizedMobile, { otp, expiresAt });

  console.log(`Attempting to send OTP ${otp} to ${normalizedMobile}`);

  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${FAST2SMS_API_KEY}&route=otp&variables_values=${otp}&numbers=${normalizedMobile}`;
    const response = await fetch(url);
    const smsResult = await response.json();
    console.log("SMS Gateway Response:", smsResult);

    return res.json({
      message: smsResult.return
        ? "OTP आपके मोबाइल पर भेज दिया गया है। / OTP sent to your mobile."
        : `SMS Gateway Error: ${smsResult.message || "Unknown error"}`,
      success: smsResult.return,
      otp
    });
  } catch (err) {
    console.error("SMS Gateway Network Error:", err);
    return res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
});

// ── Register ──
app.post("/api/members/register", (req, res, next) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "Photo size too large. Maximum 10MB allowed. / फोटो का साइज़ बहुत बड़ा है।" });
      }
      return res.status(400).json({ message: "Photo upload error: " + err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const {
      fullName,
      fatherName,
      mobile,
      email,
      dob,
      gender,
      state,
      district,
      address,
      language,
      otp
    } = req.body;

    if (!fullName || !mobile || !district || !address) {
      return res.status(400).json({
        message: "fullName, mobile, district and address are required"
      });
    }

    const normalizedMobile = normalizeMobile(mobile);

    const otpEntry = pendingOtps.get(normalizedMobile);
    if (!otpEntry || otpEntry.expiresAt < Date.now() || otpEntry.otp !== String(otp || "")) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    pendingOtps.delete(normalizedMobile);

    // Check duplicate
    const allMembers = await Member.find({}, { mobile: 1, membershipId: 1 }).lean();
    const exists = allMembers.find((m) => normalizeMobile(m.mobile) === normalizedMobile);
    if (exists) {
      return res.status(409).json({
        message: "Member with this mobile number is already registered",
        membershipId: exists.membershipId
      });
    }

    const membershipId = await generateMembershipId();
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const verificationUrl = `${baseUrl}/verify.html?id=${encodeURIComponent(membershipId)}`;
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: "#800000",
        light: "#ffffff"
      }
    });

    // Convert photo to base64
    let photoBase64 = "";
    if (req.file && req.file.buffer) {
      const mimeType = req.file.mimetype || "image/jpeg";
      photoBase64 = `data:${mimeType};base64,${req.file.buffer.toString("base64")}`;
    }

    const member = new Member({
      membershipId,
      fullName: fullName.trim(),
      fatherName: String(fatherName || "").trim(),
      mobile: String(mobile || "").trim(),
      email: String(email || "").trim(),
      dob: String(dob || "").trim(),
      gender: String(gender || "").trim(),
      state: String(state || "").trim(),
      district: String(district || "").trim(),
      address: String(address || "").trim(),
      photoBase64,
      language: language === "en" ? "en" : "hi",
      qrCodeDataUrl,
      verificationUrl,
      status: "active"
    });

    await member.save();

    // Return response compatible with frontend (use photoBase64 as photoUrl)
    return res.status(201).json({
      message: "Member registered successfully",
      member: {
        id: member._id,
        membershipId: member.membershipId,
        fullName: member.fullName,
        fatherName: member.fatherName,
        mobile: member.mobile,
        email: member.email,
        dob: member.dob,
        gender: member.gender,
        state: member.state,
        district: member.district,
        address: member.address,
        photoUrl: member.photoBase64,
        language: member.language,
        qrCodeDataUrl: member.qrCodeDataUrl,
        verificationUrl: member.verificationUrl,
        status: member.status,
        createdAt: member.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

// ── Verify Member ──
app.get("/api/members/verify/:membershipId", async (req, res) => {
  const membershipId = req.params.membershipId;
  const member = await Member.findOne({ membershipId }).lean();

  if (!member) {
    return res.status(404).json({
      valid: false,
      message: "Member not found"
    });
  }

  return res.json({
    valid: true,
    message: "Verified member",
    member: {
      membershipId: member.membershipId,
      fullName: member.fullName,
      mobile: member.mobile,
      district: member.district,
      address: member.address || "",
      state: member.state,
      status: member.status,
      createdAt: member.createdAt,
      photoUrl: member.photoBase64 || "",
      qrCodeDataUrl: member.qrCodeDataUrl
    }
  });
});

// ── Member Count ──
app.get("/api/members/count", async (_req, res) => {
  const count = await Member.countDocuments();
  res.json({ count });
});

// ── Public Member Directory ──
app.get("/api/members/public", async (_req, res) => {
  const members = await Member.find({ status: "active" }, {
    membershipId: 1,
    fullName: 1,
    district: 1,
    state: 1,
    photoBase64: 1,
    createdAt: 1
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    count: members.length,
    members: members.map((m) => ({
      membershipId: m.membershipId,
      fullName: m.fullName,
      district: m.district || "",
      state: m.state || "",
      photoUrl: m.photoBase64 || "",
      createdAt: m.createdAt
    }))
  });
});

// ── Admin Login ──
app.post("/api/admin/login", (req, res) => {
  const { mobile, password } = req.body;
  if (!mobile || !password) {
    return res.status(400).json({ message: "mobile and password are required" });
  }

  if (normalizeMobile(mobile) !== normalizeMobile(ADMIN_MOBILE) || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    {
      role: "admin",
      mobile: ADMIN_MOBILE
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.json({ token, adminMobile: ADMIN_MOBILE });
});

// ── Admin: Get All Members ──
app.get("/api/admin/members", authMiddleware, async (_req, res) => {
  const members = await Member.find().sort({ createdAt: -1 }).lean();
  res.json({
    count: members.length,
    members: members.map((m) => ({
      id: m._id,
      membershipId: m.membershipId,
      fullName: m.fullName,
      mobile: m.mobile,
      district: m.district,
      address: m.address,
      photoUrl: m.photoBase64 || "",
      status: m.status,
      createdAt: m.createdAt
    }))
  });
});

// ── Admin: Stats ──
app.get("/api/admin/stats", authMiddleware, async (_req, res) => {
  const total = await Member.countDocuments();
  const active = await Member.countDocuments({ status: "active" });
  const inactive = total - active;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const newToday = await Member.countDocuments({ createdAt: { $gte: todayStart } });

  res.json({
    totalMembers: total,
    activeMembers: active,
    inactiveMembers: inactive,
    newToday
  });
});

// ── Admin: Delete Member ──
app.delete("/api/admin/members/:membershipId", authMiddleware, async (req, res) => {
  const membershipId = req.params.membershipId;
  const result = await Member.deleteOne({ membershipId });

  if (result.deletedCount === 0) {
    return res.status(404).json({ message: "Member not found" });
  }

  res.json({ message: "Member deleted successfully" });
});

// ── Admin: Toggle Status ──
app.patch("/api/admin/members/:membershipId/toggle-status", authMiddleware, async (req, res) => {
  const membershipId = req.params.membershipId;
  const member = await Member.findOne({ membershipId });

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  member.status = member.status === "active" ? "inactive" : "active";
  await member.save();
  res.json({ message: `Member ${member.status === "active" ? "activated" : "deactivated"} successfully`, status: member.status });
});

// ── Admin: Export CSV ──
app.get("/api/admin/export", authMiddleware, async (_req, res) => {
  const members = await Member.find().sort({ createdAt: -1 }).lean();

  const headers = ["Member ID", "Name", "Mobile", "District", "Address", "Status", "Registration Date"];
  const rows = members.map((m) => [
    m.membershipId,
    `"${(m.fullName || "").replace(/"/g, '""')}"`,
    m.mobile,
    `"${(m.district || "").replace(/"/g, '""')}"`,
    `"${(m.address || "").replace(/"/g, '""')}"`,
    m.status,
    m.createdAt ? new Date(m.createdAt).toLocaleString("en-IN") : ""
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="sanatan-sena-members-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send("\uFEFF" + csv);
});

// ── Org Meta ──
app.get("/api/meta/org", (_req, res) => {
  res.json({
    nameHindi: "सनातन सेना",
    nameEnglish: "Sanatan Sena",
    shortName: "SS",
    chief: "वृजेन्द्र सिंह फौजी",
    adminMobile: ADMIN_MOBILE,
    sloganHindi: "सबका साथ सबका सम्मान",
    descriptionHindi:
      "सनातन सेना एक ऐसा संगठन है जो भेदभाव और जातिवाद से ऊपर उठकर धर्म व राष्ट्र के लिए कार्य करता है। इस संगठन का मूल उद्देश्य लोगों को जोड़ना है, तोड़ना नहीं।",
    descriptionEnglish:
      "Sanatan Sena is an organization that works for Dharma and Nation above caste discrimination and social divisions. The main purpose of this organization is to unite people, not divide them."
  });
});

// ── Catch-all: serve index.html ──
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Only start the server if not running in a serverless environment (like Vercel)
if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Sanatan Sena portal running on http://localhost:${PORT}`);
  });
}

module.exports = app;
