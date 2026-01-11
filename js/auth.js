import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

function getConfig() {
  const cfg = window.SS_CONFIG;
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
    throw new Error("Missing SS_CONFIG. Provide js/config.js (dev) or js/config.public.js (prod).");
  }
  return cfg;
}

export function makeSupabase() {
  const cfg = getConfig();
  return createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
}

export async function initAuthUI({ supabase, onSignedIn, onSignedOut }) {
  const authGate = document.getElementById("authGate");
  const signedOutUI = document.getElementById("signedOutUI");
  const signedInUI = document.getElementById("signedInUI");
  const userEmailEl = document.getElementById("userEmail");
  const authError = document.getElementById("authError");

  const emailEl = document.getElementById("authEmail");
  const passEl = document.getElementById("authPassword");
  const btnSignIn = document.getElementById("btnSignIn");
  const btnSignOut = document.getElementById("btnSignOut");

  function showError(msg) {
    authError.textContent = msg || "";
  }

  async function refresh() {
    const { data, error } = await supabase.auth.getSession();
    if (error) showError(error.message);

    const session = data?.session;
    if (session?.user) {
      signedOutUI.style.display = "none";
      signedInUI.style.display = "block";
      userEmailEl.textContent = session.user.email || session.user.id;
      showError("");
      onSignedIn?.(session.user);
    } else {
      signedInUI.style.display = "none";
      signedOutUI.style.display = "block";
      userEmailEl.textContent = "";
      onSignedOut?.();
    }
  }

  btnSignIn.onclick = async () => {
    showError("");
    const email = (emailEl.value || "").trim();
    const password = passEl.value || "";
    if (!email || !password) return showError("Email + password required.");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return showError(error.message);
    await refresh();
  };

  btnSignOut.onclick = async () => {
    showError("");
    const { error } = await supabase.auth.signOut();
    if (error) return showError(error.message);
    await refresh();
  };

  supabase.auth.onAuthStateChange(() => {
    refresh();
  });

  await refresh();

  // If config missing, show it clearly instead of silent fail
  if (!window.SS_CONFIG) {
    authGate.style.borderColor = "#b00020";
    showError("Missing SS_CONFIG. Create js/config.js (dev) or js/config.public.js (prod).");
  }
}
