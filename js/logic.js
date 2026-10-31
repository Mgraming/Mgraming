// Pure domain logic (no DOM, no storage) so it can be unit-tested in Node.
import { SERVICE_TYPES, SOURCES, DOC_TYPES } from './data.js';
import { findBrand } from './cars.js';

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

// Every odometer reading the owner has given us: service records and fuel fill-ups.
function kmReadings(car) {
  return [...(car.records || []), ...(car.fuel || [])].filter(r => r.km > 0).map(r => ({ date: r.date, km: r.km }));
}

export function currentKm(car) {
  return kmReadings(car).reduce((max, r) => Math.max(max, r.km), car.purchaseKm || 0);
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

// kmNow lets callers pass an estimated reading (see estimateKm) so reminders advance between updates.
export function reminders(car, today, kmNow = currentKm(car)) {
  const km = kmNow;
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

  for (const d of documentExpiries(car)) {
    const daysLeft = daysBetween(today, d.date);
    list.push({ key: d.key, label: d.label, icon: d.icon, dueDate: d.date, daysLeft, kmLeft: null, status: status(null, daysLeft) });
  }

  return list.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
}

// Expiry dates from the documents wallet, plus the older licence/insurance fields on the car
// when the wallet doesn't already hold that document with a date.
export function documentExpiries(car) {
  const out = (car.docs || []).filter(d => d.expiry).map(d => ({
    key: 'doc-' + d.id, type: d.type, date: d.expiry, icon: DOC_TYPES[d.type]?.icon || 'file-text',
    label: `تجديد ${d.title || DOC_TYPES[d.type]?.label || 'ورقة'}`,
  }));
  const legacy = [['license', car.licenseExpiry], ['insurance', car.insuranceExpiry]];
  for (const [type, date] of legacy) {
    if (date && !out.some(d => d.type === type)) {
      out.push({ key: type, type, date, icon: DOC_TYPES[type].icon, label: `تجديد ${DOC_TYPES[type].label}` });
    }
  }
  return out;
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

const ODO_PHOTO_FRESH_DAYS = 90;

export function lastOdometerPhoto(car) {
  return sortedRecords(car).filter(r => r.type === 'odometer' && r.photo).pop() || null;
}

// Explainable 0–100 score:
//   documentation (40): how many service records have proof (invoice photo or workshop confirmation);
//   regularity (30): 10 off for each overdue maintenance item;
//   odometer (30): 20 for readings that only go up + 10 for an odometer photo in the last 90 days.
export function trustScore(car, today) {
  const records = (car.records || []).filter(r => r.type !== 'odometer');
  if (!records.length) return { score: 0, parts: { documentation: 0, regularity: 0, odometer: 0 }, empty: true };

  const maxWeight = SOURCES.workshop.weight;
  const proof = records.reduce((s, r) => s + ((SOURCES[r.source]?.weight || 1) - 1), 0) / (records.length * (maxWeight - 1));
  // An invoice on every record earns 30 of 40; workshop confirmation earns the rest.
  const documentation = Math.round(40 * Math.min(proof * 1.5, 1));

  const overdue = reminders(car, today).filter(r => r.status === 'overdue').length;
  const regularity = Math.max(0, 30 - overdue * 10);

  const photo = lastOdometerPhoto(car);
  const freshPhoto = photo && daysBetween(photo.date, today) <= ODO_PHOTO_FRESH_DAYS;
  const odometer = (odometerAnomalies(car).length ? 0 : 20) + (freshPhoto ? 10 : 0);

  return { score: documentation + regularity + odometer, parts: { documentation, regularity, odometer }, overdue, freshPhoto: !!freshPhoto };
}

// Average daily driving from real readings, used to estimate today's odometer between updates.
// Needs two readings at least 14 days apart; uses up to the last year of history.
export function estimateKm(car, today) {
  const readings = [
    ...(car.purchaseDate ? [{ date: car.purchaseDate, km: car.purchaseKm || 0 }] : []),
    ...kmReadings(car),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.km - b.km));
  if (readings.length < 2) return null;
  const last = readings.at(-1);
  const yearAgo = addMonths(last.date, -12);
  const first = readings.find(r => r.date >= yearAgo && daysBetween(r.date, last.date) >= 14);
  if (!first) return null;
  const perDay = (last.km - first.km) / daysBetween(first.date, last.date);
  if (!(perDay > 0)) return null;
  const daysSince = Math.max(0, daysBetween(last.date, today));
  return { km: Math.round(last.km + perDay * daysSince), perDay, lastKm: last.km, lastDate: last.date, daysSince };
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

// ---------- business dashboards ----------

// Money for one workshop job. Labour is pure income; parts earn their margin; the platform fee is on the total bill.
export function jobFinancials(job, feeRate = 0) {
  const labor = Number(job.labor) || 0;
  const partsPrice = Number(job.partsPrice) || 0;
  const partsCost = Number(job.partsCost) || 0;
  const revenue = labor + partsPrice;
  const fee = Math.round(revenue * feeRate);
  return { revenue, labor, partsPrice, partsCost, partsProfit: partsPrice - partsCost, fee, profit: revenue - partsCost - fee };
}

const monthKey = date => date.slice(0, 7);

export function lastMonths(today, n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i--) keys.push(addMonths(today.slice(0, 8) + '01', -i).slice(0, 7));
  return keys;
}

// Totals for items dated on/after `from` (YYYY-MM-DD, or null for all time), plus a per-month series.
export function periodStats(items, { from = null, today, months = 6, value }) {
  const inPeriod = items.filter(it => !from || it.date >= from);
  const totals = { count: inPeriod.length };
  for (const it of inPeriod) {
    for (const [k, v] of Object.entries(value(it))) totals[k] = (totals[k] || 0) + v;
  }
  const series = lastMonths(today, months).map(m => {
    const row = { month: m };
    for (const it of items.filter(x => monthKey(x.date) === m)) {
      for (const [k, v] of Object.entries(value(it))) row[k] = (row[k] || 0) + v;
    }
    return row;
  });
  return { totals, series };
}

export function periodStart(period, today) {
  if (period === 'month') return today.slice(0, 8) + '01';
  if (period === 'quarter') return addMonths(today.slice(0, 8) + '01', -2);
  if (period === 'year') return today.slice(0, 5) + '01-01';
  return null;
}

// ---------- parts catalogue ----------

// Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF, commas or semicolons).
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim()));
}

const CATALOG_COLUMNS = {
  name: ['الاسم', 'اسم القطعة', 'name'],
  brand: ['الماركة', 'ماركة القطعة', 'brand'],
  fits: ['العربيات', 'تناسب', 'fits', 'compatible'],
  price: ['السعر', 'price'],
  stock: ['الكمية', 'المخزون', 'stock', 'qty'],
  condition: ['الحالة', 'condition'],
  category: ['القسم', 'category'],
  sku: ['الكود', 'sku', 'code'],
};

const CONDITION_ALIASES = {
  original: ['أصلي', 'اصلي', 'original', 'وكالة'],
  oem: ['oem', 'مصنع أصلي'],
  aftermarket: ['بديل', 'تجاري', 'aftermarket'],
  used: ['مستعمل', 'used'],
};

const normalizeCondition = v => {
  const s = (v || '').trim().toLowerCase();
  return Object.entries(CONDITION_ALIASES).find(([, alts]) => alts.some(a => a.toLowerCase() === s))?.[0] || 'aftermarket';
};

// Turns an uploaded catalogue sheet into products. Unknown columns are ignored; bad rows are reported, not dropped silently.
export function parseCatalogCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { items: [], errors: ['الملف فاضي'] };
  const header = rows[0].map(h => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(CATALOG_COLUMNS)) {
    col[key] = header.findIndex(h => names.some(n => n.toLowerCase() === h));
  }
  if (col.name < 0 || col.price < 0) return { items: [], errors: ['لازم يكون في عمود «الاسم» وعمود «السعر»'] };

  const items = [];
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    const get = k => (col[k] >= 0 ? (r[col[k]] || '').trim() : '');
    const name = get('name');
    const price = Number(get('price').replace(/[^\d.]/g, ''));
    if (!name || !(price > 0)) { errors.push(`سطر ${i + 2}: الاسم أو السعر ناقص`); return; }
    items.push({
      name, price, brand: get('brand'), sku: get('sku'), category: get('category') || 'other',
      stock: get('stock') === '' ? null : Math.max(0, parseInt(get('stock'), 10) || 0),
      condition: normalizeCondition(get('condition')),
      fits: get('fits') ? get('fits').split(/[|،,]/).map(s => s.trim()).filter(Boolean) : [],
    });
  });
  return { items, errors };
}

// A product fits when it lists no cars (universal), the car's make, or "make model" — in Arabic or English.
export function productFits(product, car) {
  if (!product.fits?.length || !car) return true;
  const brand = findBrand(car.make);
  const makes = [car.make, brand?.ar, brand?.en].filter(Boolean).map(m => m.toLowerCase());
  const model = (car.model || '').toLowerCase();
  return product.fits.some(f => {
    const v = f.toLowerCase().trim();
    return makes.some(m => v === m || v === `${m} ${model}`);
  });
}

export function cartTotal(lines) {
  return lines.reduce((s, l) => s + l.price * l.qty, 0);
}

// ---------- fuel ----------

// Consumption uses the full-to-full method: litres put in after one full tank, up to and including the next
// full tank, divided by the distance between them. Partial fills are added to the segment they fall in.
export function fuelStats(entries, today, { recentSegments = 5 } = {}) {
  const fills = [...(entries || [])].sort((a, b) => (a.date === b.date ? a.km - b.km : a.date < b.date ? -1 : 1));
  const segments = [];
  let start = null, litres = 0, cost = 0;
  for (const f of fills) {
    if (start) { litres += Number(f.liters) || 0; cost += Number(f.total) || 0; }
    if (f.full) {
      if (start && f.km > start.km) {
        const km = f.km - start.km;
        segments.push({ from: start.date, to: f.date, toKm: f.km, km, liters: litres, cost, l100: (litres / km) * 100, costPerKm: cost / km });
      }
      start = f; litres = 0; cost = 0;
    }
  }
  const recent = segments.slice(-recentSegments);
  const sum = (arr, k) => arr.reduce((s, x) => s + x[k], 0);
  const avg = recent.length ? (sum(recent, 'liters') / sum(recent, 'km')) * 100 : null;
  const latest = segments.at(-1) || null;
  // Compare the latest tank with the average of the ones before it.
  const before = segments.slice(-recentSegments - 1, -1);
  const baseline = before.length >= 2 ? (sum(before, 'liters') / sum(before, 'km')) * 100 : null;
  const change = latest && baseline ? (latest.l100 - baseline) / baseline : null;

  const month = today.slice(0, 7);
  const thisMonth = fills.filter(f => f.date.startsWith(month)).reduce((s, f) => s + (Number(f.total) || 0), 0);
  const priced = fills.filter(f => f.liters > 0 && f.total > 0);
  const lastPrice = priced.length ? priced.at(-1).total / priced.at(-1).liters : null;
  const costPerKm = recent.length ? sum(recent, 'cost') / sum(recent, 'km') : null;
  return { segments, avg, latest, baseline, change, thisMonth, lastPrice, costPerKm, count: fills.length };
}
