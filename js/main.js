// js/main.js
import { makeSupabase, initAuthUI } from "./auth.js";
import { initSimpleSpendApp } from "./appEntry.js";

const supabase = makeSupabase();

let started = false;

function startOnce(user) {
  if (started) return;
  started = true;
  initSimpleSpendApp({ supabase, user });
}

initAuthUI({
  supabase,
  onSignedIn: (user) => {
    if (!user) return;
    startOnce(user);
  },
  onSignedOut: () => {
    // App stays blocked; reload on sign-out is handled in auth.js
  },
});
