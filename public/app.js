// ─── Utilities ────────────────────────────────────────────────
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// ─── State ────────────────────────────────────────────────────
let currentUser = null;
const app = document.getElementById("app");

// ─── Router ───────────────────────────────────────────────────
function navigate(path, replace = false) {
  if (replace) {
    history.replaceState(null, "", path);
  } else {
    history.pushState(null, "", path);
  }
  route();
}

window.addEventListener("popstate", route);

async function route() {
  const path = window.location.pathname;

  // Check auth status
  const me = await api("/api/me");
  currentUser = me.ok ? me.data : null;

  if (path === "/" || path === "") {
    if (currentUser) {
      renderDashboard();
    } else {
      renderLanding();
    }
  } else if (path === "/login") {
    renderAuth("login");
  } else if (path === "/register") {
    renderAuth("register");
  } else {
    // /:username receiver page
    const username = path.slice(1);
    if (username && !username.includes("/")) {
      renderReceiverPage(username);
    } else {
      renderNotFound();
    }
  }
}

// ─── Landing Page ─────────────────────────────────────────────
function renderLanding() {
  app.innerHTML = `
    <div class="auth-page">
      <div class="page-header">
        <h1>Message Drop</h1>
        <p class="subtitle">Drop secret messages to friends they can unlock by their name or number</p>
      </div>
      <div class="card" style="text-align:center;">
        <h2>Create your message drop</h2>
        <p class="subtitle" style="margin-bottom:24px;">Sign up to start sending personalized secret messages</p>
        <button class="btn btn-primary" onclick="navigate('/register')" style="margin-bottom:12px;">Get Started</button>
        <div class="auth-toggle">
          Already have an account? <a onclick="navigate('/login')">Log in</a>
        </div>
      </div>
    </div>
  `;
}

// ─── Auth Pages ───────────────────────────────────────────────
function renderAuth(mode) {
  if (currentUser) return navigate("/", true);

  const isLogin = mode === "login";
  app.innerHTML = `
    <div class="auth-page">
      <div class="page-header">
        <h1>Message Drop</h1>
        <p class="subtitle">${isLogin ? "Welcome back" : "Create your account"}</p>
      </div>
      <div class="card">
        <h2>${isLogin ? "Log In" : "Sign Up"}</h2>
        <form id="authForm">
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="authUsername" placeholder="Choose a username" maxlength="30" required />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="authPassword" placeholder="${isLogin ? "Your password" : "Min 6 characters"}" required />
          </div>
          <div id="authError" class="error-text" style="display:none;"></div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px;">${isLogin ? "Log In" : "Create Account"}</button>
        </form>
        <div class="auth-toggle">
          ${
            isLogin
              ? "Don't have an account? <a onclick=\"navigate('/register')\">Sign up</a>"
              : "Already have an account? <a onclick=\"navigate('/login')\">Log in</a>"
          }
        </div>
      </div>
    </div>
  `;

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("authError");
    errEl.style.display = "none";

    const username = document.getElementById("authUsername").value.trim();
    const password = document.getElementById("authPassword").value;

    const endpoint = isLogin ? "/api/login" : "/api/register";
    const { ok, data } = await api(endpoint, {
      method: "POST",
      body: { username, password },
    });

    if (ok) {
      currentUser = data;
      navigate("/", true);
    } else {
      errEl.textContent = data.error || "Something went wrong";
      errEl.style.display = "block";
    }
  });
}

// ─── Sender Dashboard ─────────────────────────────────────────
async function renderDashboard() {
  app.innerHTML = `
    <nav class="topbar">
      <span class="topbar-brand" onclick="navigate('/')">Message Drop</span>
      <div class="topbar-actions">
        <span class="topbar-user">${esc(currentUser.username)}</span>
        <button class="btn btn-ghost" id="logoutBtn">Log out</button>
      </div>
    </nav>
    <div class="page">
      <div class="card" id="dashContent">
        <div class="empty-state"><p>Loading...</p></div>
      </div>
    </div>
  `;

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    currentUser = null;
    navigate("/", true);
  });

  const { ok, data } = await api("/api/drops/mine");
  if (!ok) return;

  const container = document.getElementById("dashContent");

  if (!data.drop) {
    renderDropSetup(container);
  } else {
    renderDropDashboard(container, data);
  }
}

function renderDropSetup(container) {
  container.innerHTML = `
    <h2>Create Your Drop</h2>
    <p class="subtitle" style="margin-bottom:20px;">Write a generic message that everyone will see when they visit your link</p>
    <form id="dropForm">
      <div class="form-group">
        <label>Generic Message (visible to all visitors)</label>
        <textarea id="genericMsg" placeholder="Hey everyone! Thanks for stopping by. Check if I left you a personal message below..." maxlength="1000" required></textarea>
      </div>
      <button type="submit" class="btn btn-primary">Create Drop</button>
    </form>
  `;

  document.getElementById("dropForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const genericMessage = document.getElementById("genericMsg").value.trim();
    if (!genericMessage) return;

    const { ok, data } = await api("/api/drops", {
      method: "POST",
      body: { genericMessage },
    });
    if (ok) {
      renderDashboard();
    } else {
      alert(data.error || "Failed to create drop");
    }
  });
}

function renderDropDashboard(container, { drop, messages, views }) {
  const shareUrl = `${window.location.origin}/${currentUser.username}`;

  container.innerHTML = `
    <div class="tabs">
      <button class="tab active" data-tab="messages">Messages</button>
      <button class="tab" data-tab="views">Views</button>
      <button class="tab" data-tab="settings">Settings</button>
    </div>

    <div id="tabMessages">
      <div class="share-box">
        <input type="text" value="${esc(shareUrl)}" readonly id="shareInput" />
        <button class="btn btn-copy" id="copyBtn">Copy Link</button>
      </div>

      <div style="margin-top:24px;">
        <h3>Add Personalized Message</h3>
        <form id="addMsgForm" style="margin-top:12px;">
          <div class="form-group">
            <label>Receiver Unlock Key</label>
            <input type="text" id="msgNickname" placeholder="e.g. Sunshine, 1234, any key" required />
          </div>
          <div class="form-group">
            <label>Secret Question</label>
            <input type="text" id="msgQuestion" placeholder="e.g. What do I call you when we're being lazy?" maxlength="200" required />
          </div>
          <div class="form-group">
            <label>Hint (optional, shown publicly)</label>
            <input type="text" id="msgHint" placeholder="e.g. Think weekend mornings" maxlength="100" />
          </div>
          <div class="form-group">
            <label>Secret Answer</label>
            <input type="text" id="msgPasscode" placeholder="The answer to your riddle" maxlength="50" required />
          </div>
          <div class="form-group">
            <label>Personal Message</label>
            <textarea id="msgContent" placeholder="Your secret message for this person..." maxlength="1000" required></textarea>
          </div>
          <div id="addMsgError" class="error-text" style="display:none;"></div>
          <div id="addMsgSuccess" class="success-text" style="display:none;"></div>
          <button type="submit" class="btn btn-primary">Add Message</button>
        </form>
      </div>

      <div style="margin-top:28px;">
        <h3>Sent Messages (${messages.length})</h3>
        <div class="message-list" id="msgList">
          ${
            messages.length === 0
              ? '<div class="empty-state"><p>No personalized messages yet</p></div>'
              : messages
                  .map(
                    (m) => `
              <div class="msg-card">
                <div class="msg-card-info">
                  <div class="msg-card-nickname">${esc(m.nickname)}</div>
                  <div class="msg-card-question">${esc(m.question)}</div>
                  <div class="msg-card-views">${m.view_count} view${m.view_count !== 1 ? "s" : ""}</div>
                </div>
                <div class="msg-card-actions">
                  <button class="btn btn-danger" data-delete="${m.id}">Delete</button>
                </div>
              </div>
            `,
                  )
                  .join("")
          }
        </div>
      </div>
    </div>

    <div id="tabViews" style="display:none;">
      <h3>Who Viewed Your Messages</h3>
      ${
        views.length === 0
          ? '<div class="empty-state"><p>No views yet</p></div>'
          : `<div class="views-list">
            ${views
              .map(
                (v) => `
              <div class="view-item">
                <span class="view-item-name">${esc(v.nickname)}</span>
                <span class="view-item-time">${timeAgo(v.viewed_at)}</span>
              </div>
            `,
              )
              .join("")}
          </div>`
      }
    </div>

    <div id="tabSettings" style="display:none;">
      <h3>Update Generic Message</h3>
      <form id="updateGenericForm" style="margin-top:12px;">
        <div class="form-group">
          <label>Generic Message</label>
          <textarea id="updateGenericMsg" maxlength="1000" required>${esc(drop.generic_message)}</textarea>
        </div>
        <button type="submit" class="btn btn-primary">Update</button>
        <div id="updateSuccess" class="success-text" style="display:none;"></div>
      </form>
    </div>
  `;

  // Tab switching
  container.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      container
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tabMessages").style.display =
        tab.dataset.tab === "messages" ? "" : "none";
      document.getElementById("tabViews").style.display =
        tab.dataset.tab === "views" ? "" : "none";
      document.getElementById("tabSettings").style.display =
        tab.dataset.tab === "settings" ? "" : "none";
    });
  });

  // Copy link
  document.getElementById("copyBtn").addEventListener("click", () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      const btn = document.getElementById("copyBtn");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy Link"), 2000);
    });
  });

  // Add message
  document
    .getElementById("addMsgForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("addMsgError");
      const successEl = document.getElementById("addMsgSuccess");
      errEl.style.display = "none";
      successEl.style.display = "none";

      const body = {
        nickname: document.getElementById("msgNickname").value.trim(),
        question: document.getElementById("msgQuestion").value.trim(),
        hint: document.getElementById("msgHint").value.trim(),
        passcode: document.getElementById("msgPasscode").value.trim(),
        content: document.getElementById("msgContent").value.trim(),
      };

      const { ok, data } = await api("/api/drops/messages", {
        method: "POST",
        body,
      });
      if (ok) {
        successEl.textContent = `Message for "${body.nickname}" added!`;
        successEl.style.display = "block";
        document.getElementById("addMsgForm").reset();
        setTimeout(() => renderDashboard(), 1000);
      } else {
        errEl.textContent = data.error || "Failed to add message";
        errEl.style.display = "block";
      }
    });

  // Delete messages
  container.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this message?")) return;
      const { ok } = await api(`/api/drops/messages?id=${btn.dataset.delete}`, {
        method: "DELETE",
      });
      if (ok) renderDashboard();
    });
  });

  // Update generic message
  document
    .getElementById("updateGenericForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const genericMessage = document
        .getElementById("updateGenericMsg")
        .value.trim();
      const { ok } = await api("/api/drops", {
        method: "POST",
        body: { genericMessage },
      });
      if (ok) {
        const el = document.getElementById("updateSuccess");
        el.textContent = "Updated!";
        el.style.display = "block";
        setTimeout(() => (el.style.display = "none"), 2000);
      }
    });
}

// ─── Receiver Page ────────────────────────────────────────────
async function renderReceiverPage(username) {
  app.innerHTML = `
    <nav class="topbar">
      <span class="topbar-brand" onclick="navigate('/')">Message Drop</span>
    </nav>
    <div class="page">
      <div class="empty-state"><p>Loading...</p></div>
    </div>
  `;

  const { ok, data } = await api(`/api/drop/${encodeURIComponent(username)}`);

  if (!ok) {
    app.innerHTML = `
      <nav class="topbar">
        <span class="topbar-brand" onclick="navigate('/')">Message Drop</span>
      </nav>
      <div class="page">
        <div class="not-found">
          <h1>Oops</h1>
          <p class="subtitle">No message drop found for "${esc(username)}"</p>
          <button class="btn btn-secondary" onclick="navigate('/')" style="margin-top:20px;">Go Home</button>
        </div>
      </div>
    `;
    return;
  }

  app.innerHTML = `
    <nav class="topbar">
      <span class="topbar-brand" onclick="navigate('/')">Message Drop</span>
    </nav>
    <div class="page">
      <div class="receiver-hero">
        <h1>A message from ${esc(data.username)}</h1>
      </div>

      <div class="generic-message">
        <div class="generic-message-text">${esc(data.genericMessage)}</div>
        <div class="generic-message-from">- ${esc(data.username)}</div>
      </div>

      ${
        data.messageCount > 0
          ? `
        <div class="inbox-section">
          <div class="inbox-toggle" id="inboxToggle">
            <h3>Check my inbox</h3>
            <p>See if there's a personal message just for me</p>
          </div>

          <div id="inboxForm" style="display:none; margin-top:20px;">
            <div class="card">
              <h3>Reveal my message</h3>
              <form id="checkForm" style="margin-top:16px;">
                <div class="form-group">
                  <label>Enter unlock key</label>
                  <input type="text" id="checkNickname" placeholder="Enter your unlock key..." autocomplete="off" required />
                </div>
                <div id="questionArea" style="display:none;">
                  <div class="form-group">
                    <label id="questionLabel">Answer the question</label>
                    <div id="questionHint" style="font-size:0.85rem; color:#8b5cf6; margin-bottom:8px;"></div>
                    <input type="text" id="checkPasscode" placeholder="Your answer..." maxlength="50" />
                  </div>
                </div>
                <div id="checkError" class="error-text" style="display:none;"></div>
                <button type="submit" class="btn btn-primary" style="margin-top:8px;">Unlock Message</button>
              </form>

              <div id="personalResult" style="display:none; margin-top:20px;"></div>
            </div>
          </div>
        </div>
      `
          : ""
      }

      <div class="cta-section">
        <button class="btn btn-secondary cta-btn" onclick="navigate('/register')">Create a message like this for friends and family</button>
      </div>
    </div>
  `;

  if (data.messageCount === 0) return;

  // Toggle inbox
  document.getElementById("inboxToggle").addEventListener("click", () => {
    document.getElementById("inboxToggle").style.display = "none";
    document.getElementById("inboxForm").style.display = "block";
  });

  // Autocomplete disabled for now
  const nicknameInput = document.getElementById("checkNickname");
  let questionRevealed = false;

  // Submit check
  document.getElementById("checkForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errEl = document.getElementById("checkError");
    errEl.style.display = "none";

    const nickname = nicknameInput.value.trim();
    if (!nickname) return;

    // Step 1: Enter unlock key → fetch question
    if (!questionRevealed) {
      const { ok, data: result } = await api(
        `/api/drop/${encodeURIComponent(username)}/check`,
        {
          method: "POST",
          body: { nickname, passcode: "__probe__" },
        },
      );

      const questionArea = document.getElementById("questionArea");
      if (ok && result.found) {
        document.getElementById("questionLabel").textContent = result.question;
        if (result.hint) {
          document.getElementById("questionHint").textContent =
            `Hint: ${result.hint}`;
        }
        questionArea.style.display = "block";
        nicknameInput.readOnly = true;
        questionRevealed = true;
      } else {
        errEl.textContent = result.error || "No message found for that key";
        errEl.style.display = "block";
      }
      return;
    }

    // Step 2: Answer question → unlock message
    const passcode = document.getElementById("checkPasscode").value.trim();
    if (!passcode) return;

    const { ok, data: result } = await api(
      `/api/drop/${encodeURIComponent(username)}/check`,
      {
        method: "POST",
        body: { nickname, passcode },
      },
    );

    const resultArea = document.getElementById("personalResult");

    if (ok && result.content) {
      resultArea.innerHTML = `
        <div class="personal-message reveal-message">
          <h3>Your Personal Message</h3>
          <div class="personal-message-text" style="margin-top:12px;">${esc(result.content)}</div>
        </div>
      `;
      resultArea.style.display = "block";
      document.getElementById("checkForm").style.display = "none";
    } else if (ok && !result.content) {
      errEl.textContent = "Wrong answer! Try again.";
      errEl.style.display = "block";
    } else {
      errEl.textContent = result.error || "Something went wrong";
      errEl.style.display = "block";
    }
  });
}

// ─── Not Found ────────────────────────────────────────────────
function renderNotFound() {
  app.innerHTML = `
    <nav class="topbar">
      <span class="topbar-brand" onclick="navigate('/')">Message Drop</span>
    </nav>
    <div class="page">
      <div class="not-found">
        <h1>404</h1>
        <p class="subtitle">Page not found</p>
        <button class="btn btn-secondary" onclick="navigate('/')" style="margin-top:20px;">Go Home</button>
      </div>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────
route();
