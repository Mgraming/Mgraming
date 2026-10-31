// Copy to js/config.js and fill in from Supabase → Project Settings → API Keys (and the Connect dialog for the URL).
// The publishable key (sb_publishable_...) is designed to be public: access is enforced by row level security
// in supabase/schema.sql. Never put a secret key (sb_secret_...) or the legacy service_role key here.
export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
