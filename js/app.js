import { SERVICE_TYPES, SOURCES, PART_GRADES, WARNING_LIGHTS } from './data.js';
import {
  currentKm, sortedRecords, reminders, costs, trustScore, odometerAnomalies,
  buildReport, encodeReport, formatDate,
} from './logic.js';
import { load, save, uid, exportCar, parseImport } from './store.js';
import { renderReport } from './report-view.js';
import { expandReport, workshopDirectory } from './logic.js';
import { BRANDS, findBrand, yearOptions, WORKSHOP_CATEGORIES, mapsSearchUrl } from './cars.js';

let state = load();
state.workshops ||= [];
const view = document.getElementById('view');
const modal = document.getElementById('modal');

// ---------- helpers ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = n => Number(n || 0).toLocaleString('ar-EG');
const money = n => `${num(Math.round(n))} ج.م`;
const today = () => formatDate(Date.now() - new Date().getTimezoneOffset() * 60000);
const activeCar = () => state.cars.find(c => c.id === state.activeCarId) || state.cars[0] || null;

function persist() {
  if (!save(state)) toast('⚠️ مساحة التخزين اتملت — امسح صور فواتير قديمة أو اعمل نسخة احتياطية');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

function go(hash) {
  if (location.hash === '#' + hash) render();
  else location.hash = hash;
}

function remainingText(r) {
  if (r.status === 'unknown') return 'مفيش سجل لسه — سجّل آخر مرة عملتها';
  const bits = [];
  if (r.kmLeft != null) bits.push(r.kmLeft < 0 ? `متأخر ${num(-r.kmLeft)} كم` : `باقي ${num(r.kmLeft)} كم`);
  if (r.daysLeft != null) bits.push(r.daysLeft < 0 ? `متأخر ${num(-r.daysLeft)} يوم` : `باقي ${num(r.daysLeft)} يوم`);
  return bits.join(' • ');
}

const STATUS_LABEL = { overdue: 'متأخر', soon: 'قرّب', ok: 'تمام', unknown: 'غير معروف' };

function reminderItem(r) {
  return `<li class="reminder ${r.status}">
    <span class="ico">${r.icon}</span>
    <div class="grow"><b>${esc(r.label)}</b><small>${remainingText(r)}</small></div>
    <span class="pill ${r.status}">${STATUS_LABEL[r.status]}</span>
  </li>`;
}

function scoreRing(score) {
  const deg = Math.round(score * 3.6);
  const tone = score >= 75 ? 'good' : score >= 45 ? 'mid' : 'low';
  return `<div class="ring ${tone}" style="--deg:${deg}deg"><span>${num(score)}</span></div>`;
}

// Downscale invoice photos so dozens fit in localStorage.
function compressImage(file, maxSide = 900, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// In-page confirmation; native confirm() is blocked in embedded/sandboxed views.
function ask(message, okLabel = 'تأكيد', danger = true) {
  return new Promise(resolve => {
    modal.innerHTML = `<form method="dialog" class="form">
      <p>${esc(message)}</p>
      <div class="row2">
        <button class="btn" value="cancel">إلغاء</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(okLabel)}</button>
      </div>
    </form>`;
    modal.onclose = () => { modal.onclose = null; resolve(modal.returnValue === 'ok'); };
    modal.returnValue = '';
    modal.showModal();
  });
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- views ----------

// Full-screen searchable chooser. Resolves with the chosen value, a typed custom value, or null.
function choose({ title, items, columns = 2, customLabel }) {
  return new Promise(resolve => {
    modal.classList.add('sheet');
    modal.innerHTML = `<form method="dialog" class="picker">
      <div class="picker-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" value="cancel" aria-label="قفل">✕</button>
      </div>
      <input type="search" id="picker-search" placeholder="دوّر…" autocomplete="off">
      <div class="picker-grid cols-${columns}" id="picker-grid">
        ${items.map((it, i) => `<button type="button" class="pick ${it.selected ? 'selected' : ''}" data-i="${i}" data-q="${esc((it.label + ' ' + (it.sub || '')).toLowerCase())}">
          <b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>`).join('')}
      </div>
      ${customLabel ? `<div class="picker-custom">
        <input id="picker-custom" placeholder="${esc(customLabel)}">
        <button type="button" class="btn small" id="picker-custom-ok">تمام</button>
      </div>` : ''}
    </form>`;
    let result = null;
    const finish = v => { result = v; modal.close(); };
    modal.onclose = () => { modal.onclose = null; modal.classList.remove('sheet'); resolve(result); };
    const search = modal.querySelector('#picker-search');
    search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      modal.querySelectorAll('.pick').forEach(b => { b.hidden = q && !b.dataset.q.includes(q); });
    };
    modal.querySelector('#picker-grid').onclick = e => {
      const btn = e.target.closest('.pick');
      if (btn) finish(items[btn.dataset.i].value);
    };
    if (customLabel) modal.querySelector('#picker-custom-ok').onclick = () => {
      const v = modal.querySelector('#picker-custom').value.trim();
      if (v) finish(v);
    };
    modal.showModal();
    modal.querySelector('.picker-grid').scrollTop = 0;
    modal.querySelector('.selected')?.scrollIntoView({ block: 'center' });
  });
}

const pickBrand = current => choose({
  title: 'اختار ماركة عربيتك', columns: 2, customLabel: 'ماركة مش موجودة؟ اكتبها',
  items: BRANDS.map(b => ({ label: b.ar, sub: b.en, value: b.ar, selected: b.ar === current })),
});

const pickModel = (make, current) => {
  const brand = findBrand(make);
  return choose({
    title: `موديلات ${make}`, columns: 2, customLabel: 'موديلك مش موجود؟ اكتبه',
    items: (brand?.models || []).map(m => ({ label: m, value: m, selected: m === current })),
  });
};

const pickYear = current => choose({
  title: 'سنة الصنع', columns: 4,
  items: yearOptions().map(y => ({ label: String(y), value: y, selected: y === Number(current) })),
});

function carForm(car = {}) {
  const field = (name, label, value, placeholder) => `
    <div class="field">
      <span class="field-label">${label}*</span>
      <button type="button" class="select-btn ${value ? '' : 'empty'}" data-pick="${name}">
        <span>${esc(value || placeholder)}</span><span aria-hidden="true">▾</span>
      </button>
      <input type="hidden" name="${name}" value="${esc(value)}">
    </div>`;
  return `<form id="car-form" class="card form">
    ${field('make', 'الماركة', car.make, 'اختار الماركة')}
    <div class="row2">
      ${field('model', 'الموديل', car.model, 'اختار الموديل')}
      ${field('year', 'سنة الصنع', car.year, 'اختار السنة')}
    </div>
    <div class="row2">
      <label>اللون<input name="color" value="${esc(car.color)}"></label>
      <label>رقم اللوحة<input name="plate" value="${esc(car.plate)}"></label>
    </div>
    <label>رقم الشاسيه (VIN)<input name="vin" value="${esc(car.vin)}" dir="ltr"></label>
    <div class="row2">
      <label>تاريخ الشراء<input name="purchaseDate" type="date" value="${esc(car.purchaseDate || today())}"></label>
      <label>العداد وقت الشراء (كم)<input name="purchaseKm" type="number" min="0" inputmode="numeric" value="${esc(car.purchaseKm ?? 0)}"></label>
    </div>
    <div class="row2">
      <label>انتهاء الرخصة<input name="licenseExpiry" type="date" value="${esc(car.licenseExpiry)}"></label>
      <label>انتهاء التأمين<input name="insuranceExpiry" type="date" value="${esc(car.insuranceExpiry)}"></label>
    </div>
    <button class="btn primary" type="submit">${car.id ? 'حفظ التعديلات' : 'اعمل الباسبور'}</button>
  </form>`;
}

function bindCarForm(existing) {
  const form = document.getElementById('car-form');
  const get = name => form.elements[name].value;
  const set = (name, value) => {
    form.elements[name].value = value ?? '';
    const btn = form.querySelector(`[data-pick="${name}"]`);
    const placeholder = { make: 'اختار الماركة', model: 'اختار الموديل', year: 'اختار السنة' }[name];
    btn.firstElementChild.textContent = value || placeholder;
    btn.classList.toggle('empty', !value);
  };

  // Brand → model → year, each step opening the next so a new owner taps three times.
  const steps = {
    make: async () => {
      const v = await pickBrand(get('make'));
      if (v == null) return;
      if (v !== get('make')) set('model', '');
      set('make', v);
      if (!get('model')) await steps.model();
    },
    model: async () => {
      if (!get('make')) return steps.make();
      const v = await pickModel(get('make'), get('model'));
      if (v == null) return;
      set('model', v);
      if (!get('year')) await steps.year();
    },
    year: async () => {
      const v = await pickYear(get('year'));
      if (v != null) set('year', v);
    },
  };
  form.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => steps[b.dataset.pick]());

  form.onsubmit = e => {
    e.preventDefault();
    const missing = ['make', 'model', 'year'].find(n => !get(n));
    if (missing) { toast('اختار الماركة والموديل وسنة الصنع الأول'); steps[missing](); return; }
    const f = Object.fromEntries(new FormData(form));
    const data = { ...f, year: Number(f.year), purchaseKm: Number(f.purchaseKm) || 0 };
    if (existing) Object.assign(existing, data);
    else {
      const car = { id: uid(), createdAt: today(), records: [], ...data };
      state.cars.push(car);
      state.activeCarId = car.id;
    }
    persist();
    toast(existing ? 'اتحفظ ✓' : 'مبروك! الباسبور اتعمل 🎉');
    go('home');
  };
}

function viewWelcome() {
  view.innerHTML = `
    <section class="hero">
      <h1>قصة حياة عربيتك في مكان واحد</h1>
      <p>سجّل كل صيانة وكل فاتورة وكل قطعة غيار. لما تيجي تبيع، ابعت للمشتري <b>باسبور العربية</b> — سجل كامل يثبت إن عربيتك متصانة، فتتباع أسرع وبسعر أحسن.</p>
    </section>
    <h2>ضيف عربيتك</h2>
    ${carForm()}`;
  bindCarForm(null);
}

function viewHome(car) {
  const t = today();
  const rem = reminders(car, t);
  const urgent = rem.filter(r => r.status !== 'ok');
  const c = costs(car);
  const ts = trustScore(car, t);
  const anomalies = odometerAnomalies(car);
  const year = t.slice(0, 4);

  view.innerHTML = `
    <section class="card car-hero">
      <div>
        <h1>${esc(car.make)} ${esc(car.model)} <small>${esc(car.year)}</small></h1>
        <div class="km">🔢 ${num(currentKm(car))} كم</div>
        <button class="link" data-action="odometer">تحديث العداد</button>
      </div>
      <div class="score" title="درجة ثقة السجل">
        ${scoreRing(ts.score)}
        <small>درجة السجل</small>
      </div>
    </section>

    ${anomalies.length ? `<div class="alert">⚠️ في ${num(anomalies.length)} قراءة عداد أقل من قراءة قبلها. راجعها في السجل — لو غلطة كتابة صلّحها، لأنها بتقلل ثقة المشتري.</div>` : ''}

    <section class="card">
      <div class="card-head"><h2>محتاج انتباهك</h2><a href="#reminders">الكل</a></div>
      ${urgent.length
        ? `<ul class="list">${urgent.slice(0, 4).map(reminderItem).join('')}</ul>`
        : '<p class="muted">كله تمام ✅ مفيش صيانة متأخرة أو قرّبت.</p>'}
      ${urgent.length ? '<a class="btn small find-ws" href="#workshops">🔧 دوّر على ورشة أو مركز صيانة</a>' : ''}
    </section>

    <section class="stats">
      <div class="stat"><small>صرفت السنة دي</small><b>${money(c.byYear[year] || 0)}</b></div>
      <div class="stat"><small>إجمالي من يوم الشراء</small><b>${money(c.total)}</b></div>
      <div class="stat"><small>تكلفة الكيلو</small><b>${c.perKm != null ? `${c.perKm.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م` : '—'}</b></div>
      <div class="stat"><small>عدد السجلات</small><b>${num(car.records.length)}</b></div>
    </section>

    <section class="card">
      <h2>إزاي ترفع درجة السجل؟</h2>
      <ul class="tips">
        <li>${ts.parts.documentation >= 30 ? '✅' : '📸'} صوّر الفاتورة مع كل صيانة <small>(${num(ts.parts.documentation)}/٤٠)</small></li>
        <li>${ts.parts.regularity === 30 ? '✅' : '⏰'} متتأخرش على مواعيد الصيانة <small>(${num(ts.parts.regularity)}/٣٠)</small></li>
        <li>${ts.parts.odometer === 30 ? '✅' : '🔢'} قراءات عداد متسلسلة ومنطقية <small>(${num(ts.parts.odometer)}/٣٠)</small></li>
      </ul>
    </section>`;

  view.querySelector('[data-action=odometer]').onclick = () => openOdometer(car);
}

function openOdometer(car) {
  modal.innerHTML = `<form method="dialog" class="form" id="odo-form">
    <h2>تحديث العداد</h2>
    <label>القراءة الحالية (كم)<input name="km" type="number" min="0" required value="${currentKm(car)}"></label>
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>إلغاء</button>
      <button class="btn primary" value="ok">حفظ</button>
    </div>
  </form>`;
  modal.showModal();
  modal.querySelector('form').onsubmit = e => {
    if (e.submitter?.value !== 'ok') return;
    const km = Number(new FormData(e.target).get('km'));
    car.records.push({ id: uid(), date: today(), km, type: 'odometer', title: 'قراءة عداد', source: 'owner', parts: [] });
    persist();
    render();
  };
}

function recordItem(r, flagged) {
  const t = SERVICE_TYPES[r.type] || SERVICE_TYPES.other;
  return `<li class="record ${flagged ? 'flagged' : ''}" data-id="${esc(r.id)}">
    <span class="ico">${t.icon}</span>
    <div class="grow">
      <b>${esc(r.title || t.label)}</b>
      <small>${esc(r.date)} • ${num(r.km)} كم${r.workshop ? ` • ${esc(r.workshop)}` : ''}</small>
      ${r.parts?.length ? `<small class="parts">🔩 ${r.parts.map(p => `${esc(p.name)} (${esc(PART_GRADES[p.grade] || p.grade)})`).join('، ')}</small>` : ''}
      ${flagged ? '<small class="warn">⚠️ القراءة دي أقل من قراءة قبلها</small>' : ''}
    </div>
    <div class="end">
      ${r.cost ? `<b>${money(r.cost)}</b>` : ''}
      <span class="badge ${esc(r.source)}">${esc(SOURCES[r.source]?.label || '')}</span>
    </div>
  </li>`;
}

function viewLog(car, filter = '') {
  const flagged = new Set(odometerAnomalies(car).map(a => a.recordId));
  const records = sortedRecords(car).reverse().filter(r => !filter || r.type === filter);
  const usedTypes = [...new Set(car.records.map(r => r.type))];

  view.innerHTML = `
    <div class="card-head"><h1>السجل</h1>
      <select id="log-filter" aria-label="فلترة">
        <option value="">كل الأنواع</option>
        ${usedTypes.map(k => `<option value="${k}" ${k === filter ? 'selected' : ''}>${SERVICE_TYPES[k]?.label || k}</option>`).join('')}
      </select>
    </div>
    ${records.length
      ? `<ul class="list timeline">${records.map(r => recordItem(r, flagged.has(r.id))).join('')}</ul>`
      : `<div class="empty">📭<p>لسه مفيش سجلات. ابدأ بآخر تغيير زيت عملته.</p><a class="btn primary" href="#add">سجّل أول صيانة</a></div>`}`;

  document.getElementById('log-filter').onchange = e => viewLog(car, e.target.value);
  view.querySelectorAll('.record').forEach(li => li.onclick = () => go('add/' + li.dataset.id));
}

function partRow(p = {}) {
  return `<div class="part-row">
    <input name="partName" placeholder="اسم القطعة" value="${esc(p.name)}">
    <select name="partGrade">${Object.entries(PART_GRADES).map(([k, v]) =>
      `<option value="${k}" ${k === p.grade ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button type="button" class="icon-btn" data-remove-part aria-label="شيل">✕</button>
  </div>`;
}

function viewAdd(car, recordId) {
  const rec = recordId ? car.records.find(r => r.id === recordId) : null;
  if (recordId && !rec) return go('log');
  const r = rec || { date: today(), km: currentKm(car), type: 'oil', source: 'owner', parts: [] };
  let photo = r.photo || null;

  view.innerHTML = `
    <h1>${rec ? 'تعديل سجل' : 'سجّل صيانة'}</h1>
    <form id="rec-form" class="card form">
      <label>النوع
        <select name="type">${Object.entries(SERVICE_TYPES).map(([k, t]) =>
          `<option value="${k}" ${k === r.type ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select>
      </label>
      <label>وصف مختصر<input name="title" value="${esc(r.title)}" placeholder="مثلاً: زيت 5W-30 + فلتر زيت"></label>
      <div class="row2">
        <label>التاريخ<input name="date" type="date" required value="${esc(r.date)}" max="${today()}"></label>
        <label>العداد (كم)<input name="km" type="number" min="0" required value="${esc(r.km)}"></label>
      </div>
      <div class="row2">
        <label>التكلفة (ج.م)<input name="cost" type="number" min="0" value="${esc(r.cost ?? '')}"></label>
        <label>الورشة / المركز<input name="workshop" list="ws-list" value="${esc(r.workshop)}"></label>
        <datalist id="ws-list">${workshopDirectory(state.cars, state.workshops).map(w => `<option value="${esc(w.name)}">`).join('')}</datalist>
      </div>
      <fieldset>
        <legend>قطع الغيار</legend>
        <div id="parts">${(r.parts || []).map(partRow).join('')}</div>
        <button type="button" class="btn small" id="add-part">＋ قطعة</button>
      </fieldset>
      <fieldset>
        <legend>صورة الفاتورة <small>(بترفع درجة السجل)</small></legend>
        <input type="file" accept="image/*" capture="environment" id="photo-input">
        <div id="photo-preview">${photo ? `<img src="${photo}" alt="الفاتورة">` : ''}</div>
      </fieldset>
      <label>ملاحظات<textarea name="notes" rows="2">${esc(r.notes)}</textarea></label>
      <button class="btn primary" type="submit">حفظ</button>
      ${rec ? '<button class="btn danger" type="button" id="del-rec">مسح السجل</button>' : ''}
    </form>`;

  const form = document.getElementById('rec-form');
  const parts = document.getElementById('parts');
  document.getElementById('add-part').onclick = () => parts.insertAdjacentHTML('beforeend', partRow());
  parts.onclick = e => { if (e.target.matches('[data-remove-part]')) e.target.parentElement.remove(); };

  document.getElementById('photo-input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photo = await compressImage(file);
      document.getElementById('photo-preview').innerHTML = `<img src="${photo}" alt="الفاتورة">`;
    } catch {
      toast('مقدرناش نقرا الصورة');
    }
  };

  form.onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(form);
    const names = fd.getAll('partName');
    const grades = fd.getAll('partGrade');
    const data = {
      type: fd.get('type'), title: fd.get('title').trim(), date: fd.get('date'),
      km: Number(fd.get('km')), cost: Number(fd.get('cost')) || 0, workshop: fd.get('workshop').trim(),
      notes: fd.get('notes').trim(), photo,
      parts: names.map((name, i) => ({ name: name.trim(), grade: grades[i] })).filter(p => p.name),
      source: photo ? 'invoice' : 'owner',
    };
    if (rec) Object.assign(rec, data);
    else car.records.push({ id: uid(), ...data });
    persist();
    const flagged = odometerAnomalies(car).some(a => a.recordId === (rec?.id ?? car.records.at(-1).id));
    toast(flagged ? '⚠️ اتحفظ، بس العداد أقل من قراءة قبلها — اتأكد منه' : 'اتسجّل ✓');
    go('log');
  };

  if (rec) document.getElementById('del-rec').onclick = async () => {
    if (!await ask('متأكد إنك عايز تمسح السجل ده؟', 'امسح')) return;
    car.records = car.records.filter(x => x.id !== rec.id);
    persist();
    go('log');
  };
}

async function viewPassport(car) {
  const includeCosts = state.shareCosts !== false;
  const code = await encodeReport(buildReport(car, { includeCosts, today: today() }));
  const url = new URL('report.html', location.href);
  url.hash = code;
  const link = url.toString();

  let qrSvg = '';
  try {
    const qr = qrcode(0, 'L');
    qr.addData(link);
    qr.make();
    qrSvg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch {
    qrSvg = '<p class="muted">السجل كبير على الـ QR — استخدم اللينك.</p>';
  }

  view.innerHTML = `
    <h1>الباسبور</h1>
    <section class="card passport">
      <div class="qr">${qrSvg}</div>
      <p>المشتري أو الورشة يعمل سكان للكود ويشوف <b>تقرير تاريخ العربية</b> كامل — من غير اسمك ولا رقم موبايلك، واللوحة والشاسيه متخبيين جزئياً.</p>
      <label class="switch"><input type="checkbox" id="share-costs" ${includeCosts ? 'checked' : ''}> اعرض التكاليف في التقرير</label>
      <div class="actions">
        <button class="btn primary" id="share">📤 شارك التقرير</button>
        <button class="btn" id="copy">🔗 انسخ اللينك</button>
        <a class="btn" href="#report">👁️ اعرض التقرير</a>
      </div>
      <input id="link-box" class="link-box" readonly dir="ltr" value="${esc(link)}" hidden>
    </section>

    <section class="card">
      <h2>نقل الملكية</h2>
      <p class="muted">بعت العربية؟ نزّل ملف الباسبور وابعته للمالك الجديد يستورده عنده، فتفضل قصة العربية مكمّلة معاها.</p>
      <div class="actions">
        <button class="btn" id="export">⬇️ نزّل ملف الباسبور</button>
        <button class="btn danger" id="transfer">🔑 نقل الملكية ومسح من موبايلي</button>
      </div>
    </section>`;

  document.getElementById('share-costs').onchange = e => { state.shareCosts = e.target.checked; persist(); viewPassport(car); };
  document.getElementById('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast('اللينك اتنسخ ✓'); }
    catch {
      const box = document.getElementById('link-box');
      box.hidden = false;
      box.select();
      toast('النسخ التلقائي مش متاح هنا — انسخ اللينك من الخانة');
    }
  };
  document.getElementById('share').onclick = async () => {
    const title = `باسبور ${car.make} ${car.model} ${car.year}`;
    if (navigator.share) {
      try { await navigator.share({ title, text: title, url: link }); } catch { /* user cancelled */ }
    } else {
      document.getElementById('copy').click();
    }
  };
  const fileName = `passport-${car.make}-${car.model}-${car.year}.json`.replace(/\s+/g, '_');
  document.getElementById('export').onclick = () => download(fileName, exportCar(car));
  document.getElementById('transfer').onclick = async () => {
    if (!await ask('هننزّل ملف الباسبور، وبعدها العربية هتتمسح من الموبايل ده. كمّل؟', 'انقل الملكية')) return;
    download(fileName, exportCar(car));
    state.cars = state.cars.filter(c => c.id !== car.id);
    state.activeCarId = state.cars[0]?.id || null;
    persist();
    toast('ابعت الملف للمالك الجديد 🤝');
    go('home');
  };
}

function viewMore(car) {
  view.innerHTML = `
    <h1>المزيد</h1>
    <ul class="menu card">
      <li><a href="#reminders">⏰ كل التذكيرات</a></li>
      <li><a href="#lights">🚨 دليل لمبات التابلوه</a></li>
      <li><a href="#car">✏️ بيانات العربية والرخصة والتأمين</a></li>
      <li><a href="#newcar">🚗 ضيف عربية تانية</a></li>
      <li><label class="file-link">📥 استيراد باسبور (عربية اشتريتها)<input type="file" accept="application/json,.json" id="import" hidden></label></li>
      <li><button class="link" id="backup">💾 نسخة احتياطية لكل العربيات</button></li>
      <li><button class="link danger" id="delete-car">🗑️ مسح العربية دي</button></li>
    </ul>
    <section class="card muted small">
      <b>خصوصيتك:</b> كل بياناتك متخزنة على موبايلك بس. التقرير اللي بتشاركه مفيهوش اسمك ولا رقمك ولا صور الفواتير.
    </section>`;

  document.getElementById('import').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const imported = parseImport(await file.text());
      imported.id = uid();
      imported.previousOwners = (imported.previousOwners || 0) + 1;
      imported.records = imported.records || [];
      state.cars.push(imported);
      state.activeCarId = imported.id;
      persist();
      toast('الباسبور اتنقل لك ✓ — راجع الرخصة والتأمين');
      go('car');
    } catch {
      toast('الملف ده مش ملف باسبور صحيح');
    }
  };
  document.getElementById('backup').onclick = () =>
    download(`carpass-backup-${today()}.json`, JSON.stringify(state, null, 2));
  document.getElementById('delete-car').onclick = async () => {
    if (!await ask(`مسح ${car.make} ${car.model} وكل سجلاتها نهائياً؟`, 'امسح')) return;
    state.cars = state.cars.filter(c => c.id !== car.id);
    state.activeCarId = state.cars[0]?.id || null;
    persist();
    go('home');
  };
}

const stars = n => '★'.repeat(n || 0) + '☆'.repeat(5 - (n || 0));

function viewWorkshops(car) {
  const brand = car.make;
  const dir = workshopDirectory(state.cars, state.workshops);
  view.innerHTML = `
    <h1>الورش ومراكز الصيانة</h1>
    <section class="card">
      <h2>دوّر قريب منك</h2>
      <div class="ws-grid">
        ${WORKSHOP_CATEGORIES.map(c => `<a class="ws-tile" href="${esc(mapsSearchUrl(c.query(brand)))}" target="_blank" rel="noopener">
          <span class="ico">${c.icon}</span><span>${esc(c.label)}</span></a>`).join('')}
      </div>
      <p class="muted small">النتايج بتفتح على خرائط جوجل للمكان اللي إنت فيه. قارن التقييمات واسأل على السعر قبل ما تروح، وبعد الصيانة سجّل الورشة هنا وقيّمها.</p>
    </section>

    <section class="card">
      <div class="card-head"><h2>ورشي</h2><button class="btn small" id="add-ws">＋ ضيف ورشة</button></div>
      ${dir.length ? `<ul class="list">${dir.map((w, i) => `
        <li class="ws-item" data-i="${i}">
          <span class="ico">🏪</span>
          <div class="grow">
            <b>${esc(w.name)}</b>
            ${w.rating ? `<small class="stars" aria-label="${w.rating} من ٥">${stars(w.rating)}</small>` : ''}
            <small>${w.visits ? `${num(w.visits)} زيارة • ${money(w.spent)} • آخر مرة ${esc(w.lastDate)}` : 'لسه مفيش زيارات مسجّلة'}</small>
            ${w.area ? `<small>📍 ${esc(w.area)}</small>` : ''}
            ${w.phone ? `<small>📞 <span class="selectable" dir="ltr">${esc(w.phone)}</span></small>` : ''}
          </div>
          <span class="chev" aria-hidden="true">‹</span>
        </li>`).join('')}</ul>`
        : '<p class="muted">الورش اللي بتسجّلها مع الصيانة هتظهر هنا لوحدها، ومعاها عدد الزيارات واللي صرفته عندها.</p>'}
    </section>`;

  document.getElementById('add-ws').onclick = () => editWorkshop({});
  view.querySelectorAll('.ws-item').forEach(li => li.onclick = () => editWorkshop(dir[li.dataset.i]));
}

function editWorkshop(w) {
  const saved = state.workshops.find(x => x.id && x.id === w.id);
  modal.innerHTML = `<form method="dialog" class="form" id="ws-form">
    <h2>${w.name ? esc(w.name) : 'ورشة جديدة'}</h2>
    <label>الاسم*<input name="name" required value="${esc(w.name)}"></label>
    <div class="row2">
      <label>التليفون<input name="phone" type="tel" dir="ltr" value="${esc(w.phone)}"></label>
      <label>المنطقة<input name="area" value="${esc(w.area)}" placeholder="مثلاً: مدينة نصر"></label>
    </div>
    <label>لينك المكان على الخريطة<input name="mapUrl" type="url" dir="ltr" value="${esc(w.mapUrl)}" placeholder="https://maps.app.goo.gl/…"></label>
    <fieldset class="rating">
      <legend>تقييمك</legend>
      ${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="rate-${n}" value="${n}" ${Number(w.rating) === n ? 'checked' : ''}><label for="rate-${n}" title="${n}">★</label>`).join('')}
    </fieldset>
    <label>ملاحظات<textarea name="notes" rows="2" placeholder="أمين؟ أسعاره؟ بيلتزم بالمعاد؟">${esc(w.notes)}</textarea></label>
    ${w.phone || w.mapUrl ? `<div class="actions">
      ${w.phone ? `<a class="btn small" href="tel:${esc(w.phone)}">📞 اتصل</a>` : ''}
      ${w.mapUrl ? `<a class="btn small" href="${esc(w.mapUrl)}" target="_blank" rel="noopener">🗺️ الخريطة</a>` : ''}
    </div>` : ''}
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>إلغاء</button>
      <button class="btn primary" value="ok">حفظ</button>
    </div>
    ${saved ? '<button class="btn danger wide" value="delete" formnovalidate>مسح الورشة</button>' : ''}
  </form>`;
  modal.returnValue = '';
  modal.showModal();
  modal.querySelector('form').onsubmit = e => {
    const action = e.submitter?.value;
    if (action === 'delete') {
      state.workshops = state.workshops.filter(x => x !== saved);
    } else if (action === 'ok') {
      const f = Object.fromEntries(new FormData(e.target));
      const mapUrl = /^https?:\/\//.test(f.mapUrl) ? f.mapUrl.trim() : '';
      const data = { name: f.name.trim(), phone: f.phone.trim(), area: f.area.trim(), mapUrl,
        rating: Number(f.rating) || 0, notes: f.notes.trim() };
      if (saved) Object.assign(saved, data);
      else state.workshops.push({ id: uid(), ...data });
    } else return;
    persist();
    render();
  };
}

// What the buyer sees, rendered in-app from the same payload the share link carries.
function viewReport(car) {
  const report = buildReport(car, { includeCosts: state.shareCosts !== false, today: today() });
  view.innerHTML = '<div class="card-head"><h1>معاينة التقرير</h1><a href="#passport">رجوع</a></div><div id="report-body"></div>';
  renderReport(document.getElementById('report-body'), expandReport(JSON.parse(JSON.stringify(report))));
}

function viewReminders(car) {
  const rem = reminders(car, today());
  view.innerHTML = `
    <h1>التذكيرات</h1>
    <p class="muted small">المواعيد محسوبة من آخر مرة اتسجّلت ومن فترات عامة متعارف عليها — ارجع لكتالوج عربيتك للمواعيد الدقيقة.</p>
    <ul class="list card">${rem.map(reminderItem).join('') || '<li class="muted">مفيش تذكيرات</li>'}</ul>`;
}

function viewLights() {
  view.innerHTML = `
    <h1>لمبات التابلوه</h1>
    <p class="muted small">إرشاد عام مش تشخيص — لو مش متأكد، اقف في مكان آمن واتصل بميكانيكي.</p>
    <ul class="list card">${WARNING_LIGHTS.map(l => `
      <li class="light ${l.severity}">
        <span class="ico">${l.icon}</span>
        <div class="grow"><b>${l.name}</b><small>${l.advice}</small></div>
        <span class="pill ${l.severity === 'red' ? 'overdue' : l.severity === 'amber' ? 'soon' : 'ok'}">${l.severity === 'red' ? 'وقّف' : l.severity === 'amber' ? 'افحص قريب' : 'معلومة'}</span>
      </li>`).join('')}</ul>`;
}

// ---------- router ----------

function renderCarSwitch() {
  const sel = document.getElementById('car-switch');
  const car = activeCar();
  sel.hidden = state.cars.length < 2;
  sel.innerHTML = state.cars.map(c =>
    `<option value="${esc(c.id)}" ${c === car ? 'selected' : ''}>${esc(c.make)} ${esc(c.model)}</option>`).join('');
}

document.getElementById('car-switch').onchange = e => { state.activeCarId = e.target.value; persist(); render(); };

function render() {
  const [route, arg] = (location.hash.slice(1) || 'home').split('/');
  const car = activeCar();
  renderCarSwitch();
  const tab = route === 'report' ? 'passport' : route;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelector('.tabbar').hidden = !car;
  document.querySelector('.top-more').hidden = !car;
  window.scrollTo(0, 0);

  if (!car || route === 'newcar') {
    if (car) { view.innerHTML = '<h1>عربية جديدة</h1>' + carForm(); bindCarForm(null); }
    else viewWelcome();
    return;
  }
  ({
    home: () => viewHome(car),
    log: () => viewLog(car),
    add: () => viewAdd(car, arg),
    passport: () => viewPassport(car),
    more: () => viewMore(car),
    reminders: () => viewReminders(car),
    workshops: () => viewWorkshops(car),
    report: () => viewReport(car),
    lights: () => viewLights(),
    car: () => { view.innerHTML = '<h1>بيانات العربية</h1>' + carForm(car); bindCarForm(car); },
  }[route] || (() => viewHome(car)))();
}

document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => go(b.dataset.tab));
window.addEventListener('hashchange', render);
render();

try { navigator.serviceWorker?.register('sw.js').catch(() => {}); } catch { /* sandboxed view */ }
