// js/appEntry.js
import { initApp } from "./app.js";

export async function initSimpleSpendApp({ supabase, user }) {
  await initApp({ supabase, user });
}
