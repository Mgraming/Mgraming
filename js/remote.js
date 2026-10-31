// Marketplace on Supabase: workshops, parts stores and catalogues, chat (realtime), workshop jobs, orders,
// and admin approval. Rows are mapped into the same shapes the screens already use for local data.
import { client, auth } from './backend.js';
import { newUuid, isUuid } from './sync.js';
import { PLATFORM_FEE_RATE } from './market.js';

export const online = () => !!(client && auth.user);
export const isRemoteId = id => isUuid(id);

async function check(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ---------- mappers (row → screen shape) ----------

export function toShop(w, ratings = {}) {
  return {
    id: w.id, ownerId: w.owner_id, name: w.name, area: w.area, lat: w.lat, lng: w.lng,
    specialties: w.specialties || [], brands: [], hours: w.hours || '', about: w.about || '',
    services: (w.workshop_services || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0)).map(s => ({ name: s.name, price: Number(s.price) })),
    warrantyDays: w.warranty_days || 30, status: w.status, pending: w.status !== 'approved', remote: true,
    rating: ratings[w.id] || null,
  };
}

export function toStore(s) {
  return {
    id: s.id, ownerId: s.owner_id, name: s.name, area: s.area, lat: s.lat, lng: s.lng, hours: s.hours || '',
    about: s.about || '', delivery: !!s.delivery, status: s.status, pending: s.status !== 'approved', remote: true,
    catalog: (s.products || []).filter(p => p.active !== false).map(p => ({
      id: p.id, name: p.name, brand: p.brand || '', sku: p.sku || '', category: p.category || 'other',
      condition: p.condition, fits: p.fits || [], price: Number(p.price), stock: p.stock,
    })),
    categories: [...new Set((s.products || []).map(p => p.category || 'other'))],
  };
}

export function toJob(j) {
  return {
    id: j.id, date: j.date, service: j.service, customer: j.customer_label || '', car: '',
    labor: Number(j.labor) || 0, partsPrice: Number(j.parts_price) || 0, partsCost: Number(j.parts_cost) || 0, remote: true,
  };
}

export function toOrder(o) {
  return {
    id: o.id, storeId: o.store_id, buyer: o.buyer_id === auth.user?.id ? 'me' : 'customer', date: (o.created_at || '').slice(0, 10),
    status: o.status, delivery: o.delivery, note: o.note || '', car: o.car_label || '', total: Number(o.total) || 0,
    lines: (o.order_items || []).map(i => ({ productId: i.product_id, name: i.name, price: Number(i.unit_price), qty: i.qty })),
    remote: true,
  };
}

// Messages are stored from the customer's point of view: 'me' = customer, 'ws' = workshop.
export function toMessage(m, customerId) {
  return { id: m.id, from: m.sender_id === customerId ? 'me' : 'ws', text: m.body, kind: m.kind, at: m.created_at };
}

// ---------- marketplace data ----------

export const cache = { shops: [], stores: [], loadedAt: 0, role: null };

export async function loadRole() {
  if (!online()) { cache.role = null; return null; }
  const row = await check(client.from('profiles').select('role').eq('id', auth.user.id).maybeSingle());
  cache.role = row?.role || 'owner';
  return cache.role;
}

// Approved listings for everyone, plus the signed-in user's own pending ones (RLS decides).
export async function loadMarket() {
  if (!client) return cache;
  const [shops, ratings, stores] = await Promise.all([
    check(client.from('workshops').select('*, workshop_services(name, price, sort)')),
    check(client.from('workshop_ratings').select('*')),
    check(client.from('parts_stores').select('*, products(*)')),
  ]);
  const r = Object.fromEntries(ratings.map(x => [x.workshop_id, { avg: Number(x.avg_rating), count: Number(x.review_count) }]));
  const me = auth.user?.id;
  // Admins can read everyone's pending listings; the public market shows approved ones and your own.
  const visible = x => x.status === 'approved' || x.owner_id === me;
  cache.shops = shops.filter(visible).map(w => toShop(w, r));
  cache.stores = stores.filter(visible).map(toStore);
  cache.loadedAt = Date.now();
  return cache;
}

export const hasRealMarket = () => cache.shops.some(s => s.status === 'approved') || cache.stores.some(s => s.status === 'approved');
export const myShops = () => cache.shops.filter(s => s.ownerId && s.ownerId === auth.user?.id);
export const myStores = () => cache.stores.filter(s => s.ownerId && s.ownerId === auth.user?.id);

async function saveProfile({ owner, phone }) {
  const patch = {};
  if (owner) patch.full_name = owner;
  if (phone) patch.phone = phone;
  if (Object.keys(patch).length) await check(client.from('profiles').update(patch).eq('id', auth.user.id));
}

// ---------- workshops ----------

export async function saveWorkshop(id, data) {
  const row = {
    name: data.name, area: data.area, lat: data.lat, lng: data.lng, specialties: data.specialties,
    hours: data.hours || null, about: data.about || null,
  };
  let shopId = id;
  if (id) await check(client.from('workshops').update(row).eq('id', id));
  else shopId = (await check(client.from('workshops').insert({ ...row, owner_id: auth.user.id }).select('id').single())).id;
  await check(client.from('workshop_services').delete().eq('workshop_id', shopId));
  if (data.services.length) {
    await check(client.from('workshop_services').insert(data.services.map((s, i) => ({ workshop_id: shopId, name: s.name, price: s.price, sort: i }))));
  }
  await saveProfile(data);
  await loadMarket();
  return shopId;
}

// ---------- jobs (workshop dashboard) ----------

export async function loadJobs(shopId) {
  const rows = await check(client.from('jobs').select('*').eq('workshop_id', shopId).order('date'));
  return rows.map(toJob);
}

export async function saveJob(shopId, job) {
  const revenue = (Number(job.labor) || 0) + (Number(job.partsPrice) || 0);
  const row = {
    id: isUuid(job.id) ? job.id : newUuid(), workshop_id: shopId, date: job.date, service: job.service,
    customer_label: job.customer || null, labor: job.labor || 0, parts_price: job.partsPrice || 0,
    parts_cost: job.partsCost || 0, platform_fee: Math.round(revenue * PLATFORM_FEE_RATE), confirmed_by_workshop: true,
  };
  await check(client.from('jobs').upsert(row));
  return row.id;
}

export async function deleteJob(id) {
  await check(client.from('jobs').delete().eq('id', id));
}

// ---------- chat ----------

export async function openConversation(workshopId) {
  const found = await check(client.from('conversations').select('id, customer_id')
    .eq('workshop_id', workshopId).eq('customer_id', auth.user.id).maybeSingle());
  if (found) return found;
  return check(client.from('conversations').insert({ workshop_id: workshopId, customer_id: auth.user.id }).select('id, customer_id').single());
}

export async function loadMessages(conv) {
  const rows = await check(client.from('messages').select('*').eq('conversation_id', conv.id).order('created_at'));
  return rows.map(m => toMessage(m, conv.customer_id));
}

export async function sendRemoteMessage(convId, text, kind = 'text') {
  await check(client.from('messages').insert({ conversation_id: convId, sender_id: auth.user.id, body: text, kind }));
}

export async function loadInbox(workshopId) {
  const rows = await check(client.from('conversations')
    .select('id, customer_id, created_at, messages(body, kind, created_at, sender_id)').eq('workshop_id', workshopId));
  return rows.map(c => {
    const msgs = (c.messages || []).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const last = msgs.at(-1);
    const lastReply = msgs.map(m => m.sender_id !== c.customer_id).lastIndexOf(true);
    return {
      id: c.id, customerId: c.customer_id, last: last?.body || '', lastAt: last?.created_at || c.created_at,
      unread: msgs.slice(lastReply + 1).filter(m => m.sender_id === c.customer_id).length,
    };
  }).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

let channel = null;
export function watchConversation(convId, onInsert) {
  stopWatching();
  channel = client.channel(`conv-${convId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` }, p => onInsert(p.new))
    .subscribe();
}
export function stopWatching() {
  if (channel) { client.removeChannel(channel); channel = null; }
}

// ---------- parts stores ----------

export async function saveStore(id, data, catalog) {
  const row = {
    name: data.name, area: data.area, lat: data.lat, lng: data.lng, hours: data.hours || null,
    about: data.about || null, delivery: !!data.delivery,
  };
  let storeId = id;
  if (id) await check(client.from('parts_stores').update(row).eq('id', id));
  else storeId = (await check(client.from('parts_stores').insert({ ...row, owner_id: auth.user.id }).select('id').single())).id;
  await replaceProducts(storeId, catalog);
  await saveProfile(data);
  await loadMarket();
  return storeId;
}

// Make the server catalogue match the edited list: upsert what's there, deactivate what was removed
// (products already on orders keep their history).
export async function replaceProducts(storeId, catalog) {
  for (const p of catalog) if (!isUuid(p.id)) p.id = newUuid();
  const rows = catalog.map(p => ({
    id: p.id, store_id: storeId, name: p.name, brand: p.brand || null, sku: p.sku || null, category: p.category || 'other',
    condition: p.condition || 'aftermarket', fits: p.fits || [], price: p.price, stock: p.stock ?? null, active: true,
  }));
  if (rows.length) await check(client.from('products').upsert(rows));
  const existing = await check(client.from('products').select('id').eq('store_id', storeId).eq('active', true));
  const keep = new Set(rows.map(r => r.id));
  const gone = existing.map(r => r.id).filter(pid => !keep.has(pid));
  if (gone.length) await check(client.from('products').update({ active: false }).in('id', gone));
}

// ---------- orders ----------

export async function placeOrder({ storeId, lines, delivery, note, car }) {
  const order = await check(client.from('orders').insert({
    store_id: storeId, buyer_id: auth.user.id, delivery, note: note || null, car_label: car || null,
  }).select('id').single());
  // Price and name are snapshotted by the server from the current product; these values are placeholders.
  await check(client.from('order_items').insert(lines.map(l => ({ order_id: order.id, product_id: l.productId, name: l.name, unit_price: l.price || 1, qty: l.qty }))));
  return order.id;
}

export async function loadMyOrders() {
  const rows = await check(client.from('orders').select('*, order_items(*)').eq('buyer_id', auth.user.id).order('created_at'));
  return rows.map(toOrder);
}

export async function loadStoreOrders(storeId) {
  const rows = await check(client.from('orders').select('*, order_items(*)').eq('store_id', storeId).order('created_at'));
  return rows.map(toOrder);
}

export async function setOrderStatus(id, status) {
  await check(client.from('orders').update({ status }).eq('id', id));
}

// ---------- admin ----------

export async function loadPending() {
  const [shops, stores, people] = await Promise.all([
    check(client.from('workshops').select('*, workshop_services(name, price, sort)').order('created_at', { ascending: false })),
    check(client.from('parts_stores').select('*, products(id)').order('created_at', { ascending: false })),
    check(client.from('profiles').select('id, full_name, phone')),
  ]);
  const who = Object.fromEntries(people.map(p => [p.id, p]));
  const withOwner = x => ({ ...x, owner: who[x.owner_id] || {} });
  return { shops: shops.map(withOwner), stores: stores.map(withOwner) };
}

export async function setListingStatus(kind, id, status) {
  await check(client.from(kind === 'shop' ? 'workshops' : 'parts_stores').update({ status }).eq('id', id));
}
