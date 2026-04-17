require('dotenv').config();
const mongoose = require('mongoose');
const Member = require('./models/Member');
const fs = require('fs');
const path = require('path');

const membersFile = path.join(__dirname, 'data', 'members.json');
let members = [];
if (fs.existsSync(membersFile)) {
  members = JSON.parse(fs.readFileSync(membersFile, 'utf8'));
}

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ MongoDB Connected for migration");

    let count = 0;
    for (const m of members) {
      const exists = await Member.findOne({ membershipId: m.membershipId });
      if (!exists) {
        
        let base64Photo = "";
        // Try to read local file to base64 if it exists to preserve photo
        if (m.photoUrl && m.photoUrl.startsWith('/uploads/')) {
           const localPath = path.join(__dirname, 'public', m.photoUrl);
           if (fs.existsSync(localPath)) {
               const imgData = fs.readFileSync(localPath);
               const ext = path.extname(localPath).toLowerCase().replace('.', '');
               const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
               base64Photo = `data:${mime};base64,${imgData.toString('base64')}`;
           }
        }

        const memberDoc = new Member({
          membershipId: m.membershipId,
          fullName: m.fullName,
          fatherName: m.fatherName,
          mobile: m.mobile,
          email: m.email,
          dob: m.dob,
          gender: m.gender,
          state: m.state,
          district: m.district,
          address: m.address,
          photoBase64: base64Photo,
          language: m.language,
          qrCodeDataUrl: m.qrCodeDataUrl,
          verificationUrl: m.verificationUrl,
          status: m.status,
          createdAt: m.createdAt ? new Date(m.createdAt) : new Date()
        });
        await memberDoc.save();
        count++;
        console.log(`Migrated: ${m.membershipId}`);
      }
    }
    console.log(`✅ Migration complete. ${count} old members added to MongoDB.`);
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    process.exit(0);
  }
}

migrate();
