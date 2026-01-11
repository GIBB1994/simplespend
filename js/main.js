import { makeSupabase, initAuthUI } from "./auth.js";

// TODO: change this to your real app init function (existing app.js entry)
import { initSimpleSpendApp } from "./appEntry.js"; // you'll create this tiny wrapper

const supabase = makeSupabase();

let appStarted = false;

await initAuthUI({
  supabase,
  onSignedIn: async (user) => {
    if (!appStarted) {
      appStarted = true;
      await initSimpleSpendApp({ supabase, user });
    }
  },
  onSignedOut: () => {
    // optional: hide app content or refresh
    // location.reload();
  }
});
