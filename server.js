const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 5050;

const DATA_FILE = path.join(__dirname, "data", "members.json");
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const JWT_SECRET = process.env.JWT_SECRET || "sanatan-sena-dev-secret-change-this";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "vivek1042x";
const ADMIN_MOBILE = process.env.ADMIN_MOBILE || "+91 93056 25421";
const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || "";
const OTP_TTL_MS = 5 * 60 * 1000;

const pendingOtps = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || ".jpg");
    const safeName = `ss-${Date.now()}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

function readMembers() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "[]", "utf-8");
  }
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw || "[]");
}

function writeMembers(members) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(members, null, 2), "utf-8");
}

function normalizeMobile(value) {
  // Extract only digits and take the last 10
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function generateMembershipId(existingMembers) {
  const prefix = "SS";
  const current = existingMembers
    .map((m) => m.membershipId)
    .filter((id) => typeof id === "string" && id.startsWith(prefix))
    .map((id) => Number(id.replace(prefix, "")))
    .filter((n) => Number.isFinite(n));

  const next = (Math.max(0, ...current) + 1).toString().padStart(6, "0");
  return `${prefix}${next}`;
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/otp/send", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) {
    return res.status(400).json({ message: "mobile is required" });
  }

  const normalizedMobile = normalizeMobile(mobile);
  const members = readMembers();

  // UNIQUE CHECK: Prevent OTP if already registered
  const exists = members.find((m) => normalizeMobile(m.mobile) === normalizedMobile);
  if (exists) {
    return res.status(409).json({
      message: "इस नंबर से पंजीकरण पहले ही हो चुका है। / Mobile already registered.",
      membershipId: exists.membershipId
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + OTP_TTL_MS;

  pendingOtps.set(normalizedMobile, { otp, expiresAt });

  // SMS Sending Logic (Fast2SMS Integration using Environment Variable)
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
      otp // Still returning for dev/testing; in production, you'd hide this.
    });
  } catch (err) {
    console.error("SMS Gateway Network Error:", err);
    return res.status(500).json({ message: "Failed to send OTP", error: err.message });
  }
});

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

    const members = readMembers();
    const normalizedMobile = normalizeMobile(mobile);

    const otpEntry = pendingOtps.get(normalizedMobile);
    if (!otpEntry || otpEntry.expiresAt < Date.now() || otpEntry.otp !== String(otp || "")) {
      return res.status(401).json({ message: "Invalid or expired OTP" });
    }

    pendingOtps.delete(normalizedMobile);

    const exists = members.find((m) => normalizeMobile(m.mobile) === normalizedMobile);
    if (exists) {
      return res.status(409).json({
        message: "Member with this mobile number is already registered",
        membershipId: exists.membershipId
      });
    }

    const membershipId = generateMembershipId(members);
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

    const member = {
      id: Date.now().toString(),
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
      photoUrl: req.file ? `/uploads/${req.file.filename}` : "",
      language: language === "en" ? "en" : "hi",
      qrCodeDataUrl,
      verificationUrl,
      status: "active",
      createdAt: new Date().toISOString()
    };

    members.push(member);
    writeMembers(members);

    return res.status(201).json({
      message: "Member registered successfully",
      member
    });
  } catch (error) {
    return res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

app.get("/api/members/verify/:membershipId", (req, res) => {
  const membershipId = req.params.membershipId;
  const members = readMembers();
  const member = members.find((m) => m.membershipId === membershipId);

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
      photoUrl: member.photoUrl,
      qrCodeDataUrl: member.qrCodeDataUrl
    }
  });
});

app.get("/api/members/count", (_req, res) => {
  const members = readMembers();
  res.json({ count: members.length });
});

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

app.get("/api/admin/members", authMiddleware, (_req, res) => {
  const members = readMembers().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ count: members.length, members });
});

app.get("/api/admin/stats", authMiddleware, (_req, res) => {
  const members = readMembers();
  const today = new Date().toISOString().slice(0, 10);
  const newToday = members.filter((m) => m.createdAt && m.createdAt.slice(0, 10) === today).length;
  res.json({
    totalMembers: members.length,
    activeMembers: members.filter((m) => m.status === "active").length,
    inactiveMembers: members.filter((m) => m.status !== "active").length,
    newToday
  });
});

app.delete("/api/admin/members/:membershipId", authMiddleware, (req, res) => {
  const membershipId = req.params.membershipId;
  let members = readMembers();
  const initialCount = members.length;
  
  members = members.filter((m) => m.membershipId !== membershipId);
  
  if (members.length === initialCount) {
    return res.status(404).json({ message: "Member not found" });
  }
  
  writeMembers(members);
  res.json({ message: "Member deleted successfully" });
});

app.patch("/api/admin/members/:membershipId/toggle-status", authMiddleware, (req, res) => {
  const membershipId = req.params.membershipId;
  const members = readMembers();
  const member = members.find((m) => m.membershipId === membershipId);

  if (!member) {
    return res.status(404).json({ message: "Member not found" });
  }

  member.status = member.status === "active" ? "inactive" : "active";
  writeMembers(members);
  res.json({ message: `Member ${member.status === "active" ? "activated" : "deactivated"} successfully`, status: member.status });
});

app.get("/api/admin/export", authMiddleware, (_req, res) => {
  const members = readMembers().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // Build CSV
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
  res.send("\uFEFF" + csv); // BOM for Excel UTF-8
});


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
