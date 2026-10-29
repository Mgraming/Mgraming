import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, currentKm, odometerAnomalies, reminders, costs, trustScore, mask,
  buildReport, expandReport, encodeReport, decodeReport,
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
