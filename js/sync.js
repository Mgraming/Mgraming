// Two-way sync of the owner's garage (cars, service records, fuel log, documents, photos) with Supabase.
// Local-first: the app always works from local state; when signed in, changes are pushed (diffed against the
// last synced snapshot) and the server copy is pulled back. Marketplace data is not synced here yet.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = s => typeof s === 'string' && UUID.test(s);
export const BUCKET = 'invoices';
const SIGNED_URL_SECONDS = 7 * 24 * 3600;
const TABLES = ['cars', 'service_records', 'fuel_logs', 'car_documents'];

export function newUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Older local ids aren't UUIDs; the database needs them to be.
export function ensureUuids(state) {
  for (const car of state.cars) {
    if (!isUuid(car.id)) {
      const id = newUuid();
      if (state.activeCarId === car.id) state.activeCarId = id;
      car.id = id;
    }
    for (const list of [car.records, car.fuel, car.docs]) {
      for (const item of list || []) if (!isUuid(item.id)) item.id = newUuid();
    }
  }
}

const n = v => (v === '' || v == null ? null : v);
const num = v => (v === '' || v == null ? null : Number(v));

export function toRows(state, userId) {
  const rows = { cars: [], service_records: [], fuel_logs: [], car_documents: [] };
  for (const c of state.cars) {
    rows.cars.push({
      id: c.id, owner_id: userId, make: c.make, model: c.model, year: Number(c.year), color: n(c.color), plate: n(c.plate),
      vin: n(c.vin), purchase_date: n(c.purchaseDate), purchase_km: Number(c.purchaseKm) || 0,
      license_expiry: n(c.licenseExpiry), insurance_expiry: n(c.insuranceExpiry), previous_owners: c.previousOwners || 0,
    });
    for (const r of c.records || []) {
      rows.service_records.push({
        id: r.id, car_id: c.id, date: r.date, km: Number(r.km) || 0, type: r.type, title: n(r.title), cost: Number(r.cost) || 0,
        workshop_name: n(r.workshop), parts: r.parts || [], notes: n(r.notes), source: r.source || 'owner',
        photo_path: r.photo ? n(r.photoPath) : null,
        extra: { ...(r.warranty ? { warranty: r.warranty } : {}), ...(r.reviewed ? { reviewed: true } : {}) },
      });
    }
    for (const f of c.fuel || []) {
      rows.fuel_logs.push({
        id: f.id, car_id: c.id, date: f.date, km: Number(f.km) || 0, liters: Number(f.liters), total: Number(f.total) || 0,
        full_tank: !!f.full, fuel_type: n(f.fuelType), station: n(f.station),
      });
    }
    for (const d of c.docs || []) {
      rows.car_documents.push({
        id: d.id, car_id: c.id, type: d.type, title: n(d.title), number: n(d.number), issued: n(d.issued), expiry: n(d.expiry),
        notes: n(d.notes), photo_path: d.photo ? n(d.photoPath) : null, photo_back_path: d.photoBack ? n(d.photoBackPath) : null,
      });
    }
  }
  return rows;
}

// Server rows → local cars. `photos` maps storage path → URL; `previous` lets us keep already-loaded images.
export function fromRows(rows, photos = {}, previous = []) {
  const prevItem = new Map();
  for (const c of previous) for (const it of [...(c.records || []), ...(c.docs || [])]) prevItem.set(it.id, it);
  // Prefer the server's signed URL so photos stop taking up the phone's limited local storage;
  // fall back to the local copy when no URL came back (e.g. the signing request failed).
  const img = (path, prevPath, prevImg) => (path ? photos[path] || (path === prevPath ? prevImg : null) || null : null);
  const byCar = id => x => x.car_id === id;
  return rows.cars.map(c => ({
    id: c.id, make: c.make, model: c.model, year: c.year, color: c.color || '', plate: c.plate || '', vin: c.vin || '',
    purchaseDate: c.purchase_date || '', purchaseKm: c.purchase_km || 0, licenseExpiry: c.license_expiry || '',
    insuranceExpiry: c.insurance_expiry || '', previousOwners: c.previous_owners || 0, createdAt: (c.created_at || '').slice(0, 10),
    records: rows.service_records.filter(byCar(c.id)).map(r => {
      const p = prevItem.get(r.id);
      return {
        id: r.id, date: r.date, km: r.km, type: r.type, title: r.title || '', cost: Number(r.cost) || 0, workshop: r.workshop_name || '',
        parts: r.parts || [], notes: r.notes || '', source: r.source, photoPath: r.photo_path || null,
        photo: img(r.photo_path, p?.photoPath, p?.photo), ...(r.extra || {}),
      };
    }),
    fuel: rows.fuel_logs.filter(byCar(c.id)).map(f => ({
      id: f.id, date: f.date, km: f.km, liters: Number(f.liters), total: Number(f.total) || 0, full: f.full_tank,
      fuelType: f.fuel_type || '', station: f.station || '',
    })),
    docs: rows.car_documents.filter(byCar(c.id)).map(d => {
      const p = prevItem.get(d.id);
      return {
        id: d.id, type: d.type, title: d.title || '', number: d.number || '', issued: d.issued || '', expiry: d.expiry || '',
        notes: d.notes || '', photoPath: d.photo_path || null, photoBackPath: d.photo_back_path || null,
        photo: img(d.photo_path, p?.photoPath, p?.photo), photoBack: img(d.photo_back_path, p?.photoBackPath, p?.photoBack),
      };
    }),
  }));
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function diff(rows, last = {}) {
  const upserts = {}, deletes = {}, hashes = {};
  for (const t of TABLES) {
    hashes[t] = {};
    const prev = last[t] || {};
    upserts[t] = rows[t].filter(r => {
      const h = hash(JSON.stringify(r));
      hashes[t][r.id] = h;
      return prev[r.id] !== h;
    });
    deletes[t] = Object.keys(prev).filter(id => !(id in hashes[t]));
  }
  return { upserts, deletes, hashes };
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const type = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

// Upload photos taken on this device (data: URLs) and remember their storage path on the item.
async function uploadPhotos(client, state, userId) {
  const jobs = [];
  for (const c of state.cars) {
    for (const r of c.records || []) jobs.push([r, 'photo', 'photoPath', `records/${r.id}`]);
    for (const d of c.docs || []) jobs.push([d, 'photo', 'photoPath', `docs/${d.id}-front`], [d, 'photoBack', 'photoBackPath', `docs/${d.id}-back`]);
  }
  for (const [item, field, pathField, name] of jobs) {
    const src = item[field];
    if (!src?.startsWith?.('data:')) continue;
    const stamp = hash(src);
    const path = `${userId}/${name}-${stamp}.jpg`;
    if (item[pathField] === path) continue;
    const { error } = await client.storage.from(BUCKET).upload(path, dataUrlToBlob(src), { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    item[pathField] = path;
  }
}

async function check(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

export async function pushChanges(client, state, userId) {
  ensureUuids(state);
  await uploadPhotos(client, state, userId);
  const sync = (state.sync ||= {});
  const { upserts, deletes, hashes } = diff(toRows(state, userId), sync.userId === userId ? sync.hashes : {});
  // Parents first on the way in; children first on the way out.
  for (const t of TABLES) if (upserts[t].length) await check(client.from(t).upsert(upserts[t]));
  for (const t of [...TABLES].reverse()) if (deletes[t].length) await check(client.from(t).delete().in('id', deletes[t]));
  Object.assign(sync, { userId, hashes });
  return { pushed: TABLES.reduce((s, t) => s + upserts[t].length, 0), deleted: TABLES.reduce((s, t) => s + deletes[t].length, 0) };
}

export async function pullAll(client, state, userId) {
  const rows = {};
  for (const t of TABLES) rows[t] = await check(client.from(t).select('*'));
  const paths = [...rows.service_records.map(r => r.photo_path), ...rows.car_documents.flatMap(d => [d.photo_path, d.photo_back_path])]
    .filter(Boolean);
  const photos = {};
  if (paths.length) {
    const signed = await check(client.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS));
    for (const s of signed || []) if (s.signedUrl) photos[s.path] = s.signedUrl;
  }
  state.cars = fromRows(rows, photos, state.cars);
  if (!state.cars.some(c => c.id === state.activeCarId)) state.activeCarId = state.cars[0]?.id || null;
  // What we just pulled is, by definition, in sync.
  const { hashes } = diff(toRows(state, userId), {});
  state.sync = { ...(state.sync || {}), userId, hashes, lastSync: new Date().toISOString(), error: null };
}

export async function syncNow(client, state, userId) {
  const res = await pushChanges(client, state, userId);
  await pullAll(client, state, userId);
  return res;
}
