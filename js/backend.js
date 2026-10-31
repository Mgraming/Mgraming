// Supabase connection, sign-in, and background sync of the garage. Everything degrades to local-only
// when the library or the network isn't available (offline, or a sandboxed preview that blocks requests).
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { syncNow } from './sync.js';
import { state, persist } from './ui.js';

const lib = globalThis.supabase;
export const client = lib?.createClient && SUPABASE_URL.startsWith('https://')
  ? lib.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export const auth = { user: null, ready: false, syncing: false };
const listeners = new Set();
export const onAuthChange = fn => listeners.add(fn);
const notify = () => listeners.forEach(fn => fn(auth));

// Turns library errors into something an owner can act on.
export function friendlyError(e) {
  const m = String(e?.message || e || '');
  if (/fetch|network|Failed to fetch|NetworkError|Load failed/i.test(m)) return 'مش قادرين نوصل للسيرفر. اتأكد من النت وجرّب تاني.';
  if (/Invalid login credentials/i.test(m)) return 'الإيميل أو الباسورد غلط.';
  if (/Email not confirmed/i.test(m)) return 'لسه ما أكدتش الإيميل. افتح الرسالة اللي وصلتك ودوس على اللينك.';
  if (/User already registered/i.test(m)) return 'الإيميل ده عنده حساب بالفعل. سجّل دخول.';
  if (/Password should be at least/i.test(m)) return 'الباسورد لازم يكون ٦ حروف على الأقل.';
  if (/rate limit/i.test(m)) return 'محاولات كتير ورا بعض. استنى شوية وجرّب تاني.';
  return m || 'حصل خطأ. جرّب تاني.';
}

export async function initAuth() {
  if (!client) { auth.ready = true; notify(); return; }
  try {
    const { data } = await client.auth.getSession();
    auth.user = data.session?.user || null;
  } catch { /* offline: stay local */ }
  auth.ready = true;
  notify();
  client.auth.onAuthStateChange((_event, session) => {
    const was = auth.user?.id;
    auth.user = session?.user || null;
    if (auth.user && auth.user.id !== was) scheduleSync(0);
    notify();
  });
  if (auth.user) scheduleSync(0);
}

export async function signUp({ name, email, password }) {
  const { data, error } = await client.auth.signUp({
    email, password, options: { data: { full_name: name }, emailRedirectTo: location.href.split('#')[0] },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signIn({ email, password }) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function resetPassword(email) {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
  if (error) throw error;
}

// Signing out removes the garage from this device (it lives in the account), so the next person
// who signs in here doesn't inherit it. Unsynced changes are pushed first.
export async function signOut() {
  if (auth.user) await runSync();
  await client.auth.signOut();
  state.cars = [];
  state.activeCarId = null;
  state.sync = {};
  persist({ skipSync: true });
}

let timer = null;
export function scheduleSync(delay = 2000) {
  if (!client || !auth.user) return;
  clearTimeout(timer);
  timer = setTimeout(runSync, delay);
}

export async function runSync() {
  if (!client || !auth.user || auth.syncing) return;
  auth.syncing = true;
  notify();
  try {
    await syncNow(client, state, auth.user.id);
  } catch (e) {
    state.sync = { ...(state.sync || {}), error: friendlyError(e), errorAt: new Date().toISOString() };
  } finally {
    auth.syncing = false;
    persist({ skipSync: true });
    notify();
  }
}
