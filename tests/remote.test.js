import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { fakeSupabase } from './fake-supabase.js';

// remote.js pulls in UI modules that touch the DOM and storage at import time; give them inert stand-ins.
before(() => {});
globalThis.document = { getElementById: () => null, querySelectorAll: () => [], body: { dataset: {} } };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { hash: '' };

const backend = await import('../js/backend.js');
const R = await import('../js/remote.js');

const OWNER = { id: 'owner-1' }, ADMIN = { id: 'admin-1' }, CUSTOMER = { id: 'cust-1' };
const fake = fakeSupabase();
const as = user => backend.useClientForTests(fake, user);

test('workshop sign-up is pending: visible to its owner only, then public after approval', async () => {
  as(OWNER);
  const id = await R.saveWorkshop(null, {
    name: 'ورشة النور', area: 'مدينة نصر', lat: 30.05, lng: 31.33, specialties: ['mechanic'], hours: '١٠–١٠', about: '',
    services: [{ name: 'غيار زيت', price: 150 }, { name: 'فحص كمبيوتر', price: 300 }], owner: 'مجدي', phone: '0100',
  });
  assert.equal(R.myShops().length, 1);
  assert.equal(R.myShops()[0].pending, true);
  assert.deepEqual(R.myShops()[0].services.map(s => s.price), [150, 300]);
  assert.equal(R.hasRealMarket(), false);
  assert.equal(fake.table('profiles').length, 0); // profile update targets existing row only (none in fake) — no crash

  as(CUSTOMER);
  await R.loadMarket();
  assert.equal(R.cache.shops.length, 0, 'customers do not see pending workshops');

  as(ADMIN);
  const pending = await R.loadPending();
  assert.equal(pending.shops[0].status, 'pending');
  await R.setListingStatus('shop', id, 'approved');

  as(CUSTOMER);
  await R.loadMarket();
  assert.equal(R.cache.shops.length, 1);
  assert.equal(R.hasRealMarket(), true);

  // editing replaces the price list rather than appending to it
  as(OWNER);
  await R.saveWorkshop(id, { ...R.myShops()[0], services: [{ name: 'غيار زيت', price: 175 }] });
  assert.deepEqual(R.myShops()[0].services, [{ name: 'غيار زيت', price: 175 }]);
});

test('chat: one conversation per customer and workshop, messages mapped from the customer side', async () => {
  const shopId = R.cache.shops[0]?.id || fake.table('workshops')[0].id;
  as(CUSTOMER);
  const conv = await R.openConversation(shopId);
  const again = await R.openConversation(shopId);
  assert.equal(conv.id, again.id);
  await R.sendRemoteMessage(conv.id, 'بكام غيار الزيت؟');
  as(OWNER);
  const inbox = await R.loadInbox(shopId);
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].unread, 1);
  await R.sendRemoteMessage(conv.id, '١٥٠ مصنعية');
  const msgs = await R.loadMessages(conv);
  assert.deepEqual(msgs.map(m => m.from), ['me', 'ws']);
  assert.equal((await R.loadInbox(shopId))[0].unread, 0);
  R.watchConversation(conv.id, () => {});
  assert.equal(fake.channels.length, 1);
  R.stopWatching();
  assert.equal(fake.channels.length, 0);
});

test('jobs: saved with platform fee and read back in dashboard shape', async () => {
  const shopId = fake.table('workshops')[0].id;
  as(OWNER);
  const jid = await R.saveJob(shopId, { service: 'تغيير طرمبة', customer: 'أحمد', date: '2026-10-01', labor: 500, partsPrice: 1000, partsCost: 800 });
  const row = fake.table('jobs').find(j => j.id === jid);
  assert.equal(row.platform_fee, 150);
  assert.equal(row.confirmed_by_workshop, true);
  const jobs = await R.loadJobs(shopId);
  assert.deepEqual([jobs[0].labor, jobs[0].partsPrice, jobs[0].partsCost], [500, 1000, 800]);
  await R.saveJob(shopId, { ...jobs[0], labor: 600 });
  assert.equal((await R.loadJobs(shopId)).length, 1, 'editing updates the same job');
  await R.deleteJob(jid);
  assert.equal((await R.loadJobs(shopId)).length, 0);
});

test('parts store: catalogue upsert, removed items deactivated, orders flow to the store', async () => {
  as(OWNER);
  const catalog = [
    { id: 'p-local-1', name: 'فلتر زيت', brand: 'Denso', category: 'oil', condition: 'original', fits: ['Toyota'], price: 180, stock: 5 },
    { id: 'p-local-2', name: 'تيل فرامل', category: 'brakes', condition: 'aftermarket', fits: [], price: 900, stock: null },
  ];
  const sid = await R.saveStore(null, { name: 'محل', area: 'مدينة نصر', lat: 30, lng: 31, delivery: true }, catalog);
  assert.ok(catalog.every(p => R.isRemoteId(p.id)), 'local product ids became UUIDs');
  assert.equal(R.myStores()[0].catalog.length, 2);
  await R.saveStore(sid, { name: 'محل', area: 'مدينة نصر', lat: 30, lng: 31, delivery: true }, [catalog[0]]);
  assert.equal(R.myStores()[0].catalog.length, 1, 'removed product hidden');
  assert.equal(fake.table('products').length, 2, 'but kept for order history');

  as(ADMIN);
  await R.setListingStatus('store', sid, 'approved');
  as(CUSTOMER);
  await R.loadMarket();
  const product = R.cache.stores.find(s => s.id === sid).catalog[0];
  await R.placeOrder({ storeId: sid, lines: [{ productId: product.id, name: product.name, price: product.price, qty: 2 }], delivery: 'pickup', car: 'كيا Rio 2020' });
  const mine = await R.loadMyOrders();
  assert.equal(mine.length, 1);
  assert.equal(mine[0].buyer, 'me');
  assert.equal(mine[0].total, 360);
  assert.equal(mine[0].lines[0].qty, 2);

  as(OWNER);
  const incoming = await R.loadStoreOrders(sid);
  assert.equal(incoming[0].buyer, 'customer');
  await R.setOrderStatus(incoming[0].id, 'confirmed');
  assert.equal((await R.loadStoreOrders(sid))[0].status, 'confirmed');
});

test('role is read from the profile', async () => {
  fake.table('profiles').push({ id: ADMIN.id, role: 'admin' });
  as(ADMIN);
  assert.equal(await R.loadRole(), 'admin');
  as(CUSTOMER);
  assert.equal(await R.loadRole(), 'owner');
});

test('sign-up records the campaign source, and still works on a database without the column', async () => {
  const { state } = await import('../js/ui.js');
  state.attribution = { source: 'poster-test' };
  as(OWNER);
  await R.saveWorkshop(null, { name: 'ورشة مصدر', area: 'المعادي', lat: 29.96, lng: 31.25, specialties: ['oil'], services: [] });
  assert.equal(fake.table('workshops').at(-1).source, 'poster-test');

  // simulate a project that hasn't run migration 003
  const realFrom = fake.from;
  fake.from = t => {
    const q = realFrom(t);
    if (t !== 'workshops') return q;
    const insert = q.insert;
    q.insert = row => (row.source !== undefined ? { select: () => ({ single: async () => ({ data: null, error: { message: 'column "source" of relation "workshops" does not exist' } }) }) } : insert(row));
    return q;
  };
  const before = fake.table('workshops').length;
  await R.saveWorkshop(null, { name: 'ورشة قديمة', area: 'المعادي', lat: 29.96, lng: 31.25, specialties: ['oil'], services: [] });
  assert.equal(fake.table('workshops').length, before + 1);
  fake.from = realFrom;
  state.attribution = null;
});
