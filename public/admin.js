// ── Admin Dashboard Logic ──

const loginPanel = document.getElementById("admin-login-panel");
const dashboardPanel = document.getElementById("admin-dashboard-panel");
const mainHeader = document.getElementById("main-header");
const loginForm = document.getElementById("admin-login-form");
const loginMessage = document.getElementById("admin-login-message");

const statTotal = document.getElementById("stat-total");
const statActive = document.getElementById("stat-active");
const statInactive = document.getElementById("stat-inactive");
const statToday = document.getElementById("stat-today");
const tableBody = document.getElementById("members-table-body");
const recentTableBody = document.getElementById("recent-table-body");
const logoutBtn = document.getElementById("logout-btn");
const searchInput = document.getElementById("search-input");
const exportBtn = document.getElementById("export-btn");
const showingCount = document.getElementById("showing-count");
const noResults = document.getElementById("no-results");

// Sidebar elements
const sidebar = document.getElementById("admin-sidebar");
const sidebarToggleBtn = document.getElementById("sidebar-toggle-btn");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidebarLinks = document.querySelectorAll(".sidebar-nav a[data-page]");

let allMembers = [];

// ── Token Management ──
function getToken() { return localStorage.getItem("ss-admin-token"); }
function setToken(token) { localStorage.setItem("ss-admin-token", token); }
function clearToken() { localStorage.removeItem("ss-admin-token"); }

// ── Auth Fetch ──
async function fetchWithAuth(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${getToken()}`
    }
  });
}

// ── Show/Hide Panels ──
function showDashboard() {
  loginPanel.classList.add("hidden");
  dashboardPanel.classList.remove("hidden");
  mainHeader.style.display = "flex";
}

function showLogin() {
  dashboardPanel.classList.add("hidden");
  loginPanel.classList.remove("hidden");
  mainHeader.style.display = "none";
}

// ── Sidebar Navigation ──
function switchToPage(pageId) {
  // Hide all pages
  document.querySelectorAll(".page-section").forEach((p) => p.classList.remove("active"));
  // Show target
  const target = document.getElementById(pageId);
  if (target) target.classList.add("active");

  // Update sidebar active state
  sidebarLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.page === pageId);
  });

  // Close mobile sidebar
  closeSidebar();
}

// Make switchToPage available globally for inline onclick
window.switchToPage = switchToPage;

sidebarLinks.forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const pageId = link.dataset.page;
    if (pageId) switchToPage(pageId);
  });
});

// ── Mobile Sidebar Toggle ──
function openSidebar() {
  if (sidebar) sidebar.classList.add("open");
  if (sidebarOverlay) sidebarOverlay.classList.add("show");
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove("open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("show");
}

if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
}

if (sidebarOverlay) {
  sidebarOverlay.addEventListener("click", closeSidebar);
}

// ── Actions ──
async function handleDelete(membershipId) {
  if (!confirm(`⚠️ Are you sure you want to permanently DELETE member ${membershipId}?\n\nThis action cannot be undone.`)) return;

  try {
    const response = await fetchWithAuth(`/api/admin/members/${membershipId}`, { method: "DELETE" });
    const result = await response.json();
    if (response.ok) {
      showToast("✅ Member deleted successfully");
      await loadDashboard();
    } else {
      showToast("❌ " + (result.message || "Delete failed"));
    }
  } catch (_error) {
    showToast("❌ Network error");
  }
}

async function handleToggleStatus(membershipId) {
  try {
    const response = await fetchWithAuth(`/api/admin/members/${membershipId}/toggle-status`, { method: "PATCH" });
    const result = await response.json();
    if (response.ok) {
      showToast(`✅ Member ${result.status === "active" ? "activated" : "deactivated"}`);
      await loadDashboard();
    } else {
      showToast("❌ " + (result.message || "Action failed"));
    }
  } catch (_error) {
    showToast("❌ Network error");
  }
}

// ── Toast Notification ──
function showToast(message) {
  const existing = document.querySelector(".toast-msg");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast-msg";
  toast.textContent = message;
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    background: "#333",
    color: "#fff",
    padding: "14px 24px",
    borderRadius: "12px",
    fontFamily: "inherit",
    fontSize: "0.9rem",
    fontWeight: "600",
    zIndex: "9999",
    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
    animation: "slideIn 0.3s ease"
  });
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ── Render Full Members Table ──
function renderMembers(members) {
  tableBody.innerHTML = "";

  if (members.length === 0) {
    noResults.classList.remove("hidden");
    showingCount.textContent = "0 members";
    return;
  }

  noResults.classList.add("hidden");
  showingCount.textContent = `${members.length} member${members.length !== 1 ? "s" : ""}`;

  members.forEach((member) => {
    const tr = document.createElement("tr");
    if (member.status !== "active") tr.classList.add("inactive-row");

    const initials = (member.fullName || "?")
      .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    const photoHtml = member.photoUrl
      ? `<img src="${member.photoUrl}" class="member-avatar" alt="${member.fullName}" />`
      : `<div class="member-avatar-placeholder">${initials}</div>`;

    const isActive = member.status === "active";
    const statusHtml = `<span class="status-pill ${isActive ? "active" : "inactive"}">
      <span class="dot"></span> ${isActive ? "Active" : "Inactive"}
    </span>`;

    const toggleLabel = isActive ? "Deactivate" : "Activate";
    const toggleClass = isActive ? "toggle" : "toggle reactivate";

    const dateStr = member.createdAt
      ? new Date(member.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric"
        })
      : "—";

    tr.innerHTML = `
      <td><span class="id-badge">${member.membershipId}</span></td>
      <td>
        <div class="member-cell">
          ${photoHtml}
          <span>${member.fullName}</span>
        </div>
      </td>
      <td>${member.mobile}</td>
      <td>${member.district || "—"}</td>
      <td style="max-width:180px; font-size:0.78rem; color:#666; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${member.address || ""}">${member.address || "—"}</td>
      <td>${statusHtml}</td>
      <td style="font-size:0.8rem; white-space:nowrap;">${dateStr}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn ${toggleClass}" data-id="${member.membershipId}" data-action="toggle">${toggleLabel}</button>
          <button class="action-btn delete" data-id="${member.membershipId}" data-action="delete">Delete</button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// ── Render Recent Members (Dashboard overview) ──
function renderRecentMembers(members) {
  if (!recentTableBody) return;
  recentTableBody.innerHTML = "";

  const recent = members.slice(0, 5); // Show last 5

  if (recent.length === 0) {
    recentTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#999; padding:30px;">No members registered yet</td></tr>`;
    return;
  }

  recent.forEach((member) => {
    const tr = document.createElement("tr");
    if (member.status !== "active") tr.classList.add("inactive-row");

    const initials = (member.fullName || "?")
      .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

    const photoHtml = member.photoUrl
      ? `<img src="${member.photoUrl}" class="member-avatar" alt="${member.fullName}" />`
      : `<div class="member-avatar-placeholder">${initials}</div>`;

    const isActive = member.status === "active";
    const statusHtml = `<span class="status-pill ${isActive ? "active" : "inactive"}">
      <span class="dot"></span> ${isActive ? "Active" : "Inactive"}
    </span>`;

    const dateStr = member.createdAt
      ? new Date(member.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric"
        })
      : "—";

    tr.innerHTML = `
      <td><span class="id-badge">${member.membershipId}</span></td>
      <td>
        <div class="member-cell">
          ${photoHtml}
          <span>${member.fullName}</span>
        </div>
      </td>
      <td>${member.district || "—"}</td>
      <td>${statusHtml}</td>
      <td style="font-size:0.8rem; white-space:nowrap;">${dateStr}</td>
    `;
    recentTableBody.appendChild(tr);
  });
}

// ── Search / Filter ──
function filterMembers(query) {
  const q = query.toLowerCase().trim();
  if (!q) return allMembers;
  return allMembers.filter((m) =>
    (m.fullName || "").toLowerCase().includes(q) ||
    (m.district || "").toLowerCase().includes(q) ||
    (m.membershipId || "").toLowerCase().includes(q) ||
    (m.mobile || "").includes(q)
  );
}

// ── Load Dashboard ──
async function loadDashboard() {
  try {
    const [statsRes, membersRes] = await Promise.all([
      fetchWithAuth("/api/admin/stats"),
      fetchWithAuth("/api/admin/members")
    ]);

    if (!statsRes.ok || !membersRes.ok) {
      clearToken();
      showLogin();
      return;
    }

    const stats = await statsRes.json();
    const membersData = await membersRes.json();

    statTotal.textContent = stats.totalMembers;
    statActive.textContent = stats.activeMembers;
    statInactive.textContent = stats.inactiveMembers || 0;
    statToday.textContent = stats.newToday || 0;

    allMembers = membersData.members || [];
    
    // Render recent members on dashboard
    renderRecentMembers(allMembers);
    
    // Render full table
    const query = searchInput ? searchInput.value : "";
    renderMembers(filterMembers(query));
  } catch (_err) {
    clearToken();
    showLogin();
  }
}

// ── Export ──
async function handleExport() {
  try {
    const response = await fetchWithAuth("/api/admin/export");
    if (!response.ok) {
      showToast("❌ Export failed");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sanatan-sena-members-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("✅ Export downloaded");
  } catch (_err) {
    showToast("❌ Export failed");
  }
}

// ── Event Listeners ──

// Login
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Signing in...";

  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    if (!response.ok) {
      loginMessage.textContent = result.message || "Login failed";
      return;
    }

    setToken(result.token);
    loginMessage.textContent = "";
    showDashboard();
    await loadDashboard();
  } catch (_error) {
    loginMessage.textContent = "Network error";
  }
});

// Logout — redirect to main site so admin login only shows when needed
logoutBtn.addEventListener("click", () => {
  clearToken();
  window.location.href = "/";
});

// Search
if (searchInput) {
  let searchTimeout;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderMembers(filterMembers(searchInput.value));
    }, 200);
  });
}

// Export
if (exportBtn) {
  exportBtn.addEventListener("click", handleExport);
}

// Table action buttons (event delegation)
tableBody.addEventListener("click", (e) => {
  const btn = e.target.closest(".action-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === "delete") handleDelete(id);
  if (action === "toggle") handleToggleStatus(id);
});

// ── Auto-login if token exists ──
if (getToken()) {
  showDashboard();
  loadDashboard();
}

// ── Toast animation ──
const styleTag = document.createElement("style");
styleTag.textContent = `
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(styleTag);
