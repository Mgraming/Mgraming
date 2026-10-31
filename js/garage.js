// Documents wallet (car papers with renewal reminders) and fuel log (consumption, cost, early fault warning).
import { DOC_TYPES, FUEL_TYPES } from './data.js';
import { daysBetween, fuelStats, periodStats, estimateKm, currentKm } from './logic.js';
import { uid } from './store.js';
import { icon } from './icons.js';
import {
  state, view, modal, esc, num, money, today, persist, toast, go, rerender, ask, compressImage, barChart,
} from './ui.js';

const fmt1 = n => Number(n).toLocaleString('ar-EG', { maximumFractionDigits: 1 });

// ---------- documents wallet ----------

function expiryPill(d, t) {
  if (!d.expiry) return '';
  const left = daysBetween(t, d.expiry);
  if (left < 0) return `<span class="pill overdue">خلصت من ${num(-left)} يوم</span>`;
  if (left <= 30) return `<span class="pill soon">باقي ${num(left)} يوم</span>`;
  return `<span class="pill ok">لحد ${esc(d.expiry)}</span>`;
}

export function docsSummary(car, t) {
  const docs = car.docs || [];
  const next = docs.filter(d => d.expiry).sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
  return { count: docs.length, next, nextDays: next ? daysBetween(t, next.expiry) : null };
}

export function viewDocs(car) {
  car.docs ||= [];
  const t = today();
  const docs = car.docs.slice().sort((a, b) => (a.expiry || '9999') < (b.expiry || '9999') ? -1 : 1);
  const missing = ['license', 'insurance', 'driver'].filter(k => !car.docs.some(d => d.type === k));

  view.innerHTML = `
    <a class="back" href="#home">${icon('chevron-left', 'flip')} الرئيسية</a>
    <div class="page-head"><h1 class="page-title">ورق العربية</h1><button class="btn small primary" id="add-doc">${icon('plus')} ورقة</button></div>
    <p class="notice">${icon('info')}<span>نسخة على موبايلك عشان ترجع لها وتفتكر مواعيد التجديد. <b>مش بديل عن الورق الأصلي</b> قدام المرور. الورق ده مش بيتبعت مع تقرير المشتري ولا مع ملف نقل الملكية.</span></p>
    ${docs.length ? `<div class="doc-grid">${docs.map(d => `
      <article class="doc-card" data-id="${esc(d.id)}" tabindex="0">
        <div class="doc-thumb">${d.photo ? `<img src="${d.photo}" alt="">` : icon(DOC_TYPES[d.type]?.icon || 'file-text')}</div>
        <div class="grow">
          <b>${esc(d.title || DOC_TYPES[d.type]?.label)}</b>
          ${d.number ? `<small dir="ltr" class="doc-num">${esc(d.number)}</small>` : ''}
          ${expiryPill(d, t)}
        </div>
      </article>`).join('')}</div>`
      : `<div class="empty-state">${icon('file-text')}<p>صوّر رخصة العربية والتأمين ورخصة القيادة، وهنفكّرك قبل ما يخلصوا بشهر.</p></div>`}
    ${missing.length ? `<section class="card">
      <h2>ناقص</h2>
      <div class="chips wrap">${missing.map(k => `<button class="chip" data-new="${k}">${icon(DOC_TYPES[k].icon)} ${DOC_TYPES[k].label}</button>`).join('')}</div>
    </section>` : ''}`;

  document.getElementById('add-doc').onclick = () => editDoc(car, null);
  view.querySelectorAll('[data-new]').forEach(b => b.onclick = () => editDoc(car, null, b.dataset.new));
  view.querySelectorAll('.doc-card').forEach(c => c.onclick = () => editDoc(car, car.docs.find(d => d.id === c.dataset.id)));
}

function editDoc(car, doc, presetType) {
  const d = doc || { type: presetType || 'license' };
  let photo = d.photo || null, photoBack = d.photoBack || null;
  const shot = (id, img, label) => `<div class="doc-shot">
    ${img ? `<button type="button" class="doc-img" data-view="${id}"><img src="${img}" alt="${label}"></button>` : ''}
    <label class="upload">${icon('camera')}<span>${img ? 'غيّر' : label}</span><input type="file" accept="image/*" capture="environment" data-shot="${id}"></label>
  </div>`;
  const render = () => {
    const type = d.type;
    modal.innerHTML = `<form method="dialog" class="form doc-form">
      <h2>${doc ? esc(d.title || DOC_TYPES[d.type]?.label) : 'ورقة جديدة'}</h2>
      <label>النوع<select name="type">${Object.entries(DOC_TYPES).map(([k, v]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <div class="row2">${shot('front', photo, 'صوّر الوش')}${shot('back', photoBack, 'صوّر الضهر')}</div>
      <label>رقم الورقة<input name="number" dir="ltr" value="${esc(d.number)}" placeholder="اختياري"></label>
      <div class="row2">
        <label>تاريخ الإصدار<input name="issued" type="date" value="${esc(d.issued)}"></label>
        <label>تاريخ الانتهاء${DOC_TYPES[type]?.expires ? '*' : ''}<input name="expiry" type="date" value="${esc(d.expiry)}" ${DOC_TYPES[type]?.expires ? 'required' : ''}></label>
      </div>
      <label>ملاحظات<input name="notes" value="${esc(d.notes)}" placeholder="مثلاً: شركة التأمين، رقم الوثيقة، وحدة المرور"></label>
      <div class="row2">
        <button class="btn" value="cancel" formnovalidate>إلغاء</button>
        <button class="btn primary" value="ok">حفظ</button>
      </div>
      ${doc ? `<button class="btn danger wide" value="delete" formnovalidate>${icon('trash-2')} مسح الورقة</button>` : ''}
    </form>`;
    const form = modal.querySelector('form');
    form.elements.type.onchange = () => { Object.assign(d, read(form)); render(); };
    form.querySelectorAll('[data-shot]').forEach(inp => inp.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const img = await compressImage(file, 1000, 0.65);
        if (inp.dataset.shot === 'front') photo = img; else photoBack = img;
        Object.assign(d, read(form));
        render();
      } catch { toast('مقدرناش نقرا الصورة'); }
    });
    form.querySelectorAll('[data-view]').forEach(b => b.onclick = () => showPhoto(b.dataset.view === 'front' ? photo : photoBack));
    form.onsubmit = async e => {
      const action = e.submitter?.value;
      if (action === 'delete') {
        car.docs = car.docs.filter(x => x !== doc);
      } else if (action === 'ok') {
        const data = { ...read(form), photo, photoBack };
        if (doc) Object.assign(doc, data);
        else car.docs.push({ id: uid(), ...data });
      } else return;
      persist();
      toast(action === 'delete' ? 'اتمسحت' : 'اتحفظت');
      rerender();
    };
  };
  const read = form => {
    const f = Object.fromEntries(new FormData(form));
    return { type: f.type, number: f.number.trim(), issued: f.issued, expiry: f.expiry, notes: f.notes.trim() };
  };
  render();
  modal.returnValue = '';
  if (!modal.open) modal.showModal();
}

function showPhoto(src) {
  const box = document.createElement('dialog');
  box.className = 'photo-view';
  box.innerHTML = `<img src="${src}" alt=""><form method="dialog"><button class="btn">${icon('x')} قفل</button></form>`;
  document.body.append(box);
  box.addEventListener('close', () => box.remove());
  box.showModal();
}

// ---------- fuel log ----------

export function fuelSummary(car, t) {
  return fuelStats(car.fuel || [], t);
}

export function viewFuel(car) {
  car.fuel ||= [];
  const t = today();
  const s = fuelStats(car.fuel, t);
  const monthly = periodStats(car.fuel, { today: t, months: 6, value: f => ({ total: Number(f.total) || 0 }) });
  const fills = car.fuel.slice().sort((a, b) => (a.date === b.date ? b.km - a.km : a.date < b.date ? 1 : -1));
  const rising = s.change != null && s.change >= 0.15;

  view.innerHTML = `
    <a class="back" href="#home">${icon('chevron-left', 'flip')} الرئيسية</a>
    <div class="page-head"><h1 class="page-title">البنزين</h1><button class="btn small primary" id="add-fuel">${icon('fuel')} فوّلت</button></div>

    ${s.avg != null ? `<section class="fuel-hero">
      <div><small>متوسط الاستهلاك</small><b>${fmt1(s.avg)}</b><small>لتر لكل ١٠٠ كم</small></div>
      <div><small>تكلفة الكيلو</small><b>${s.costPerKm != null ? fmt1(s.costPerKm) : '—'}</b><small>جنيه</small></div>
      <div><small>الشهر ده</small><b>${num(Math.round(s.thisMonth))}</b><small>جنيه</small></div>
    </section>` : `<div class="notice">${icon('info')}<span><b>إزاي نحسب الاستهلاك؟</b> فوّل التانك لآخره وسجّل التفويلة. من التفويلة الفُل اللي بعدها هنعرف عربيتك بتصرف كام لتر لكل ١٠٠ كم.</span></div>`}

    ${rising ? `<div class="alert">${icon('triangle-alert')}<span>آخر تانك صرف <b>${fmt1(s.latest.l100)}</b> لتر/١٠٠ كم، يعني <b>${num(Math.round(s.change * 100))}٪ أكتر</b> من متوسطك (${fmt1(s.baseline)}). لو ده اتكرر: اكشف على ضغط الكاوتش وفلتر الهوا والبوجيهات، أو اعمل فحص كمبيوتر.</span></div>` : ''}

    ${car.fuel.length ? `<section class="card">
      <h2>صرفت على البنزين</h2>
      ${barChart(monthly.series, { main: 'total', mainLabel: 'جنيه في الشهر' })}
    </section>` : ''}

    <section class="card">
      <h2>التفويلات</h2>
      ${fills.length ? `<ul class="list">${fills.map(f => {
        const seg = f.full ? s.segments.find(g => g.to === f.date && g.toKm === f.km) : null;
        return `<li class="fill" data-id="${esc(f.id)}">
          <span class="ico">${icon('fuel')}</span>
          <div class="grow">
            <b>${fmt1(f.liters)} لتر ${esc(FUEL_TYPES[f.fuelType] || '')}${f.full ? '' : ' <small class="muted">(مش فُل)</small>'}</b>
            <small>${esc(f.date)} • ${num(f.km)} كم${f.station ? ` • ${esc(f.station)}` : ''}</small>
            ${seg ? `<small class="pos">${fmt1(seg.l100)} لتر/١٠٠ كم على آخر ${num(seg.km)} كم</small>` : ''}
          </div>
          <b>${money(f.total || 0)}</b>
        </li>`;
      }).join('')}</ul>` : `<div class="empty-state small-empty">${icon('fuel')}<p>لسه مفيش تفويلات.</p></div>`}
    </section>`;

  document.getElementById('add-fuel').onclick = () => editFuel(car, null);
  view.querySelectorAll('.fill').forEach(li => li.onclick = () => editFuel(car, car.fuel.find(f => f.id === li.dataset.id)));
}

export function editFuel(car, fill) {
  car.fuel ||= [];
  const t = today();
  const last = car.fuel.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const s = fuelStats(car.fuel, t);
  const guessKm = Math.max(currentKm(car), estimateKm(car, t)?.km || 0);
  const f = fill || { date: t, km: guessKm || '', full: true, fuelType: last?.fuelType || 'b92', price: s.lastPrice ? Math.round(s.lastPrice * 100) / 100 : '' };
  const price = fill && fill.liters ? Math.round((fill.total / fill.liters) * 100) / 100 : f.price;

  modal.innerHTML = `<form method="dialog" class="form" id="fuel-form">
    <h2>${fill ? 'تعديل تفويلة' : 'فوّلت'}</h2>
    <div class="row2">
      <label>التاريخ<input name="date" type="date" required max="${t}" value="${esc(f.date)}"></label>
      <label>العداد (كم)*<input name="km" type="number" min="0" inputmode="numeric" required value="${esc(f.km)}"></label>
    </div>
    <label>النوع<select name="fuelType">${Object.entries(FUEL_TYPES).map(([k, v]) => `<option value="${k}" ${k === f.fuelType ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <div class="row3">
      <label>لتر<input name="liters" type="number" min="0" step="0.01" inputmode="decimal" required value="${esc(f.liters)}"></label>
      <label>سعر اللتر<input name="price" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(price)}"></label>
      <label>الإجمالي<input name="total" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(f.total)}"></label>
    </div>
    <small class="muted">اكتب اتنين منهم والتالت هيتحسب لوحده. سعر اللتر بيتملي من آخر تفويلة.</small>
    <label class="switch"><input type="checkbox" name="full" ${f.full ? 'checked' : ''}> فوّلت التانك لآخره</label>
    <label>البنزينة<input name="station" value="${esc(f.station)}" placeholder="اختياري"></label>
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>إلغاء</button>
      <button class="btn primary" value="ok">حفظ</button>
    </div>
    ${fill ? `<button class="btn danger wide" value="delete" formnovalidate>${icon('trash-2')} مسح</button>` : ''}
  </form>`;
  modal.returnValue = '';
  modal.showModal();
  const form = modal.querySelector('form');
  const el = n => form.elements[n];
  const round2 = n => Math.round(n * 100) / 100;
  let lastEdited = [];
  form.oninput = e => {
    const n = e.target.name;
    if (!['liters', 'price', 'total'].includes(n)) return;
    lastEdited = [n, ...lastEdited.filter(x => x !== n)].slice(0, 2);
    const L = Number(el('liters').value), P = Number(el('price').value), T = Number(el('total').value);
    const missing = ['liters', 'price', 'total'].find(x => !lastEdited.includes(x));
    if (missing === 'total' && L && P) el('total').value = round2(L * P);
    if (missing === 'liters' && P && T) el('liters').value = round2(T / P);
    if (missing === 'price' && L && T) el('price').value = round2(T / L);
  };
  form.onsubmit = e => {
    const action = e.submitter?.value;
    if (action === 'delete') car.fuel = car.fuel.filter(x => x !== fill);
    else if (action === 'ok') {
      const v = Object.fromEntries(new FormData(form));
      const liters = Number(v.liters);
      const total = Number(v.total) || round2(liters * (Number(v.price) || 0));
      const data = { date: v.date, km: Number(v.km), fuelType: v.fuelType, liters, total, full: v.full === 'on', station: v.station.trim() };
      if (fill) Object.assign(fill, data);
      else car.fuel.push({ id: uid(), ...data });
    } else return;
    persist();
    toast(action === 'delete' ? 'اتمسحت' : 'اتسجّلت');
    rerender();
  };
}
