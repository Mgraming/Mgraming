import { SERVICE_TYPES, SOURCES, PART_GRADES } from './data.js';
import { icon } from './icons.js';
import { odometerAnomalies, trustScore, currentKm, costs } from './logic.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('ar-EG');

// Renders an expanded report (see logic.expandReport) — shared by report.html and the in-app preview.
export function renderReport(view, report) {
  const car = report.car;
  // Score as of the report date, so an old link doesn't look worse just because time passed.
  const ts = trustScore(car, report.at);
  const anomalies = odometerAnomalies(car);
  const flagged = new Set(anomalies.map(a => a.recordId));
  const service = car.records.filter(r => r.type !== 'odometer');
  const withInvoice = service.filter(r => r.source === 'invoice' || r.source === 'workshop').length;
  const accidents = car.records.filter(r => r.type === 'accident' || r.type === 'bodywork').length;
  const showCosts = car.records.some(r => r.cost !== null);
  const c = costs({ ...car, records: car.records.map(r => ({ ...r, cost: r.cost || 0 })) });

  view.innerHTML = `
    <section class="car-hero">
      <div>
        <h1>${esc(car.make)} ${esc(car.model)} <span>${esc(car.year)}</span></h1>
        <div class="muted small">${car.color ? `اللون: ${esc(car.color)} • ` : ''}${car.plate ? `اللوحة: <span dir="ltr">${esc(car.plate)}</span> • ` : ''}${car.vin ? `الشاسيه: <span dir="ltr">${esc(car.vin)}</span>` : ''}</div>
        <div class="odo">${icon('gauge')}<b>${num(currentKm(car))}</b><small>كم آخر قراءة</small></div>
        <div class="muted small">التقرير اتعمل يوم ${esc(report.at)}</div>
      </div>
      <div class="score">${ring(ts.score)}<small>درجة السجل</small></div>
    </section>

    <section class="stats">
      <div class="stat"><small>عمليات صيانة</small><b>${num(service.length)}</b></div>
      <div class="stat"><small>بفاتورة</small><b>${num(withInvoice)}</b></div>
      <div class="stat ${accidents ? 'bad' : ''}"><small>حوادث / سمكرة</small><b>${num(accidents)}</b></div>
      <div class="stat ${anomalies.length ? 'bad' : ''}"><small>تعارض في العداد</small><b>${num(anomalies.length)}</b></div>
      ${showCosts ? `<div class="stat"><small>إجمالي المصروف</small><b>${num(c.total)} ج.م</b></div>` : ''}
    </section>

    ${anomalies.length ? `<div class="alert">${icon('triangle-alert')}<span>في قراءات عداد أقل من قراءات قبلها في السجل. ده ممكن يكون غلطة كتابة، بس اسأل البائع عنه وافحص العربية.</span></div>` : ''}

    <section class="card">
      <h2>التاريخ الكامل</h2>
      <ul class="list timeline">
        ${car.purchaseDate ? `<li class="record"><span class="ico">${icon('key-round')}</span><div class="grow"><b>شراء العربية</b><small>${esc(car.purchaseDate)} • ${num(car.purchaseKm)} كم</small></div></li>` : ''}
        ${car.records.map(r => item(r, flagged.has(r.id))).join('')}
      </ul>
    </section>

    <section class="card disclaimer small">
      <b>مهم:</b> البيانات دي مسجّلة بواسطة المالك (وبعضها بفواتير مصوّرة عنده)، ومش موثّقة من جهة رسمية لحد دلوقتي.
      التقرير ده بيساعدك، بس <b>مش بديل عن فحص العربية</b> في مركز فحص أو مع ميكانيكي تثق فيه قبل الشراء.
    </section>`;
}

function ring(score) {
  const tone = score >= 75 ? 'good' : score >= 45 ? 'mid' : 'low';
  return `<div class="ring ${tone}" style="--deg:${Math.round(score * 3.6)}deg"><span>${num(score)}</span></div>`;
}

function item(r, flagged) {
  const t = SERVICE_TYPES[r.type] || SERVICE_TYPES.other;
  return `<li class="record ${flagged ? 'flagged' : ''}">
    <span class="ico">${icon(t.icon)}</span>
    <div class="grow">
      <b>${esc(r.title || t.label)}</b>
      <small>${esc(r.date)} • ${num(r.km)} كم${r.workshop ? ` • ${esc(r.workshop)}` : ''}</small>
      ${r.parts.length ? `<small class="parts">${r.parts.map(p => `${esc(p.name)} (${esc(PART_GRADES[p.grade] || p.grade)})`).join('، ')}</small>` : ''}
      ${flagged ? `<small class="warn">${icon('triangle-alert', 'tiny')} القراءة دي أقل من قراءة قبلها</small>` : ''}
    </div>
    <div class="end">
      ${r.cost ? `<b>${num(r.cost)} ج.م</b>` : ''}
      <span class="badge ${esc(r.source)}">${esc(SOURCES[r.source]?.label || '')}</span>
    </div>
  </li>`;
}

