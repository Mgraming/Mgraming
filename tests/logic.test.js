import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, currentKm, odometerAnomalies, reminders, costs, trustScore, mask,
  buildReport, expandReport, encodeReport, decodeReport, workshopDirectory, estimateKm,
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

test('trustScore: proof, regularity and odometer parts', () => {
  const good = trustScore(car(), '2026-06-01');
  assert.equal(good.parts.odometer, 20); // consistent, but no recent odometer photo
  assert.equal(good.parts.regularity, 20); // brakes (2024-03 + 24 months) are overdue
  assert.equal(good.parts.documentation, 20); // 2 of 3 records with an invoice → half of 40
  const c = car();
  c.records.push({ id: 'x', date: '2026-06-01', km: 1000, type: 'repair', source: 'owner' });
  assert.equal(trustScore(c, '2026-06-01').parts.odometer, 0);
  const withPhoto = car();
  withPhoto.records.push({ id: 'p', date: '2026-05-20', km: 61000, type: 'odometer', source: 'photo', photo: 'data:' });
  assert.equal(trustScore(withPhoto, '2026-06-01').parts.odometer, 30);
  assert.equal(trustScore(withPhoto, '2026-10-01').parts.odometer, 20); // photo older than 90 days
  const allConfirmed = { purchaseKm: 0, records: [{ id: 'w', date: '2026-01-01', km: 10, type: 'repair', source: 'workshop' }] };
  assert.equal(trustScore(allConfirmed, '2026-01-02').parts.documentation, 40);
  const ownerOnly = { purchaseKm: 0, records: [{ id: 'o', date: '2026-01-01', km: 10, type: 'repair', source: 'owner' }] };
  assert.equal(trustScore(ownerOnly, '2026-01-02').parts.documentation, 0);
  assert.equal(trustScore(ownerOnly, '2026-01-02').score, 50);
  assert.equal(trustScore({ records: [] }, '2026-01-01').score, 0);
});

test('estimateKm projects from average daily driving', () => {
  const c = { purchaseDate: '2026-01-01', purchaseKm: 10000, records: [{ date: '2026-03-02', km: 13000, type: 'odometer' }] };
  const e = estimateKm(c, '2026-04-01'); // 3000 km over 60 days = 50/day, 30 days since
  assert.equal(e.perDay, 50);
  assert.equal(e.km, 14500);
  assert.equal(estimateKm({ purchaseDate: '2026-01-01', purchaseKm: 0, records: [] }, '2026-02-01'), null);
  assert.equal(estimateKm({ purchaseDate: '2026-01-01', purchaseKm: 0, records: [{ date: '2026-01-05', km: 100 }] }, '2026-02-01'), null); // < 14 days span
  const r = reminders({ purchaseKm: 0, records: [{ date: '2026-03-01', km: 5000, type: 'oil' }] }, '2026-03-02', 15500);
  assert.equal(r.find(x => x.key === 'oil').status, 'overdue'); // estimated km passed the 10,000 km interval
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

import { jobFinancials, periodStats, periodStart, lastMonths, parseCsv, parseCatalogCsv, productFits, cartTotal } from '../js/logic.js';

test('jobFinancials: labour + parts margin - platform fee', () => {
  const f = jobFinancials({ labor: 500, partsPrice: 1000, partsCost: 800 }, 0.1);
  assert.deepEqual([f.revenue, f.partsProfit, f.fee, f.profit], [1500, 200, 150, 550]);
  assert.equal(jobFinancials({ labor: 200 }).profit, 200);
});

test('periodStart and lastMonths', () => {
  assert.equal(periodStart('month', '2026-10-30'), '2026-10-01');
  assert.equal(periodStart('quarter', '2026-10-30'), '2026-08-01');
  assert.equal(periodStart('year', '2026-10-30'), '2026-01-01');
  assert.equal(periodStart('all', '2026-10-30'), null);
  assert.deepEqual(lastMonths('2026-02-15', 3), ['2025-12', '2026-01', '2026-02']);
});

test('periodStats totals the period and builds a monthly series', () => {
  const items = [
    { date: '2026-10-02', amount: 100 }, { date: '2026-10-20', amount: 50 },
    { date: '2026-09-10', amount: 70 }, { date: '2025-01-01', amount: 999 },
  ];
  const s = periodStats(items, { from: '2026-10-01', today: '2026-10-30', months: 2, value: it => ({ amount: it.amount }) });
  assert.equal(s.totals.count, 2);
  assert.equal(s.totals.amount, 150);
  assert.deepEqual(s.series, [{ month: '2026-09', amount: 70 }, { month: '2026-10', amount: 150 }]);
});

test('parseCsv handles quotes, escaped quotes, CRLF and semicolons', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","say ""hi"""\n'), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('parseCatalogCsv maps Arabic headers, normalises fields and reports bad rows', () => {
  const csv = '﻿الاسم,الماركة,العربيات,السعر,الكمية,الحالة,القسم\n' +
    'فلتر زيت,Denso,"تويوتا Corolla|Hyundai",180,25,أصلي,oil\n' +
    'تيل فرامل,,,"1,200",,بديل,brakes\n' +
    ',,,50,,,\n';
  const { items, errors } = parseCatalogCsv(csv);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].fits, ['تويوتا Corolla', 'Hyundai']);
  assert.equal(items[0].condition, 'original');
  assert.equal(items[0].stock, 25);
  assert.equal(items[1].price, 1200);
  assert.equal(items[1].stock, null);
  assert.equal(items[1].condition, 'aftermarket');
  assert.equal(errors.length, 1);
  assert.match(parseCatalogCsv('foo,bar\n1,2').errors[0], /الاسم/);
});

test('productFits matches make or make+model in Arabic or English', () => {
  const car = { make: 'تويوتا', model: 'Corolla' };
  assert.ok(productFits({ fits: [] }, car));
  assert.ok(productFits({ fits: ['Toyota'] }, car));
  assert.ok(productFits({ fits: ['تويوتا Corolla'] }, car));
  assert.ok(productFits({ fits: ['toyota corolla'] }, car));
  assert.ok(!productFits({ fits: ['Toyota Yaris'] }, car));
  assert.ok(!productFits({ fits: ['Hyundai'] }, car));
  assert.equal(cartTotal([{ price: 100, qty: 2 }, { price: 50, qty: 1 }]), 250);
});
