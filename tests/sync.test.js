import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncNow, pushChanges, pullAll, ensureUuids, isUuid, toRows, fromRows } from '../js/sync.js';

// In-memory stand-in for the supabase-js calls sync.js makes. RLS is tested separately against Postgres.
function fakeClient() {
  const db = { cars: new Map(), service_records: new Map(), fuel_logs: new Map(), car_documents: new Map() };
  const files = new Map();
  const calls = [];
  const client = {
    db, files, calls,
    from(t) {
      return {
        upsert: async rows => { calls.push(['upsert', t, rows.length]); for (const r of rows) db[t].set(r.id, structuredClone(r)); return { error: null }; },
        select: async () => ({ data: [...db[t].values()].map(r => structuredClone(r)), error: null }),
        delete: () => ({ in: async (_c, ids) => { calls.push(['delete', t, ids.length]); ids.forEach(id => db[t].delete(id)); return { error: null }; } }),
      };
    },
    storage: { from: () => ({
      upload: async (path, blob) => { files.set(path, blob.size); return { error: null }; },
      createSignedUrls: async paths => ({ data: paths.map(p => ({ path: p, signedUrl: 'https://signed/' + p })), error: null }),
    }) },
  };
  return client;
}

const PNG = 'data:image/jpeg;base64,' + Buffer.from('fake-image-bytes').toString('base64');
const localState = () => ({
  activeCarId: 'oldcar1',
  cars: [{ id: 'oldcar1', make: 'كيا', model: 'Rio', year: 2020, purchaseKm: 1000, purchaseDate: '2025-01-01',
    records: [{ id: 'r1', date: '2025-02-01', km: 2000, type: 'oil', cost: 900, source: 'invoice', photo: PNG, parts: [] }],
    fuel: [{ id: 'f1', date: '2025-02-02', km: 2100, liters: 40, total: 700, full: true, fuelType: 'b92' }],
    docs: [{ id: 'd1', type: 'license', expiry: '2026-01-01', photo: PNG }] }],
});

test('ensureUuids converts old local ids and keeps the active car', () => {
  const s = localState();
  ensureUuids(s);
  assert.ok(isUuid(s.cars[0].id) && isUuid(s.cars[0].records[0].id) && isUuid(s.cars[0].fuel[0].id));
  assert.equal(s.activeCarId, s.cars[0].id);
});

test('first sync pushes local data, uploads photos once, and round-trips', async () => {
  const c = fakeClient();
  const s = localState();
  await syncNow(c, s, 'user-1');
  assert.equal(c.db.cars.size, 1);
  assert.equal([...c.db.cars.values()][0].owner_id, 'user-1');
  assert.equal(c.db.service_records.size, 1);
  assert.equal(c.db.fuel_logs.size, 1);
  assert.equal(c.db.car_documents.size, 1);
  assert.equal(c.files.size, 2); // record photo + document front
  // photo now served from storage (frees local space), path remembered, fuel fields intact
  const car = s.cars[0];
  assert.match(car.records[0].photo, /^https:\/\/signed\//);
  assert.match(car.records[0].photoPath, /^user-1\/records\//);
  assert.equal(car.fuel[0].full, true);
  assert.equal(s.sync.userId, 'user-1');

  // nothing changed → nothing pushed
  c.calls.length = 0;
  const again = await pushChanges(c, s, 'user-1');
  assert.deepEqual([again.pushed, again.deleted, c.calls.length, c.files.size], [0, 0, 0, 2]);
});

test('edits and deletes are pushed as minimal changes', async () => {
  const c = fakeClient();
  const s = localState();
  await syncNow(c, s, 'u');
  s.cars[0].records[0].cost = 1000;
  s.cars[0].fuel = [];
  c.calls.length = 0;
  const res = await pushChanges(c, s, 'u');
  assert.deepEqual([res.pushed, res.deleted], [1, 1]);
  assert.equal([...c.db.service_records.values()][0].cost, 1000);
  assert.equal(c.db.fuel_logs.size, 0);
});

test('a second device pulls the account and gets signed photo URLs', async () => {
  const c = fakeClient();
  await syncNow(c, localState(), 'u');
  const other = { cars: [], activeCarId: null };
  await pullAll(c, other, 'u');
  assert.equal(other.cars.length, 1);
  assert.equal(other.activeCarId, other.cars[0].id);
  assert.match(other.cars[0].records[0].photo, /^https:\/\/signed\//);
  assert.match(other.cars[0].docs[0].photo, /^https:\/\/signed\//);
  assert.equal(other.cars[0].docs[0].photoBack, null);
});

test('rows round-trip through toRows/fromRows without losing fields', () => {
  const s = localState();
  ensureUuids(s);
  s.cars[0].records[0].warranty = { workshopId: 'demo-1', until: '2025-03-01', claims: [] };
  const rows = toRows(s, 'u');
  const back = fromRows(rows, {}, s.cars)[0];
  assert.equal(back.records[0].warranty.until, '2025-03-01');
  assert.equal(back.fuel[0].fuelType, 'b92');
  assert.equal(back.purchaseKm, 1000);
});
