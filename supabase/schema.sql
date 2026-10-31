-- Car Passport (باسبور العربية) — Supabase schema.
-- Run once in the Supabase SQL editor (or `supabase db push`). Every table has Row Level Security:
-- owners see their own cars, workshops/stores manage their own pages, the public sees only approved listings.

-- gen_random_uuid() is built into Postgres 13+, no extension needed.

-- ---------- people ----------

create type public.app_role as enum ('owner', 'workshop', 'store', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,                -- private: never exposed to other users through policies below
  role        public.app_role not null default 'owner',
  created_at  timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Create a profile row automatically when someone signs up (phone OTP or email).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, phone, full_name)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- cars and service history ----------

create table public.cars (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  make             text not null,
  model            text not null,
  year             int  not null check (year between 1950 and 2100),
  color            text,
  plate            text,
  vin              text,
  purchase_date    date,
  purchase_km      int  not null default 0 check (purchase_km >= 0),
  license_expiry   date,
  insurance_expiry date,
  created_at       timestamptz not null default now()
);

create table public.workshops (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  area          text not null,
  lat           double precision not null,
  lng           double precision not null,
  specialties   text[] not null default '{}',
  hours         text,
  about         text,
  warranty_days int  not null default 30 check (warranty_days > 0),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  created_at    timestamptz not null default now()
);

create table public.workshop_services (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  name         text not null,
  price        numeric(10, 2) not null check (price > 0),
  sort         int not null default 0
);

create table public.service_records (
  id           uuid primary key default gen_random_uuid(),
  car_id       uuid not null references public.cars (id) on delete cascade,
  date         date not null,
  km           int  not null check (km >= 0),
  type         text not null,
  title        text,
  cost         numeric(10, 2) not null default 0,
  workshop_name text,
  workshop_id  uuid references public.workshops (id) on delete set null,
  parts        jsonb not null default '[]',
  notes        text,
  source       text not null default 'owner' check (source in ('owner', 'invoice', 'workshop')),
  invoice_path text,             -- object path in the private "invoices" storage bucket
  created_at   timestamptz not null default now()
);

-- ---------- workshop jobs, warranty, reviews ----------

-- A job is the workshop's own record of work done. When it is linked to a customer's car and both sides confirm,
-- the job becomes a verified service record and the warranty starts.
create table public.jobs (
  id               uuid primary key default gen_random_uuid(),
  workshop_id      uuid not null references public.workshops (id) on delete cascade,
  car_id           uuid references public.cars (id) on delete set null,
  record_id        uuid references public.service_records (id) on delete set null,
  date             date not null,
  service          text not null,
  customer_label   text,
  labor            numeric(10, 2) not null default 0 check (labor >= 0),
  parts_price      numeric(10, 2) not null default 0 check (parts_price >= 0),
  parts_cost       numeric(10, 2) not null default 0 check (parts_cost >= 0),
  platform_fee     numeric(10, 2) not null default 0 check (platform_fee >= 0),
  confirmed_by_workshop boolean not null default false,
  confirmed_by_owner    boolean not null default false,
  created_at       timestamptz not null default now()
);

create table public.warranties (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null unique references public.jobs (id) on delete cascade,
  starts_on   date not null,
  ends_on     date not null,
  scope       text not null default 'parts_and_labor',
  check (ends_on >= starts_on)
);

create table public.warranty_claims (
  id           uuid primary key default gen_random_uuid(),
  warranty_id  uuid not null references public.warranties (id) on delete cascade,
  opened_by    uuid not null references public.profiles (id),
  description  text not null,
  status       text not null default 'open' check (status in ('open', 'resolved', 'escalated', 'rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

-- One review per confirmed job, by the car owner.
create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null unique references public.jobs (id) on delete cascade,
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  rating      int  not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now()
);

-- ---------- chat ----------

create table public.conversations (
  id           uuid primary key default gen_random_uuid(),
  workshop_id  uuid not null references public.workshops (id) on delete cascade,
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (workshop_id, customer_id)
);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  kind             text not null default 'text' check (kind in ('text', 'booking', 'claim')),
  body             text not null check (length(body) between 1 and 4000),
  created_at       timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- ---------- parts stores ----------

create table public.parts_stores (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  area        text not null,
  lat         double precision not null,
  lng         double precision not null,
  hours       text,
  about       text,
  delivery    boolean not null default false,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'suspended')),
  created_at  timestamptz not null default now()
);

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  store_id   uuid not null references public.parts_stores (id) on delete cascade,
  name       text not null,
  brand      text,
  sku        text,
  category   text not null default 'other',
  condition  text not null default 'aftermarket' check (condition in ('original', 'oem', 'aftermarket', 'used')),
  fits       text[] not null default '{}',   -- empty = fits every car; otherwise "Make" or "Make Model"
  price      numeric(10, 2) not null check (price > 0),
  stock      int check (stock is null or stock >= 0),  -- null = not tracked
  active     boolean not null default true,
  updated_at timestamptz not null default now()
);
create index products_store_idx on public.products (store_id) where active;

create table public.orders (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references public.parts_stores (id) on delete restrict,
  buyer_id    uuid not null references public.profiles (id) on delete restrict,
  car_label   text,
  status      text not null default 'new' check (status in ('new', 'confirmed', 'ready', 'delivered', 'cancelled')),
  delivery    text not null default 'pickup' check (delivery in ('pickup', 'delivery')),
  note        text,
  total       numeric(10, 2) not null default 0,
  created_at  timestamptz not null default now()
);

create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  name        text not null,        -- snapshot at order time
  unit_price  numeric(10, 2) not null check (unit_price > 0),
  qty         int not null check (qty > 0)
);

-- ---------- ownership helpers ----------

create or replace function public.owns_car(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cars where id = c and owner_id = auth.uid());
$$;

create or replace function public.owns_workshop(w uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workshops where id = w and owner_id = auth.uid());
$$;

create or replace function public.owns_store(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parts_stores where id = s and owner_id = auth.uid());
$$;

create or replace function public.in_conversation(conv uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = conv and (c.customer_id = auth.uid() or public.owns_workshop(c.workshop_id))
  );
$$;

-- Public, privacy-safe view of a workshop's rating.
create view public.workshop_ratings with (security_invoker = true) as
  select workshop_id, round(avg(rating)::numeric, 1) as avg_rating, count(*) as review_count
  from public.reviews group by workshop_id;

-- ---------- row level security ----------

alter table public.profiles          enable row level security;
alter table public.cars              enable row level security;
alter table public.service_records   enable row level security;
alter table public.workshops         enable row level security;
alter table public.workshop_services enable row level security;
alter table public.jobs              enable row level security;
alter table public.warranties        enable row level security;
alter table public.warranty_claims   enable row level security;
alter table public.reviews           enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.parts_stores      enable row level security;
alter table public.products          enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;

-- profiles: you see and edit only yourself (phone numbers stay private).
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- cars and records: owner only.
create policy "own cars" on public.cars for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own records" on public.service_records for all using (public.owns_car(car_id)) with check (public.owns_car(car_id));

-- workshops: anyone can browse approved ones; owners manage their own; admins approve.
create policy "browse approved workshops" on public.workshops for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy "register workshop" on public.workshops for insert with check (owner_id = auth.uid() and status = 'pending');
create policy "edit own workshop" on public.workshops for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "admin moderates workshops" on public.workshops for update using (public.is_admin());

create policy "browse services" on public.workshop_services for select
  using (exists (select 1 from public.workshops w where w.id = workshop_id and (w.status = 'approved' or w.owner_id = auth.uid())));
create policy "manage own services" on public.workshop_services for all
  using (public.owns_workshop(workshop_id)) with check (public.owns_workshop(workshop_id));

-- jobs: the workshop sees all its jobs (that's its dashboard); a car owner sees jobs on their car.
create policy "workshop jobs" on public.jobs for all
  using (public.owns_workshop(workshop_id)) with check (public.owns_workshop(workshop_id));
create policy "owner sees jobs on own car" on public.jobs for select using (car_id is not null and public.owns_car(car_id));
create policy "owner confirms job" on public.jobs for update using (car_id is not null and public.owns_car(car_id));

create policy "see warranty" on public.warranties for select using (
  exists (select 1 from public.jobs j where j.id = job_id and (public.owns_workshop(j.workshop_id) or (j.car_id is not null and public.owns_car(j.car_id))))
  or public.is_admin());

create policy "see claims" on public.warranty_claims for select using (
  opened_by = auth.uid() or public.is_admin() or exists (
    select 1 from public.warranties w join public.jobs j on j.id = w.job_id
    where w.id = warranty_id and public.owns_workshop(j.workshop_id)));
create policy "owner opens claim in window" on public.warranty_claims for insert with check (
  opened_by = auth.uid() and exists (
    select 1 from public.warranties w join public.jobs j on j.id = w.job_id
    where w.id = warranty_id and j.car_id is not null and public.owns_car(j.car_id) and current_date between w.starts_on and w.ends_on));
create policy "workshop or admin updates claim" on public.warranty_claims for update using (
  public.is_admin() or exists (
    select 1 from public.warranties w join public.jobs j on j.id = w.job_id
    where w.id = warranty_id and public.owns_workshop(j.workshop_id)));

-- reviews: public to read; only the owner of the car on a job confirmed by both sides can write one.
create policy "read reviews" on public.reviews for select using (true);
create policy "review own confirmed job" on public.reviews for insert with check (
  author_id = auth.uid() and exists (
    select 1 from public.jobs j
    where j.id = job_id and j.workshop_id = reviews.workshop_id and j.car_id is not null
      and public.owns_car(j.car_id) and j.confirmed_by_workshop and j.confirmed_by_owner));

-- chat: only the two sides of a conversation.
create policy "see own conversations" on public.conversations for select
  using (customer_id = auth.uid() or public.owns_workshop(workshop_id));
create policy "customer starts conversation" on public.conversations for insert
  with check (customer_id = auth.uid() and exists (select 1 from public.workshops w where w.id = workshop_id and w.status = 'approved'));
create policy "read messages" on public.messages for select using (public.in_conversation(conversation_id));
create policy "send message" on public.messages for insert with check (sender_id = auth.uid() and public.in_conversation(conversation_id));

-- parts stores and catalogue: browse approved stores' active products; owners manage their own.
create policy "browse approved stores" on public.parts_stores for select
  using (status = 'approved' or owner_id = auth.uid() or public.is_admin());
create policy "register store" on public.parts_stores for insert with check (owner_id = auth.uid() and status = 'pending');
create policy "edit own store" on public.parts_stores for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "admin moderates stores" on public.parts_stores for update using (public.is_admin());

create policy "browse products" on public.products for select using (
  public.owns_store(store_id) or (active and exists (select 1 from public.parts_stores s where s.id = store_id and s.status = 'approved')));
create policy "manage own products" on public.products for all
  using (public.owns_store(store_id)) with check (public.owns_store(store_id));

-- orders: buyer and the selling store only. Buyers create; stores move the status.
create policy "see own orders" on public.orders for select using (buyer_id = auth.uid() or public.owns_store(store_id));
create policy "place order" on public.orders for insert with check (
  buyer_id = auth.uid() and status = 'new'
  and exists (select 1 from public.parts_stores s where s.id = store_id and s.status = 'approved'));
create policy "store updates order" on public.orders for update using (public.owns_store(store_id));
create policy "buyer cancels new order" on public.orders for update
  using (buyer_id = auth.uid() and status = 'new') with check (buyer_id = auth.uid() and status = 'cancelled');

create policy "see order items" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or public.owns_store(o.store_id))));
create policy "add items to own new order" on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid() and o.status = 'new'));

-- ---------- business rules enforced in the database ----------

-- When both sides confirm a job, start the warranty automatically.
create or replace function public.start_warranty() returns trigger
language plpgsql security definer set search_path = public as $$
declare days int;
begin
  if new.confirmed_by_workshop and new.confirmed_by_owner
     and not exists (select 1 from public.warranties where job_id = new.id) then
    select warranty_days into days from public.workshops where id = new.workshop_id;
    insert into public.warranties (job_id, starts_on, ends_on) values (new.id, new.date, new.date + days);
  end if;
  return new;
end;
$$;
create trigger jobs_start_warranty after insert or update of confirmed_by_workshop, confirmed_by_owner
  on public.jobs for each row execute function public.start_warranty();

-- Order totals are computed from the items, never trusted from the client.
create or replace function public.recalc_order_total() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set total = coalesce((
    select sum(unit_price * qty) from public.order_items where order_id = coalesce(new.order_id, old.order_id)), 0)
  where id = coalesce(new.order_id, old.order_id);
  return null;
end;
$$;
create trigger order_items_total after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_total();

-- Item price is the product's current price at order time.
create or replace function public.snapshot_item_price() returns trigger
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select price, name, store_id into p from public.products where id = new.product_id and active;
  if not found then raise exception 'product not available'; end if;
  if p.store_id <> (select store_id from public.orders where id = new.order_id) then
    raise exception 'product belongs to another store';
  end if;
  new.unit_price := p.price;
  new.name := p.name;
  return new;
end;
$$;
create trigger order_items_snapshot before insert on public.order_items
  for each row execute function public.snapshot_item_price();

-- Column guards: RLS decides *which rows* someone may update; these decide *which columns*.
create or replace function public.guard_moderation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    -- Nested IFs: PL/pgSQL resolves new.<field> even when an AND's first operand is false.
    if tg_table_name = 'profiles' then
      if new.role is distinct from old.role then raise exception 'only admins can change roles'; end if;
    elsif new.status is distinct from old.status then
      raise exception 'only admins can approve or suspend';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_moderation();
create trigger workshops_guard before update on public.workshops for each row execute function public.guard_moderation();
create trigger stores_guard before update on public.parts_stores for each row execute function public.guard_moderation();

-- A car owner may only confirm a job; amounts and links belong to the workshop.
create or replace function public.guard_job_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.owns_workshop(old.workshop_id) and not public.is_admin() then
    if (to_jsonb(new) - 'confirmed_by_owner') is distinct from (to_jsonb(old) - 'confirmed_by_owner') then
      raise exception 'car owners can only confirm the job';
    end if;
  end if;
  return new;
end;
$$;
create trigger jobs_guard before update on public.jobs for each row execute function public.guard_job_update();

-- Orders: only the status changes after creation, and the total is always derived from items.
create or replace function public.guard_order_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and pg_trigger_depth() = 1 then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'only the order status can change';
    end if;
  end if;
  return new;
end;
$$;
create trigger orders_guard before update on public.orders for each row execute function public.guard_order_update();

-- Stock moves when a store confirms an order, and returns if a counted order is cancelled.
create or replace function public.move_stock() returns trigger
language plpgsql security definer set search_path = public as $$
declare was boolean; now_counts boolean;
begin
  was := old.status in ('confirmed', 'ready', 'delivered');
  now_counts := new.status in ('confirmed', 'ready', 'delivered');
  if was <> now_counts then
    update public.products p set stock = greatest(0, p.stock + case when now_counts then -i.qty else i.qty end), updated_at = now()
    from public.order_items i where i.order_id = new.id and i.product_id = p.id and p.stock is not null;
  end if;
  return new;
end;
$$;
create trigger orders_stock after update of status on public.orders for each row execute function public.move_stock();

-- ---------- realtime chat and storage ----------

-- Realtime: stream new messages to both sides (Supabase creates this publication).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Storage: a private bucket for invoice photos, one folder per user (invoices/<user id>/...).
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false) on conflict do nothing;
    create policy "own invoice files" on storage.objects for all
      using (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = 'invoices' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;

-- ---------- API access ----------
-- New Supabase projects may not grant table access to the API roles automatically.
-- These grants only open the door; row level security above still decides which rows each user can touch.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.workshops, public.workshop_services, public.reviews, public.workshop_ratings,
  public.parts_stores, public.products to anon;
grant execute on all functions in schema public to anon, authenticated;

-- ---------- included migrations ----------
-- (fresh installs get these here; existing projects run supabase/migrations/*.sql instead)

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
