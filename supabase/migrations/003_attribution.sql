-- 003: remember where each workshop / parts store came from (campaign link, poster, referral) to measure outreach.
alter table public.workshops add column if not exists source text;
alter table public.parts_stores add column if not exists source text;
