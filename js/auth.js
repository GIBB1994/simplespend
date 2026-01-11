// js/auth.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function makeSupabase() {
  const cfg = window.SS_CONFIG || {};
  const url = cfg.SUPABASE_URL;
  const key = cfg.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SS_CONFIG missing SUPABASE_URL / SUPABASE_ANON_KEY");
  }

  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function initAuthUI({ supabase, onSignedIn, onSignedOut }) {
  const elSignedOut = document.getElementById("signedOutUI");
  const elSignedIn = document.getElementById("signedInUI");
  const elEmail = document.getElementById("authEmail");
  const elPass = document.getElementById("authPassword");
  const btnIn = document.getElementById("btnSignIn");
  const btnOut = document.getElementById("btnSignOut");
  const elUserEmail = document.getElementById("userEmail");
  const elErr = document.getElementById("authError");

  function setError(msg) {
    if (!elErr) return;
    elErr.textContent = msg || "";
  }

  function showSignedOut() {
    if (elSignedOut) elSignedOut.classList.remove("hidden");
    if (elSignedIn) elSignedIn.classList.add("hidden");
  }

  function showSignedIn(email) {
    if (elSignedOut) elSignedOut.classList.add("hidden");
    if (elSignedIn) elSignedIn.classList.remove("hidden");
    if (elUserEmail) elUserEmail.textContent = email || "";
  }

  async function refreshUIFromSession() {
    setError("");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      showSignedOut();
      setError(error.message);
      onSignedOut?.();
      return;
    }

    const user = data?.session?.user;
    if (user) {
      showSignedIn(user.email);
      onSignedIn?.(user);
    } else {
      showSignedOut();
      onSignedOut?.();
    }
  }

  // Sign in handler
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = data?.user;
      showSignedIn(user?.email);
      onSignedIn?.(user);
    } catch (err) {
      showSignedOut();
      setError(err?.message || String(err));
    } finally {
      btnIn.disabled = false;
    }
  });

  // Sign out handler
  btnOut?.addEventListener("click", async () => {
    setError("");
    try {
      await supabase.auth.signOut();
      // You said reload is acceptable; guarantees app resets cleanly.
      location.reload();
    } catch (err) {
      setError(err?.message || String(err));
    }
  });

  // React to auth changes
  supabase.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    if (user) {
      showSignedIn(user.email);
      onSignedIn?.(user);
    } else {
      showSignedOut();
      onSignedOut?.();
    }
  });

  // Initial UI sync (covers refresh/session persistence)
  refreshUIFromSession();
}
