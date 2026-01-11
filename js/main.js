// js/main.js
import { makeSupabase, initAuthUI } from "./auth.js";

const supabase = makeSupabase();

let appStarted = false;

function showApp() {
  const gate = document.getElementById("authGate");
  const appRoot = document.getElementById("appRoot");
  if (gate) gate.style.display = "none";
  if (appRoot) appRoot.style.display = "";
}

function showAuth() {
  const gate = document.getElementById("authGate");
  const appRoot = document.getElementById("appRoot");
  if (appRoot) appRoot.style.display = "none";
  if (gate) gate.style.display = "";
}

async function startAppOnce(user) {
  if (appStarted) return;
  if (!user) return;

  appStarted = true;
  showApp();

  try {
    // Lazy import so app.js is NOT evaluated until signed in
    const { initSimpleSpendApp } = await import("./appEntry.js");
    await initSimpleSpendApp({ supabase, user });
  } catch (err) {
    console.error("App boot failed:", err);

    // Roll back to auth screen
    appStarted = false;
    showAuth();

    const ae = document.getElementById("authError");
    if (ae) {
      ae.textContent =
        err?.message || "Failed to start app. See console for details.";
    }
  }
}

initAuthUI({
  supabase,
  onSignedIn: (user) => {
    showApp();
    startAppOnce(user);
  },
  onSignedOut: () => {
    // Spec allows reload; UI fallback is still correct
    showAuth();
  },
});
