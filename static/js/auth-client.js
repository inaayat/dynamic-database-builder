"""Client-side Neon Auth (Managed Better Auth) session + JWT for API calls."""

let authClient = null;
let authUrl = null;
let cachedToken = null;
let tokenExpiresAt = 0;
let currentUser = null;
let ready = false;

const TOKEN_SKEW_MS = 60_000;

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
    ready = true;
    currentUser = { id: "local-dev", email: "local@dev", name: "Local Dev" };
    return { enabled: false, user: currentUser };
  }

  authUrl = config.authUrl;
  const { createAuthClient } = await import(
    "https://esm.sh/@neondatabase/neon-js@latest/auth"
  );
  authClient = createAuthClient(authUrl, {
    fetchOptions: { credentials: "include" },
  });

  const session = await authClient.getSession();
  if (session?.data?.user) {
    currentUser = session.data.user;
    await refreshToken();
  }
  ready = true;
  return { enabled: true, user: currentUser };
}

async function refreshToken() {
  if (!authClient) return null;
  const result = await authClient.token();
  if (result?.error || !result?.data?.token) {
    cachedToken = null;
    tokenExpiresAt = 0;
    return null;
  }
  cachedToken = result.data.token;
  // Neon JWTs expire in 15 minutes
  tokenExpiresAt = Date.now() + 14 * 60_000;
  return cachedToken;
}

export async function getAccessToken() {
  if (!authClient) return null;
  if (cachedToken && Date.now() < tokenExpiresAt - TOKEN_SKEW_MS) {
    return cachedToken;
  }
  return refreshToken();
}

export async function signUp({ email, password, name }) {
  const result = await authClient.signUp.email({
    email,
    password,
    name: name || email.split("@")[0] || "User",
  });
  if (result?.error) throw new Error(result.error.message || "Sign up failed");
  await afterAuth();
  return currentUser;
}

export async function signIn({ email, password }) {
  const result = await authClient.signIn.email({ email, password });
  if (result?.error) throw new Error(result.error.message || "Sign in failed");
  await afterAuth();
  return currentUser;
}

export async function signInWithGoogle() {
  const result = await authClient.signIn.social({
    provider: "google",
    callbackURL: window.location.origin + "/",
  });
  if (result?.error) throw new Error(result.error.message || "Google sign-in failed");
  // Redirect flow — browser navigates away
}

export async function signOut() {
  if (authClient) await authClient.signOut();
  cachedToken = null;
  tokenExpiresAt = 0;
  currentUser = null;
}

async function afterAuth() {
  const session = await authClient.getSession();
  currentUser = session?.data?.user || null;
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
    if (isApi && !isPublic && authClient) {
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
    if (res.status === 401 && authClient && isApi && !isPublic) {
      // Force token refresh once, then retry
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
