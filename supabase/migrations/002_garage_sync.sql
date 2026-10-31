-- 002: sync the owner's garage (fuel log, documents wallet, odometer photos) and guard record trust levels.
-- Run once in the SQL editor on a project that already ran schema.sql.

alter table public.cars add column if not exists previous_owners int not null default 0;
alter table public.cars add column if not exists updated_at timestamptz not null default now();

alter table public.service_records drop constraint if exists service_records_source_check;
alter table public.service_records add constraint service_records_source_check
  check (source in ('owner', 'invoice', 'photo', 'workshop'));
alter table public.service_records add column if not exists photo_path text;
alter table public.service_records add column if not exists extra jsonb not null default '{}';
alter table public.service_records add column if not exists updated_at timestamptz not null default now();

create table if not exists public.fuel_logs (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references public.cars (id) on delete cascade,
  date        date not null,
  km          int  not null check (km >= 0),
  liters      numeric(8, 2) not null check (liters > 0),
  total       numeric(10, 2) not null default 0 check (total >= 0),
  full_tank   boolean not null default true,
  fuel_type   text,
  station     text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.car_documents (
  id               uuid primary key default gen_random_uuid(),
  car_id           uuid not null references public.cars (id) on delete cascade,
  type             text not null,
  title            text,
  number           text,
  issued           date,
  expiry           date,
  notes            text,
  photo_path       text,
  photo_back_path  text,
  updated_at       timestamptz not null default now()
);

alter table public.fuel_logs enable row level security;
alter table public.car_documents enable row level security;
drop policy if exists "own fuel" on public.fuel_logs;
create policy "own fuel" on public.fuel_logs for all using (public.owns_car(car_id)) with check (public.owns_car(car_id));
drop policy if exists "own documents" on public.car_documents;
create policy "own documents" on public.car_documents for all using (public.owns_car(car_id)) with check (public.owns_car(car_id));
grant select, insert, update, delete on public.fuel_logs, public.car_documents to authenticated;

-- Only a job confirmed by both sides may mark a record as workshop-verified; owners can't claim it themselves.
create or replace function public.guard_record_source() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'workshop' and auth.uid() is not null and not public.is_admin()
     and (tg_op = 'INSERT' or old.source is distinct from 'workshop')
     and not exists (select 1 from public.jobs j where j.record_id = new.id and j.confirmed_by_workshop and j.confirmed_by_owner) then
    new.source := case when new.photo_path is not null or new.invoice_path is not null then 'invoice' else 'owner' end;
  end if;
  return new;
end;
$$;
drop trigger if exists records_guard_source on public.service_records;
create trigger records_guard_source before insert or update on public.service_records
  for each row execute function public.guard_record_source();
