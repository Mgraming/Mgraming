-- Scenario tests for the policies and triggers in schema.sql. Stops with an exception on the first broken rule.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- users: a1/a2 car owners, b1 workshop, c1 parts store, d1 admin
insert into auth.users (id, phone) values
  ('00000000-0000-0000-0000-0000000000a1', '+201000000001'),
  ('00000000-0000-0000-0000-0000000000a2', '+201000000002'),
  ('00000000-0000-0000-0000-0000000000b1', '+201000000003'),
  ('00000000-0000-0000-0000-0000000000c1', '+201000000004'),
  ('00000000-0000-0000-0000-0000000000d1', '+201000000005');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1';

create schema test;
grant usage on schema test to authenticated;
create function test.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create function test.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok: %', what;
end $$;
grant execute on all functions in schema test to authenticated;

-- a1 adds a car; a2 cannot see it
select test.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.cars (id, owner_id, make, model, year) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'تويوتا', 'Corolla', 2019);
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a2');
select test.expect((select count(*) from public.cars) = 0, 'other owners cannot see my car');
select test.expect((select count(*) from public.profiles) = 1, 'profiles: only my own (phones private)');
reset role;

-- workshop registers (pending) and cannot approve itself; the public sees it only after an admin approves
select test.as_user('00000000-0000-0000-0000-0000000000b1');
insert into public.workshops (id, owner_id, name, area, lat, lng, specialties) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'ورشة', 'مدينة نصر', 30.05, 31.33, '{mechanic}');
do $$ begin
  update public.workshops set status = 'approved';
  raise exception 'FAILED: workshop self-approved';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: workshop cannot approve itself';
end $$;
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.expect((select count(*) from public.workshops) = 0, 'pending workshop hidden from public');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000d1');
update public.workshops set status = 'approved';
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.expect((select count(*) from public.workshops) = 1, 'approved workshop visible');

-- chat: a1 opens a conversation; a2 cannot read it; the workshop can and replies
insert into public.conversations (id, workshop_id, customer_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1');
insert into public.messages (conversation_id, sender_id, body) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'بكام غيار الزيت؟');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a2');
select test.expect((select count(*) from public.messages) = 0, 'outsider cannot read the chat');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000b1');
select test.expect((select count(*) from public.messages) = 1, 'workshop reads its chat');
insert into public.messages (conversation_id, sender_id, body) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '١٥٠ مصنعية');

-- workshop logs a job on a1's car; no warranty or review until both sides confirm
insert into public.jobs (id, workshop_id, car_id, date, service, labor, parts_price, parts_cost, confirmed_by_workshop) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   current_date, 'تغيير طرمبة', 500, 1000, 800, true);
select test.expect((select count(*) from public.warranties) = 0, 'no warranty before the owner confirms');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  insert into public.reviews (job_id, workshop_id, author_id, rating) values
    ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 5);
  raise exception 'FAILED: review before confirmation';
exception when insufficient_privilege then raise notice 'ok: cannot review an unconfirmed job';
end $$;
do $$ begin
  update public.jobs set labor = 1;
  raise exception 'FAILED: owner changed amounts';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: owner cannot change job amounts';
end $$;
update public.jobs set confirmed_by_owner = true;
select test.expect((select ends_on - starts_on from public.warranties) = 30, 'warranty starts for 30 days on confirmation');
insert into public.reviews (job_id, workshop_id, author_id, rating, body) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 5, 'ممتاز');
insert into public.warranty_claims (warranty_id, opened_by, description)
  select id, '00000000-0000-0000-0000-0000000000a1', 'المشكلة رجعت' from public.warranties;
select test.expect((select avg_rating from public.workshop_ratings) = 5.0, 'rating view');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  insert into public.reviews (job_id, workshop_id, author_id, rating) values
    ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', 1);
  raise exception 'FAILED: stranger reviewed';
exception when insufficient_privilege then raise notice 'ok: only the customer of the job can review';
end $$;
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000b1');
select test.expect((select count(*) from public.warranty_claims) = 1, 'workshop sees the claim on its job');

-- parts: store registers, admin approves, buyer orders; price and total come from the server
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.parts_stores (id, owner_id, name, area, lat, lng) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'محل', 'مدينة نصر', 30.05, 31.33);
insert into public.products (id, store_id, name, price, stock, fits) values
  ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'فلتر زيت', 180, 5, '{Toyota}');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.expect((select count(*) from public.products) = 0, 'pending store catalogue hidden');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000d1');
update public.parts_stores set status = 'approved';
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a1');
select test.expect((select count(*) from public.products) = 1, 'buyer browses approved catalogue');
insert into public.orders (id, store_id, buyer_id, total) values
  ('70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 1);
insert into public.order_items (order_id, product_id, name, unit_price, qty) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'x', 1, 2);
select test.expect((select total from public.orders) = 360, 'order total computed from the current product price');
do $$ begin
  update public.orders set total = 1;
  raise exception 'FAILED: buyer edited total';
exception when raise_exception then
  if sqlerrm like 'FAILED%' then raise; end if;
  raise notice 'ok: buyer cannot edit the total';
end $$;
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000c1');
update public.orders set status = 'confirmed';
select test.expect((select stock from public.products) = 3, 'stock decreases on confirmation');
update public.orders set status = 'cancelled';
select test.expect((select stock from public.products) = 5, 'stock returns on cancellation');
reset role;
select test.as_user('00000000-0000-0000-0000-0000000000a2');
select test.expect((select count(*) from public.orders) = 0, 'other users cannot see my orders');
reset role;
select 'ALL RLS TESTS PASSED' as result;
