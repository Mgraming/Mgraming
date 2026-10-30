// Pure domain logic (no DOM, no storage) so it can be unit-tested in Node.
import { SERVICE_TYPES, SOURCES } from './data.js';

const DAY = 24 * 60 * 60 * 1000;
const SOON_KM = 1000;
const SOON_DAYS = 30;

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function formatDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addMonths(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return formatDate(target.getTime());
}

export function daysBetween(fromStr, toStr) {
  return Math.round((parseDate(toStr) - parseDate(fromStr)) / DAY);
}

export function sortedRecords(car) {
  return [...(car.records || [])].sort((a, b) =>
    a.date === b.date ? (a.km || 0) - (b.km || 0) : a.date < b.date ? -1 : 1);
}

export function currentKm(car) {
  return (car.records || []).reduce((max, r) => Math.max(max, r.km || 0), car.purchaseKm || 0);
}

// A reading lower than an earlier one (by date) suggests a typo or odometer tampering.
export function odometerAnomalies(car) {
  const anomalies = [];
  let maxKm = car.purchaseKm || 0;
  let maxDate = car.purchaseDate || null;
  for (const r of sortedRecords(car)) {
    if (!r.km) continue;
    if (r.km < maxKm) anomalies.push({ recordId: r.id, date: r.date, km: r.km, prevKm: maxKm, prevDate: maxDate });
    else { maxKm = r.km; maxDate = r.date; }
  }
  return anomalies;
}

function lastOfType(car, type) {
  return sortedRecords(car).filter(r => r.type === type).pop() || null;
}

function status(kmLeft, daysLeft) {
  if ((kmLeft != null && kmLeft < 0) || (daysLeft != null && daysLeft < 0)) return 'overdue';
  if ((kmLeft != null && kmLeft <= SOON_KM) || (daysLeft != null && daysLeft <= SOON_DAYS)) return 'soon';
  return 'ok';
}

const STATUS_ORDER = { overdue: 0, soon: 1, unknown: 2, ok: 3 };

export function reminders(car, today) {
  const km = currentKm(car);
  const list = [];

  for (const [type, def] of Object.entries(SERVICE_TYPES)) {
    if (!def.km && !def.months) continue;
    const last = lastOfType(car, type);
    if (!last) {
      // Only nag about oil when there's no history; other items stay quiet until first logged.
      if (type === 'oil') list.push({ key: type, label: def.label, icon: def.icon, status: 'unknown' });
      continue;
    }
    const dueKm = def.km && last.km ? last.km + def.km : null;
    const dueDate = def.months ? addMonths(last.date, def.months) : null;
    const kmLeft = dueKm != null ? dueKm - km : null;
    const daysLeft = dueDate ? daysBetween(today, dueDate) : null;
    list.push({ key: type, label: def.label, icon: def.icon, dueKm, dueDate, kmLeft, daysLeft,
      lastDate: last.date, status: status(kmLeft, daysLeft) });
  }

  const docs = [
    ['license', 'تجديد رخصة العربية', '🪪', car.licenseExpiry],
    ['insurance', 'تجديد التأمين', '🛡️', car.insuranceExpiry],
  ];
  for (const [key, label, icon, date] of docs) {
    if (!date) continue;
    const daysLeft = daysBetween(today, date);
    list.push({ key, label, icon, dueDate: date, daysLeft, kmLeft: null, status: status(null, daysLeft) });
  }

  return list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
}

export function costs(car) {
  const records = car.records || [];
  const total = records.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const byType = {};
  const byYear = {};
  for (const r of records) {
    const c = Number(r.cost) || 0;
    if (!c) continue;
    byType[r.type] = (byType[r.type] || 0) + c;
    const y = r.date.slice(0, 4);
    byYear[y] = (byYear[y] || 0) + c;
  }
  const driven = currentKm(car) - (car.purchaseKm || 0);
  return { total, byType, byYear, perKm: driven > 0 ? total / driven : null };
}

// Explainable 0–100 score: documentation (40) + on-time maintenance (30) + consistent odometer (30).
export function trustScore(car, today) {
  const records = (car.records || []).filter(r => r.type !== 'odometer');
  if (!records.length) return { score: 0, parts: { documentation: 0, regularity: 0, odometer: 0 } };

  const maxWeight = SOURCES.invoice.weight;
  const avgWeight = records.reduce((s, r) => s + (SOURCES[r.source]?.weight || 1), 0) / records.length;
  const documentation = Math.round(40 * Math.min((avgWeight - 1) / (maxWeight - 1), 1));

  const overdue = reminders(car, today).filter(r => r.status === 'overdue').length;
  const regularity = Math.max(0, 30 - overdue * 10);

  const odometer = odometerAnomalies(car).length ? 0 : 30;

  return { score: documentation + regularity + odometer, parts: { documentation, regularity, odometer } };
}

// Mask all but the last 2 characters of a plate / VIN so a shared report doesn't identify the owner.
export function mask(s, keep = 2) {
  if (!s) return '';
  const chars = [...s.replace(/\s+/g, '')];
  return chars.map((c, i) => (i < chars.length - keep ? '•' : c)).join('');
}

// Compact, owner-anonymous snapshot used by the shareable report link.
export function buildReport(car, { includeCosts = true, today }) {
  return {
    v: 1,
    at: today,
    car: {
      make: car.make, model: car.model, year: car.year, color: car.color || '',
      plate: mask(car.plate), vin: mask(car.vin, 6), purchaseDate: car.purchaseDate || '', purchaseKm: car.purchaseKm || 0,
    },
    records: sortedRecords(car).map(r => [
      r.date, r.km || 0, r.type, r.title || '', includeCosts ? Number(r.cost) || 0 : null,
      r.source || 'owner', r.workshop || '', (r.parts || []).map(p => [p.name, p.grade]),
    ]),
  };
}

export function expandReport(report) {
  const records = report.records.map(([date, km, type, title, cost, source, workshop, parts], i) => ({
    id: String(i), date, km, type, title, cost, source, workshop,
    parts: parts.map(([name, grade]) => ({ name, grade })),
  }));
  return { ...report, car: { ...report.car, records } };
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

// Prefix "z" = deflate-raw compressed, "j" = plain JSON (browsers without CompressionStream).
export async function encodeReport(report) {
  const bytes = new TextEncoder().encode(JSON.stringify(report));
  if (typeof CompressionStream === 'function') {
    return 'z' + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }
  return 'j' + toBase64Url(bytes);
}

export async function decodeReport(code) {
  let bytes = fromBase64Url(code.slice(1));
  if (code[0] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (code[0] !== 'j') throw new Error('unknown report format');
  return JSON.parse(new TextDecoder().decode(bytes));
}

const normName = s => (s || '').trim().replace(/\s+/g, ' ');

// Merge saved workshops with visit stats derived from every car's service records (matched by name).
export function workshopDirectory(cars, saved = []) {
  const byName = new Map();
  const entry = name => {
    const key = normName(name).toLowerCase();
    if (!byName.has(key)) byName.set(key, { name: normName(name), visits: 0, spent: 0, lastDate: null, types: new Set() });
    return byName.get(key);
  };
  for (const w of saved) Object.assign(entry(w.name), { ...w, name: normName(w.name) });
  for (const car of cars) {
    for (const r of car.records || []) {
      if (!normName(r.workshop) || r.type === 'odometer') continue;
      const e = entry(r.workshop);
      e.visits++;
      e.spent += Number(r.cost) || 0;
      e.types.add(r.type);
      if (!e.lastDate || r.date > e.lastDate) e.lastDate = r.date;
    }
  }
  return [...byName.values()]
    .map(e => ({ ...e, types: [...e.types] }))
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || b.visits - a.visits || a.name.localeCompare(b.name, 'ar'));
}

// ---------- marketplace ----------

export function haversineKm(a, b) {
  const R = 6371;
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function ratingSummary(reviews = []) {
  if (!reviews.length) return { avg: 0, count: 0 };
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  return { avg: Math.round(avg * 10) / 10, count: reviews.length };
}

// Workshops within radiusKm of loc (all of them, unsorted by distance, when loc is unknown), nearest first.
export function nearbyWorkshops(list, loc, { radiusKm = Infinity, specialty = '' } = {}) {
  return list
    .filter(w => !specialty || w.specialties.includes(specialty))
    .map(w => ({ ...w, distanceKm: loc && w.lat != null ? haversineKm(loc, w) : null }))
    .filter(w => w.distanceKm == null || w.distanceKm <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

// Warranty window for a job done through an app workshop: active until `until` (inclusive).
export function warrantyInfo(record, today) {
  if (!record?.warranty) return null;
  const until = record.warranty.until;
  const daysLeft = daysBetween(today, until);
  return { ...record.warranty, daysLeft, active: daysLeft >= 0 };
}

export function newWarranty(workshopId, date, days) {
  return { workshopId, from: date, until: formatDate(parseDate(date) + days * DAY), days, claims: [] };
}
