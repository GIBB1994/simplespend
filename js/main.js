// js/main.js
import { makeSupabase, initAuthUI } from "./auth.js";
import { initApp } from "./app.js";

const authGate = document.getElementById("authGate");
const appRoot = document.getElementById("appRoot");

function showApp() {
  if (authGate) authGate.style.display = "none";
  if (appRoot) appRoot.style.display = "";
}

function showGate() {
  if (appRoot) appRoot.style.display = "none";
  if (authGate) authGate.style.display = "";
}

const supabase = makeSupabase();

initAuthUI({
  supabase,
  onSignedIn: async (user) => {
    showApp();
    await initApp({ supabase, user });
  },
  onSignedOut: () => {
    showGate();
  }
});
