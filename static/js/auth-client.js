/* Client-side Neon Auth via Better Auth HTTP API (no CDN SDK). */

let authUrl = null;
let cachedToken = null;
let tokenExpiresAt = 0;
let currentUser = null;
let ready = false;
let authEnabled = false;

const TOKEN_SKEW_MS = 60_000;

function authFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  // Required by Neon Auth for trusted-domain checks
  if (!headers.has("Origin")) {
    headers.set("Origin", window.location.origin);
  }
  return fetch(`${authUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

export function isAuthReady() {
  return ready;
}

export function getUser() {
  return currentUser;
}

export async function loadAuthConfig() {
  const res = await fetch("/api/auth/config");
  if (!res.ok) throw new Error("Failed to load auth config");
  return res.json();
}

export async function initAuth() {
  const config = await loadAuthConfig();
  if (!config.enabled || !config.authUrl) {
    authEnabled = false;
    ready = true;
    currentUser = { id: "local-dev", email: "local@dev", name: "Local Dev" };
    return { enabled: false, user: currentUser };
  }

  authEnabled = true;
  authUrl = config.authUrl.replace(/\/$/, "");

  const session = await getSession();
  if (session?.user) {
    currentUser = session.user;
    await refreshToken();
  }
  ready = true;
  return { enabled: true, user: currentUser };
}

async function getSession() {
  const res = await authFetch("/get-session", { method: "GET" });
  if (!res.ok) return null;
  const data = await res.json();
  // Better Auth may return { user, session } or { data: { user, session } }
  if (data?.user) return data;
  if (data?.data?.user) return data.data;
  return null;
}

async function refreshToken() {
  if (!authUrl) return null;
  const res = await authFetch("/token", { method: "GET" });
  if (!res.ok) {
    cachedToken = null;
    tokenExpiresAt = 0;
    return null;
  }
  const data = await res.json();
  const token = data?.token || data?.data?.token;
  if (!token) {
    cachedToken = null;
    tokenExpiresAt = 0;
    return null;
  }
  cachedToken = token;
  tokenExpiresAt = Date.now() + 14 * 60_000;
  return cachedToken;
}

export async function getAccessToken() {
  if (!authEnabled) return null;
  if (cachedToken && Date.now() < tokenExpiresAt - TOKEN_SKEW_MS) {
    return cachedToken;
  }
  return refreshToken();
}

export async function signUp({ email, password, name }) {
  const res = await authFetch("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      name: name || email.split("@")[0] || "User",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Sign up failed (${res.status})`);
  }
  await afterAuth();
  return currentUser;
}

export async function signIn({ email, password }) {
  const res = await authFetch("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Sign in failed (${res.status})`);
  }
  await afterAuth();
  return currentUser;
}

export async function signInWithGoogle() {
  const callbackURL = `${window.location.origin}/`;
  const res = await authFetch("/sign-in/social", {
    method: "POST",
    body: JSON.stringify({ provider: "google", callbackURL }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || "Google sign-in failed");
  }
  const redirectTo = data.url || data.redirectTo || data.data?.url;
  if (redirectTo) {
    window.location.href = redirectTo;
    return;
  }
  throw new Error("Google sign-in did not return a redirect URL");
}

export async function signOut() {
  if (authUrl) {
    try {
      await authFetch("/sign-out", { method: "POST", body: "{}" });
    } catch {
      // ignore
    }
  }
  cachedToken = null;
  tokenExpiresAt = 0;
  currentUser = null;
}

async function afterAuth() {
  const session = await getSession();
  currentUser = session?.user || null;
  if (!currentUser) {
    // Some responses embed user on sign-in/up payload; try token path anyway
    await refreshToken();
    return;
  }
  await refreshToken();
}

/** Patch fetch so /api/* calls (except public) include Bearer JWT. */
export function installAuthenticatedFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const isApi = typeof url === "string" && url.startsWith("/api/");
    const isPublic =
      url.startsWith("/api/health") || url.startsWith("/api/auth/config");
    if (isApi && !isPublic && authEnabled) {
      const token = await getAccessToken();
      if (token) {
        const headers = new Headers(init.headers || {});
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${token}`);
        }
        init = { ...init, headers };
      }
    }
    const res = await original(input, init);
    if (res.status === 401 && authEnabled && isApi && !isPublic) {
      cachedToken = null;
      const token = await refreshToken();
      if (token) {
        const headers = new Headers(init.headers || {});
        headers.set("Authorization", `Bearer ${token}`);
        return original(input, { ...init, headers });
      }
    }
    return res;
  };
}

export function mountLoginGate({ onAuthenticated }) {
  const existing = document.getElementById("auth-gate");
  if (existing) existing.remove();

  const gate = document.createElement("div");
  gate.id = "auth-gate";
  gate.className = "auth-gate";
  gate.innerHTML = `
    <div class="auth-card">
      <h1>Sign in</h1>
      <p class="auth-sub">Shared workspace — sign in to continue</p>
      <form id="auth-form" class="auth-form">
        <label>
          <span>Email</span>
          <input type="email" name="email" autocomplete="email" required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required minlength="8" />
        </label>
        <p id="auth-error" class="auth-error" hidden></p>
        <div class="auth-actions">
          <button type="submit" class="btn btn-primary" data-mode="signin">Sign in</button>
          <button type="button" class="btn" id="auth-signup-btn">Create account</button>
        </div>
      </form>
      <div class="auth-divider"><span>or</span></div>
      <button type="button" class="btn auth-google" id="auth-google-btn">Continue with Google</button>
    </div>
  `;
  document.body.appendChild(gate);

  const form = gate.querySelector("#auth-form");
  const errorEl = gate.querySelector("#auth-error");
  const signupBtn = gate.querySelector("#auth-signup-btn");
  let mode = "signin";

  function showError(msg) {
    errorEl.hidden = !msg;
    errorEl.textContent = msg || "";
  }

  signupBtn.addEventListener("click", async () => {
    mode = "signup";
    showError("");
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    if (!email || !password) {
      showError("Enter email and password to create an account.");
      return;
    }
    signupBtn.disabled = true;
    try {
      await signUp({ email, password });
      if (!currentUser) throw new Error("Signed up but no session yet — try signing in.");
      gate.remove();
      onAuthenticated?.(currentUser);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      signupBtn.disabled = false;
      mode = "signin";
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const fd = new FormData(form);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    const submitBtn = form.querySelector('[type="submit"]');
    submitBtn.disabled = true;
    try {
      if (mode === "signup") {
        await signUp({ email, password });
      } else {
        await signIn({ email, password });
      }
      if (!currentUser) throw new Error("No session after sign-in.");
      gate.remove();
      onAuthenticated?.(currentUser);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      submitBtn.disabled = false;
    }
  });

  gate.querySelector("#auth-google-btn").addEventListener("click", async () => {
    showError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      showError(err.message || String(err));
    }
  });
}

export function mountUserChip({ mount, onSignedOut }) {
  if (!mount) return;
  const user = currentUser;
  if (!user) {
    mount.innerHTML = "";
    return;
  }
  mount.innerHTML = `
    <div class="auth-user-chip">
      <span class="auth-user-email" title="${user.email || ""}">${user.name || user.email || "User"}</span>
      <button type="button" class="btn btn-sm" id="auth-signout-btn">Sign out</button>
    </div>
  `;
  mount.querySelector("#auth-signout-btn")?.addEventListener("click", async () => {
    await signOut();
    onSignedOut?.();
  });
}
