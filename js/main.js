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

  // Lazy import so app.js is NOT evaluated until signed in
  const { initSimpleSpendApp } = await import("./appEntry.js");
  await initSimpleSpendApp({ supabase, user });
}

initAuthUI({
  supabase,
  onSignedIn: (user) => {
    showApp();
    startAppOnce(user);
  },
  onSignedOut: () => {
    showAuth();
    // appStarted stays true; sign-out reload is acceptable per spec.
  },
});
