// js/auth.js 
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export function makeSupabase() {
  const cfg = window.SS_CONFIG || {};
  const url = cfg.SUPABASE_URL;
  const key = cfg.SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Make the error painfully obvious (and actionable)
    const keys = cfg ? Object.keys(cfg) : [];
    throw new Error(
      "SS_CONFIG missing SUPABASE_URL / SUPABASE_ANON_KEY. " +
      "Loaded keys: " + JSON.stringify(keys)
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/**
 * Wires up auth UI + session handling.
 *
 * Expected DOM IDs (singletons; do NOT duplicate):
 * - signedOutUI (contains authEmail/authPassword/btnSignIn)
 * - authEmail
 * - authPassword
 * - btnSignIn
 * - authError
 *
 * Optional / recommended:
 * - accountBar (topbar account block)
 * - userEmail (inside accountBar)
 * - btnSignOut (inside accountBar)
 *
 * App gating:
 * - authGate (wrapper around sign-in card)
 * - appRoot (main app container)
 */
export function initAuthUI({ supabase, onSignedIn, onSignedOut }) {
  const elSignedOut = document.getElementById("signedOutUI");
  const elEmail = document.getElementById("authEmail");
  const elPass = document.getElementById("authPassword");
  const btnIn = document.getElementById("btnSignIn");
  const elErr = document.getElementById("authError");

  const gate = document.getElementById("authGate");
  const appRoot = document.getElementById("appRoot");

  const accountBar = document.getElementById("accountBar");
  const btnOut = document.getElementById("btnSignOut");
  const elUserEmail = document.getElementById("userEmail");

  function setError(msg) {
    if (!elErr) return;
    elErr.textContent = msg || "";
  }

  function showAuthUI() {
    if (gate) gate.style.display = "";
    if (appRoot) appRoot.style.display = "none";

    if (elSignedOut) elSignedOut.style.display = "";
    if (accountBar) accountBar.style.display = "none";
  }

  function showSignedInUI(email) {
    if (gate) gate.style.display = "none";
    if (appRoot) appRoot.style.display = "";

    if (accountBar) accountBar.style.display = "";
    if (elUserEmail) elUserEmail.textContent = email || "";
  }

  async function refreshUIFromSession() {
    setError("");
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      showAuthUI();
      setError(error.message);
      onSignedOut?.();
      return;
    }

    const user = data?.session?.user;

    if (user) {
      showSignedInUI(user.email);
      onSignedIn?.(user);
    } else {
      showAuthUI();
      onSignedOut?.();
    }
  }

  // ---- Sign in (button click) ----
  btnIn?.addEventListener("click", async () => {
    setError("");

    const email = (elEmail?.value || "").trim();
    const password = elPass?.value || "";

    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }

    btnIn.disabled = true;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const user = data?.user;
      showSignedInUI(user?.email);
      onSignedIn?.(user);
    } catch (err) {
      showAuthUI();
      setError(err?.message || String(err));
      onSignedOut?.();
    } finally {
      btnIn.disabled = false;
    }
  });

  // ---- Sign in (Enter key) ----
  function handleEnter(e) {
    if (e.key === "Enter") btnIn?.click();
  }
  elEmail?.addEventListener("keydown", handleEnter);
  elPass?.addEventListener("keydown", handleEnter);

  // ---- Sign out ----
  btnOut?.addEventListener("click", async () => {
    setError("");
    try {
      await supabase.auth.signOut();
      // Clean reset is fine
      location.reload();
    } catch (err) {
      setError(err?.message || String(err));
    }
  });

  // ---- Auth state changes (refresh token, sign-in/out) ----
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    if (user) {
      showSignedInUI(user.email);
      onSignedIn?.(user);
    } else {
      showAuthUI();
      onSignedOut?.();
    }
  });

  // Initial UI sync
  refreshUIFromSession();
}
