const hiOnly = document.querySelectorAll(".hi-only");
const enOnly = document.querySelectorAll(".en-only");
const langHiBtn = document.getElementById("lang-hi");
const langEnBtn = document.getElementById("lang-en");

function setLanguage(lang) {
  const isHindi = lang !== "en";

  hiOnly.forEach((el) => el.classList.toggle("hidden", !isHindi));
  enOnly.forEach((el) => el.classList.toggle("hidden", isHindi));

  langHiBtn.classList.toggle("active", isHindi);
  langEnBtn.classList.toggle("active", !isHindi);

  localStorage.setItem("ss-lang", isHindi ? "hi" : "en");
}

if (langHiBtn && langEnBtn) {
  langHiBtn.addEventListener("click", () => setLanguage("hi"));
  langEnBtn.addEventListener("click", () => setLanguage("en"));
}

const initialLang = localStorage.getItem("ss-lang") || "hi";
setLanguage(initialLang);

const registrationForm = document.getElementById("registration-form");
const registrationMessage = document.getElementById("registration-message");
const cardOutput = document.getElementById("card-output");
const memberCount = document.getElementById("member-count");
const cardActions = document.getElementById("card-actions");
const downloadCardBtn = document.getElementById("download-card");
const printCardBtn = document.getElementById("print-card");
const otpRow = document.getElementById("otp-row");
const resendOtpBtn = document.getElementById("resend-otp");
const submitBtn = document.getElementById("submit-btn");
let otpRequested = false;

async function loadMemberCount() {
  if (!memberCount) return;
  try {
    const response = await fetch("/api/members/count");
    const result = await response.json();
    memberCount.textContent = Number(result.count || 0).toLocaleString();
  } catch (_error) {
    memberCount.textContent = "0";
  }
}

loadMemberCount();

async function requestOtp(formData) {
  const mobile = String(formData.get("mobile") || "").trim();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch("/api/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "OTP send failed");
    }
    return result.otp;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error("Server timeout. Database or Gateway is hanging.");
    }
    throw error;
  }
}

if (registrationForm && registrationMessage && cardOutput) {
  registrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    registrationMessage.textContent = "Submitting...";

    const formData = new FormData(registrationForm);
    formData.set("language", localStorage.getItem("ss-lang") || "hi");

    const hasFile = registrationForm.querySelector("input[type='file']");
    const isMultipart = hasFile && hasFile.files && hasFile.files.length > 0;

    try {
      if (!otpRequested) {
        const otp = await requestOtp(formData);
        otpRequested = true;
        if (otpRow) otpRow.classList.remove("hidden");
        if (submitBtn) submitBtn.textContent = "Verify OTP & Register";
        registrationMessage.textContent = `OTP sent: ${otp}`;
        return;
      }
    } catch (error) {
      registrationMessage.textContent = error.message || "OTP failed";
      return;
    }

    const fetchOptions = isMultipart
      ? { method: "POST", body: formData }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(formData.entries()))
        };

    try {
      const response = await fetch("/api/members/register", fetchOptions);

      const result = await response.json();
      if (!response.ok) {
        registrationMessage.textContent = result.message || "Registration failed";
        return;
      }

      const { member } = result;
      registrationMessage.textContent = `Registered successfully. Membership ID: ${member.membershipId}`;

      cardOutput.classList.remove("muted");
      const photoHtml = member.photoUrl
        ? `<img class="member-photo" src="${member.photoUrl}" alt="Member Photo" />`
        : "";

      cardOutput.innerHTML = `
        <div class="membership-card" id="id-card">
          <div class="card-top-accent"></div>
          <div class="card-logo-overlap">
            <img src="/assets/logo.png" alt="Logo">
          </div>
          
          <div class="card-body">
            <h3 class="card-org-name">सनातन सेना</h3>
            <p class="card-slogan">सबका साथ सबका सम्मान</p>
            
            <div class="card-photo-wrap">
              ${member.photoUrl ? `<img src="${member.photoUrl}" alt="Photo">` : `<img src="/assets/logo.png" style="opacity:0.2" alt="N/A">`}
            </div>
            
            <h2 class="card-name">${member.fullName}</h2>
            <span class="card-role">MEMBERSHIP CARD</span>
            
            <div class="card-details">
              <div class="detail-row">
                <span class="detail-label">MEMBER ID</span>
                <span class="detail-value">${member.membershipId}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">DISTRICT</span>
                <span class="detail-value">${member.district}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">MOBILE</span>
                <span class="detail-value">${member.mobile}</span>
              </div>
              <div class="detail-row" style="flex-direction: column; align-items: flex-start;">
                <span class="detail-label">ADDRESS</span>
                <span class="detail-value" style="font-size: 0.75rem; text-align: left; margin-top: 2px; line-height: 1.2;">${member.address}</span>
              </div>
            </div>
            
            <div class="card-qr-section">
              <img src="${member.qrCodeDataUrl}" alt="QR">
              <p style="font-size: 0.65rem; color: #888; margin: 0;">Scan to Verify Membership</p>
            </div>
          </div>
          
          <div class="card-footer">
            SS • NATIONAL PRESIDENT: VRIJENDRA SINGH FAUJI
          </div>
        </div>
      `;

      if (cardActions) {
        cardActions.classList.remove("hidden");
      }

      registrationForm.reset();
      otpRequested = false;
      if (otpRow) otpRow.classList.add("hidden");
      if (submitBtn) submitBtn.textContent = "Register / पंजीकरण करें";
      loadMemberCount();
    } catch (error) {
      registrationMessage.textContent = "Network error. Try again.";
    }
  });
}

const verifyForm = document.getElementById("verify-form");
const verifyOutput = document.getElementById("verify-output");

async function verifyMembership(id) {
  if (!id) return;
  verifyOutput.textContent = "Verifying...";

  try {
    const response = await fetch(`/api/members/verify/${encodeURIComponent(id)}`);
    const result = await response.json();

    if (!response.ok) {
      verifyOutput.innerHTML = `<strong>Invalid:</strong> ${result.message || "Member not found"}`;
      return;
    }

    const m = result.member;
    const photoHtml = m.photoUrl ? `<img class="member-photo" src="${m.photoUrl}" alt="Member Photo" />` : "";
    verifyOutput.innerHTML = `
      <div class="membership-card" id="id-card">
        <div class="card-top-accent"></div>
        <div class="card-logo-overlap">
          <img src="/assets/logo.png" alt="Logo">
        </div>
        
        <div class="card-body">
          <h3 class="card-org-name">सनातन सेना</h3>
          <p class="card-slogan">सबका साथ सबका सम्मान</p>
          
          <div class="card-photo-wrap">
            ${m.photoUrl ? `<img src="${m.photoUrl}" alt="Photo">` : `<img src="/assets/logo.png" style="opacity:0.2" alt="N/A">`}
          </div>
          
          <h2 class="card-name">${m.fullName}</h2>
          <span class="card-role">VERIFIED MEMBER</span>
          
          <div class="card-details">
            <div class="detail-row">
              <span class="detail-label">MEMBER ID</span>
              <span class="detail-value">${m.membershipId}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">DISTRICT</span>
              <span class="detail-value">${m.district}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">MOBILE</span>
              <span class="detail-value">${m.mobile}</span>
            </div>
            <div class="detail-row" style="flex-direction: column; align-items: flex-start;">
              <span class="detail-label">ADDRESS</span>
              <span class="detail-value" style="font-size: 0.75rem; text-align: left; margin-top: 2px; line-height: 1.2;">${m.address}</span>
            </div>
          </div>
          
          <div class="card-qr-section">
            <img src="${m.qrCodeDataUrl}" alt="QR">
            <div class="card-actions" style="margin-top: 15px; width: 100%; justify-content: center;">
              <button class="btn-secondary" onclick="downloadCardPdf()" style="font-size: 0.75rem; padding: 6px 12px;">Download</button>
              <button class="btn-secondary" onclick="printCard()" style="font-size: 0.75rem; padding: 6px 12px;">Print</button>
            </div>
          </div>
        </div>
        
        <div class="card-footer">
          SS • VALIDATED BY SANATAN SENA IT CELL
        </div>
      </div>
    `;
  } catch (_error) {
    verifyOutput.textContent = "Verification failed due to network error.";
  }
}

if (verifyForm && verifyOutput) {
  verifyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(verifyForm);
    const membershipId = (formData.get("membershipId") || "").toString().trim();
    verifyMembership(membershipId);
  });

  const queryId = new URLSearchParams(window.location.search).get("id");
  if (queryId) {
    const input = verifyForm.querySelector("input[name='membershipId']");
    input.value = queryId;
    verifyMembership(queryId);
  }
}

// ── Card capture helper: hides buttons inside card, captures with html2canvas, restores ──
async function captureCardCanvas() {
  const card = document.getElementById("id-card");
  if (!card) return null;
  if (!window.html2canvas) {
    alert("Capture library not loaded. Please refresh the page and try again.");
    return null;
  }

  // Hide any action buttons that are nested inside the card element
  const hiddenEls = card.querySelectorAll("button, .card-actions");
  hiddenEls.forEach(el => { el.dataset._origDisplay = el.style.display; el.style.display = "none"; });

  let canvas = null;
  try {
    canvas = await window.html2canvas(card, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false
    });
  } finally {
    // Always restore visibility
    hiddenEls.forEach(el => { el.style.display = el.dataset._origDisplay || ""; delete el.dataset._origDisplay; });
  }
  return canvas;
}

async function downloadCardPdf() {
  const canvas = await captureCardCanvas();
  if (!canvas) return;

  // Download the card as a high-quality PNG
  const link = document.createElement("a");
  link.download = "Sanatan-Sena-ID-Card.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

async function printCard() {
  const canvas = await captureCardCanvas();
  if (!canvas) return;

  const imgData = canvas.toDataURL("image/png");
  const printWindow = window.open("", "_blank", "width=520,height=780");
  if (!printWindow) { alert("Pop-up blocked. Please allow pop-ups for this site."); return; }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Sanatan Sena – Member ID Card</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: #fff;
            display: flex;
            align-items: flex-start;
            justify-content: center;
            padding: 20px;
            min-height: 100vh;
          }
          img { width: 360px; max-width: 100%; display: block; }
          @media print {
            body { padding: 0; }
            img { width: 100%; }
          }
        <\/style>
      </head>
      <body>
        <img src="${imgData}" alt="Membership ID Card" />
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 600);
          };
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

if (downloadCardBtn) {
  downloadCardBtn.addEventListener("click", downloadCardPdf);
}

if (printCardBtn) {
  printCardBtn.addEventListener("click", printCard);
}
