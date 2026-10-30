import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, currentKm, odometerAnomalies, reminders, costs, trustScore, mask,
  buildReport, expandReport, encodeReport, decodeReport, workshopDirectory,
} from '../js/logic.js';

const car = () => ({
  make: 'تويوتا', model: 'كورولا', year: 2019, plate: 'ب ج د 1234', vin: 'JTDBR32E720123456',
  purchaseDate: '2023-01-10', purchaseKm: 40000, licenseExpiry: '2026-11-10',
  records: [
    { id: 'a', date: '2023-02-01', km: 41000, type: 'oil', cost: 900, source: 'invoice', parts: [{ name: 'فلتر زيت', grade: 'original' }] },
    { id: 'b', date: '2024-03-01', km: 52000, type: 'brakes', cost: 2500, source: 'owner', parts: [] },
    { id: 'c', date: '2026-05-01', km: 60000, type: 'oil', cost: 1500, source: 'invoice', parts: [] },
  ],
});

test('addMonths clamps to the end of shorter months', () => {
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2023-08-15', 6), '2024-02-15');
});

test('currentKm is the highest reading', () => {
  assert.equal(currentKm(car()), 60000);
  assert.equal(currentKm({ purchaseKm: 5, records: [] }), 5);
});

test('odometer anomaly flags a reading lower than an earlier one', () => {
  const c = car();
  assert.deepEqual(odometerAnomalies(c), []);
  c.records.push({ id: 'x', date: '2026-06-01', km: 45000, type: 'repair', source: 'owner' });
  const [a] = odometerAnomalies(c);
  assert.equal(a.recordId, 'x');
  assert.equal(a.prevKm, 60000);
});

test('reminders: oil due by date, license soon, sorted by urgency', () => {
  const r = reminders(car(), '2026-11-02');
  const oil = r.find(x => x.key === 'oil');
  assert.equal(oil.dueKm, 70000);
  assert.equal(oil.dueDate, '2026-11-01');
  assert.equal(oil.status, 'overdue');
  assert.equal(r.find(x => x.key === 'license').status, 'soon');
  assert.equal(r[0].status, 'overdue');
});

test('reminders: empty history asks for oil only', () => {
  const r = reminders({ purchaseKm: 0, records: [] }, '2026-01-01');
  assert.deepEqual(r.map(x => [x.key, x.status]), [['oil', 'unknown']]);
});

test('costs aggregate by year and per km', () => {
  const c = costs(car());
  assert.equal(c.total, 4900);
  assert.equal(c.byYear['2026'], 1500);
  assert.equal(c.perKm, 4900 / 20000);
});

test('trustScore rewards invoices and penalises anomalies', () => {
  const good = trustScore(car(), '2026-06-01');
  assert.equal(good.parts.odometer, 30);
  assert.equal(good.parts.regularity, 20); // brakes (2024-03 + 24 months) are overdue
  assert.equal(good.parts.documentation, 27); // 2 of 3 records with invoice
  const c = car();
  c.records.push({ id: 'x', date: '2026-06-01', km: 1000, type: 'repair', source: 'owner' });
  assert.equal(trustScore(c, '2026-06-01').parts.odometer, 0);
  assert.equal(trustScore({ records: [] }, '2026-01-01').score, 0);
});

test('mask hides all but the tail', () => {
  assert.equal(mask('ABC123'), '••••23');
  assert.equal(mask(''), '');
});

test('report round-trips through the share code and hides identifiers', async () => {
  const report = buildReport(car(), { includeCosts: false, today: '2026-10-29' });
  const code = await encodeReport(report);
  assert.match(code, /^[zj][A-Za-z0-9_-]+$/);
  const back = expandReport(await decodeReport(code));
  assert.equal(back.car.records.length, 3);
  assert.equal(back.car.records[0].cost, null);
  assert.equal(back.car.records[0].parts[0].grade, 'original');
  assert.ok(!back.car.plate.includes('ب'));
  assert.equal(back.car.vin.slice(-6), '123456');
});

test('workshopDirectory merges saved workshops with visit stats by name', () => {
  const cars = [{ records: [
    { date: '2025-01-01', type: 'oil', cost: 900, workshop: 'مركز النور' },
    { date: '2025-06-01', type: 'brakes', cost: 1100, workshop: ' مركز  النور ' },
    { date: '2025-07-01', type: 'odometer', workshop: 'مركز النور' },
    { date: '2025-03-01', type: 'repair', cost: 500, workshop: 'ورشة الأمل' },
  ] }];
  const dir = workshopDirectory(cars, [{ id: 'w1', name: 'ورشة الأمل', rating: 5, phone: '0100' }]);
  assert.equal(dir[0].name, 'ورشة الأمل'); // rated first
  assert.equal(dir[0].phone, '0100');
  const noor = dir.find(w => w.name === 'مركز النور');
  assert.equal(noor.visits, 2);
  assert.equal(noor.spent, 2000);
  assert.equal(noor.lastDate, '2025-06-01');
});

import { BRANDS, findBrand, yearOptions, mapsSearchUrl } from '../js/cars.js';

test('car catalogue: unique brands, non-empty unique models, year range', () => {
  assert.equal(new Set(BRANDS.map(b => b.id)).size, BRANDS.length);
  for (const b of BRANDS) {
    assert.ok(b.models.length > 0, b.id);
    assert.equal(new Set(b.models).size, b.models.length, b.id);
  }
  assert.equal(findBrand('Toyota').ar, 'تويوتا');
  assert.equal(findBrand('تويوتا').en, 'Toyota');
  const years = yearOptions(2026);
  assert.equal(years[0], 2027);
  assert.equal(years.at(-1), 1980);
  assert.match(mapsSearchUrl('ورشة'), /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
});

import { haversineKm, nearbyWorkshops, ratingSummary, warrantyInfo, newWarranty } from '../js/logic.js';
import { DEMO_WORKSHOPS, SPECIALTIES } from '../js/market.js';
import { AREAS } from '../js/places.js';

test('haversine distance is roughly right (Tahrir → Nasr City ≈ 9–11 km)', () => {
  const d = haversineKm({ lat: 30.0444, lng: 31.2357 }, { lat: 30.0566, lng: 31.3301 });
  assert.ok(d > 8 && d < 11, String(d));
});

test('nearbyWorkshops filters by radius and specialty, nearest first', () => {
  const nasr = AREAS.find(a => a.name === 'مدينة نصر');
  const near = nearbyWorkshops(DEMO_WORKSHOPS, nasr, { radiusKm: 10 });
  assert.ok(near.length >= 2);
  assert.ok(near.every(w => w.distanceKm <= 10));
  assert.equal(near[0].id, 'demo-1');
  assert.ok(near.every((w, i) => i === 0 || near[i - 1].distanceKm <= w.distanceKm));
  const tires = nearbyWorkshops(DEMO_WORKSHOPS, nasr, { specialty: 'tires' });
  assert.deepEqual(tires.map(w => w.id), ['demo-2']);
  assert.equal(nearbyWorkshops(DEMO_WORKSHOPS, null).length, DEMO_WORKSHOPS.length);
});

test('demo workshops are flagged and use known specialties', () => {
  for (const w of DEMO_WORKSHOPS) {
    assert.equal(w.demo, true);
    assert.ok(w.specialties.every(s => SPECIALTIES[s]), w.id);
  }
});

test('ratingSummary and warranty window', () => {
  assert.deepEqual(ratingSummary([]), { avg: 0, count: 0 });
  assert.deepEqual(ratingSummary([{ rating: 5 }, { rating: 4 }]), { avg: 4.5, count: 2 });
  const w = newWarranty('demo-1', '2026-10-01', 30);
  assert.equal(w.until, '2026-10-31');
  assert.equal(warrantyInfo({ warranty: w }, '2026-10-31').active, true);
  assert.equal(warrantyInfo({ warranty: w }, '2026-11-01').active, false);
  assert.equal(warrantyInfo({}, '2026-11-01'), null);
});
