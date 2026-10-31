import { SERVICE_TYPES, SOURCES, PART_GRADES, WARNING_LIGHTS, DOC_TYPES } from './data.js';
import {
  currentKm, sortedRecords, reminders, costs, trustScore, odometerAnomalies,
  buildReport, encodeReport, expandReport, workshopDirectory, warrantyInfo, newWarranty,
  estimateKm, lastOdometerPhoto, daysBetween,
} from './logic.js';
import { uid, exportCar, parseImport } from './store.js';
import { renderReport } from './report-view.js';
import { BRANDS, findBrand, yearOptions } from './cars.js';
import { icon, hydrateIcons } from './icons.js';
import {
  state, view, modal, esc, num, money, today, activeCar, persist, toast, go, setRender, ask, choose,
  compressImage, download,
} from './ui.js';
import {
  viewWorkshops, viewShop, viewChat, viewJoin, findShop, warrantyBlock, bindWarranty,
} from './shops.js';
import { viewBiz, viewInbox } from './biz.js';
import { viewDocs, viewFuel, editFuel, docsSummary, fuelSummary } from './garage.js';
import { viewParts, viewStore, viewCart, viewJoinStore, viewStoreBiz } from './parts.js';

// ---------- small pieces ----------

function remainingText(r) {
  if (r.status === 'unknown') return 'مفيش سجل لسه. سجّل آخر مرة عملتها';
  const bits = [];
  if (r.kmLeft != null) bits.push(r.kmLeft < 0 ? `متأخر ${num(-r.kmLeft)} كم` : `باقي ${num(r.kmLeft)} كم`);
  if (r.daysLeft != null) bits.push(r.daysLeft < 0 ? `متأخر ${num(-r.daysLeft)} يوم` : `باقي ${num(r.daysLeft)} يوم`);
  return bits.join(' • ');
}

const STATUS_LABEL = { overdue: 'متأخر', soon: 'قرّب', ok: 'تمام', unknown: 'مش معروف' };
const DOC_ICONS = { license: 'file-text', insurance: 'shield-check' };

function reminderItem(r) {
  return `<li class="reminder ${r.status}">
    <span class="ico tone-${r.status}">${icon(DOC_ICONS[r.key] || r.icon)}</span>
    <div class="grow"><b>${esc(r.label)}</b><small>${remainingText(r)}</small></div>
    <span class="pill ${r.status}">${STATUS_LABEL[r.status]}</span>
  </li>`;
}

function scoreRing(score) {
  const tone = score >= 75 ? 'good' : score >= 45 ? 'mid' : 'low';
  return `<div class="ring ${tone}" style="--deg:${Math.round(score * 3.6)}deg"><span>${num(score)}</span></div>`;
}

// ---------- car setup ----------

const pickBrand = current => choose({
  title: 'اختار ماركة عربيتك', columns: 2, customLabel: 'ماركة مش موجودة؟ اكتبها',
  items: BRANDS.map(b => ({ label: b.ar, sub: b.en, value: b.ar, selected: b.ar === current })),
});

const pickModel = (make, current) => choose({
  title: `موديلات ${make}`, columns: 2, customLabel: 'موديلك مش موجود؟ اكتبه',
  items: (findBrand(make)?.models || []).map(m => ({ label: m, value: m, selected: m === current })),
});

const pickYear = current => choose({
  title: 'سنة الصنع', columns: 4,
  items: yearOptions().map(y => ({ label: String(y), value: y, selected: y === Number(current) })),
});

const PICK_PLACEHOLDER = { make: 'اختار الماركة', model: 'اختار الموديل', year: 'اختار السنة' };

function carForm(car = {}) {
  const field = (name, label, value) => `
    <div class="field">
      <span class="field-label">${label}*</span>
      <button type="button" class="select-btn ${value ? '' : 'empty'}" data-pick="${name}">
        <span>${esc(value || PICK_PLACEHOLDER[name])}</span>${icon('chevron-down', 'tiny')}
      </button>
      <input type="hidden" name="${name}" value="${esc(value)}">
    </div>`;
  return `<form id="car-form" class="card form">
    ${field('make', 'الماركة', car.make)}
    <div class="row2">${field('model', 'الموديل', car.model)}${field('year', 'سنة الصنع', car.year)}</div>
    <div class="row2">
      <label>اللون<input name="color" value="${esc(car.color)}"></label>
      <label>رقم اللوحة<input name="plate" value="${esc(car.plate)}"></label>
    </div>
    <label>رقم الشاسيه (VIN)<input name="vin" value="${esc(car.vin)}" dir="ltr"></label>
    <div class="row2">
      <label>تاريخ الشراء<input name="purchaseDate" type="date" value="${esc(car.purchaseDate || today())}"></label>
      <label>العداد وقت الشراء (كم)<input name="purchaseKm" type="number" min="0" inputmode="numeric" value="${esc(car.purchaseKm ?? 0)}"></label>
    </div>
    ${car.id ? '' : `<fieldset>
      <legend>عشان التذكيرات تشتغل من النهارده</legend>
      <label>العداد دلوقتي (كم)<input name="kmToday" type="number" min="0" inputmode="numeric" placeholder="الرقم اللي على العداد النهارده"></label>
      <div class="row2">
        <label>آخر تغيير زيت كان امتى؟<input name="oilDate" type="date" max="${today()}"></label>
        <label>عند كام كيلو؟<input name="oilKm" type="number" min="0" inputmode="numeric"></label>
      </div>
      <small class="muted">مش لازم تكون متأكد ١٠٠٪. التاريخ لوحده كفاية.</small>
    </fieldset>`}
    <div class="row2">
      <label>انتهاء الرخصة<input name="licenseExpiry" type="date" value="${esc(car.licenseExpiry)}"></label>
      <label>انتهاء التأمين<input name="insuranceExpiry" type="date" value="${esc(car.insuranceExpiry)}"></label>
    </div>
    <button class="btn primary wide" type="submit">${car.id ? 'حفظ التعديلات' : 'اعمل الباسبور'}</button>
  </form>`;
}

function bindCarForm(existing) {
  const form = document.getElementById('car-form');
  const get = name => form.elements[name].value;
  const set = (name, value) => {
    form.elements[name].value = value ?? '';
    const btn = form.querySelector(`[data-pick="${name}"]`);
    btn.firstElementChild.textContent = value || PICK_PLACEHOLDER[name];
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
    const { kmToday, oilDate, oilKm, ...f } = Object.fromEntries(new FormData(form));
    const data = { ...f, year: Number(f.year), purchaseKm: Number(f.purchaseKm) || 0 };
    if (existing) Object.assign(existing, data);
    else {
      const records = [];
      if (oilDate) records.push({ id: uid(), date: oilDate, km: Number(oilKm) || 0, type: 'oil', title: 'آخر تغيير زيت (من الذاكرة)', source: 'owner', parts: [] });
      if (Number(kmToday) > data.purchaseKm) records.push({ id: uid(), date: today(), km: Number(kmToday), type: 'odometer', title: 'قراءة عداد', source: 'owner', parts: [] });
      const car = { id: uid(), createdAt: today(), records, ...data };
      state.cars.push(car);
      state.activeCarId = car.id;
    }
    persist();
    toast(existing ? 'اتحفظ' : 'مبروك! الباسبور اتعمل');
    go('home');
  };
}

// ---------- views ----------

function viewWelcome() {
  view.innerHTML = `
    <section class="hero">
      <div class="hero-mark">${icon('book-marked')}</div>
      <h1>قصة حياة عربيتك في مكان واحد</h1>
      <p>سجّل كل صيانة وكل فاتورة، لاقي ورش قريبة منك بأسعار واضحة وضمان، ولما تيجي تبيع ابعت للمشتري <b>باسبور العربية</b>.</p>
      <ul class="hero-points">
        <li>${icon('bell')} تذكير بمواعيد الصيانة والرخصة</li>
        <li>${icon('shield-check')} ضمان ٣٠ يوم مع ورش التطبيق</li>
        <li>${icon('qr-code')} تقرير تاريخ العربية للبيع</li>
      </ul>
    </section>
    <h2 class="section-title">ضيف عربيتك</h2>
    ${carForm()}
    <h2 class="section-title">لأصحاب الأعمال</h2>
    ${bizAccounts()}
    <a class="join-cta" href="#join">
      <span class="join-icon">${icon('store')}</span>
      <span class="grow"><b>صاحب ورشة؟</b><small>صفحة لورشتك وداشبورد لدخلك وربحك</small></span>
      ${icon('chevron-left')}
    </a>
    <a class="join-cta" href="#join-store">
      <span class="join-icon">${icon('package')}</span>
      <span class="grow"><b>صاحب محل قطع غيار؟</b><small>ارفع الكتالوج وبيع لأصحاب العربيات اللي حواليك</small></span>
      ${icon('chevron-left')}
    </a>`;
  bindCarForm(null);
}

// The business pages this device manages (local until accounts exist on the server).
function bizAccounts() {
  const shops = state.market.listings.map(w => ({ href: `#biz/${w.id}`, ic: 'wrench', name: w.name, sub: 'داشبورد الورشة' }));
  const stores = state.market.stores.map(st => ({ href: `#store-biz/${st.id}`, ic: 'package', name: st.name, sub: 'داشبورد المحل' }));
  const all = [...shops, ...stores];
  return all.length ? `<ul class="menu card">${all.map(a => `<li><a href="${esc(a.href)}">${icon(a.ic)}<span><b>${esc(a.name)}</b><small class="muted"> • ${a.sub}</small></span>${icon('chevron-left', 'chev')}</a></li>`).join('')}</ul>` : '';
}

const docsLabel = d => d.title || DOC_TYPES[d.type]?.label || 'ورقة';

// Today's best odometer guess: the last reading, moved forward by the owner's average daily driving.
const kmNow = (car, t) => Math.max(currentKm(car), estimateKm(car, t)?.km || 0);
const ODO_NUDGE_DAYS = 30;

function viewHome(car) {
  const t = today();
  const rem = reminders(car, t, kmNow(car, t));
  const est = estimateKm(car, t);
  const lastPhoto = lastOdometerPhoto(car);
  const needsPhoto = car.records.length && (!lastPhoto || daysBetween(lastPhoto.date, t) > ODO_NUDGE_DAYS);
  const docsInfo = docsSummary(car, t);
  const fuelInfo = fuelSummary(car, t);
  const urgent = rem.filter(r => r.status !== 'ok');
  const c = costs(car);
  const ts = trustScore(car, t);
  const anomalies = odometerAnomalies(car);
  const activeWarranties = car.records.filter(r => warrantyInfo(r, t)?.active);

  view.innerHTML = `
    <section class="car-hero">
      <div class="grow">
        <small class="eyebrow">${icon('car', 'tiny')} عربيتي</small>
        <h1>${esc(car.make)} ${esc(car.model)} <span>${esc(car.year)}</span></h1>
        <small class="odo-label">قراءة العداد (الكيلومترات اللي العربية مشيتها)</small>
        <div class="odo">${icon('gauge')}<b>${num(currentKm(car))}</b><small>كم</small></div>
        ${est && est.daysSince > 0 ? `<small class="odo-est">النهارده تقريباً ${num(est.km)} كم • بتمشي حوالي ${num(Math.round(est.perDay))} كم في اليوم</small>` : ''}
        <button class="link light" data-action="odometer">${icon('camera', 'tiny')} حدّث العداد</button>
      </div>
      <button class="score" data-action="score" aria-label="إيه هي درجة السجل؟">${scoreRing(ts.score)}<small>درجة السجل<br>من ١٠٠ ${icon('info', 'tiny')}</small></button>
    </section>

    ${needsPhoto ? `<button class="nudge" data-action="odometer">
      <span class="ico tone-soon">${icon('camera')}</span>
      <span class="grow"><b>صوّر العداد</b><small>${lastPhoto ? `آخر صورة من ${num(daysBetween(lastPhoto.date, t))} يوم` : 'لسه مفيش صورة للعداد'}. صورة كل شهر بتخلّي تذكيرات الصيانة مظبوطة وبتثبت للمشتري إن العداد سليم.</small></span>
      ${icon('chevron-left', 'chev')}
    </button>` : ''}

    ${anomalies.length ? `<div class="alert">${icon('triangle-alert')}<span>في ${num(anomalies.length)} قراءة عداد أقل من قراءة قبلها. راجعها في السجل، لأنها بتقلل ثقة المشتري.</span></div>` : ''}

    <section class="card">
      <div class="card-head"><h2>محتاج انتباهك</h2><a href="#reminders">الكل</a></div>
      ${urgent.length
        ? `<ul class="list">${urgent.slice(0, 4).map(reminderItem).join('')}</ul>
           <a class="btn soft wide" href="#workshops">${icon('wrench')} دوّر على ورشة قريبة</a>`
        : `<p class="ok-line">${icon('check')} كله تمام. مفيش صيانة متأخرة أو قرّبت.</p>`}
    </section>

    ${activeWarranties.length ? `<section class="card">
      <h2>ضمانات شغّالة</h2>
      <ul class="list">${activeWarranties.map(r => {
        const wi = warrantyInfo(r, t);
        return `<li class="record" data-id="${esc(r.id)}"><span class="ico tone-good">${icon('shield-check')}</span>
          <div class="grow"><b>${esc(r.title || SERVICE_TYPES[r.type]?.label)}</b><small>${esc(findShop(wi.workshopId)?.name || r.workshop)} • باقي ${num(wi.daysLeft)} يوم</small></div>
          ${icon('chevron-left', 'chev')}</li>`;
      }).join('')}</ul>
    </section>` : ''}

    <div class="tiles">
      <a class="tile" href="#docs">
        <span class="ico ${docsInfo.nextDays != null && docsInfo.nextDays <= 30 ? 'tone-soon' : ''}">${icon('file-text')}</span>
        <span class="grow"><b>ورق العربية</b><small>${docsInfo.count
          ? (docsInfo.next ? (docsInfo.nextDays < 0 ? `${esc(docsLabel(docsInfo.next))} خلصت` : `${esc(docsLabel(docsInfo.next))} بعد ${num(docsInfo.nextDays)} يوم`) : `${num(docsInfo.count)} ورقة`)
          : 'صوّر الرخصة والتأمين'}</small></span>
      </a>
      <a class="tile" href="#fuel">
        <span class="ico ${fuelInfo.change >= 0.15 ? 'tone-soon' : ''}">${icon('fuel')}</span>
        <span class="grow"><b>البنزين</b><small>${fuelInfo.avg != null ? `${fuelInfo.avg.toLocaleString('ar-EG', { maximumFractionDigits: 1 })} لتر/١٠٠ كم` : fuelInfo.count ? 'محتاج تفويلة فُل كمان' : 'سجّل أول تفويلة'}</small></span>
      </a>
    </div>

    <section class="stats">
      <div class="stat"><small>صرفت السنة دي</small><b>${money(c.byYear[t.slice(0, 4)] || 0)}</b></div>
      <div class="stat"><small>من يوم الشراء</small><b>${money(c.total)}</b></div>
      <div class="stat"><small>تكلفة الكيلو</small><b>${c.perKm != null ? `${c.perKm.toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م` : '—'}</b></div>
      <div class="stat"><small>سجلات</small><b>${num(car.records.length)}</b></div>
    </section>

    <section class="card">
      <h2>ارفع درجة السجل</h2>
      <ul class="tips">
        <li class="${ts.parts.documentation >= 30 ? 'done' : ''}">${icon(ts.parts.documentation >= 30 ? 'check' : 'camera')} صوّر الفاتورة مع كل صيانة <small>${num(ts.parts.documentation)}/٤٠</small></li>
        <li class="${ts.parts.regularity === 30 ? 'done' : ''}">${icon(ts.parts.regularity === 30 ? 'check' : 'clock')} متتأخرش على مواعيد الصيانة <small>${num(ts.parts.regularity)}/٣٠</small></li>
        <li class="${ts.parts.odometer === 30 ? 'done' : ''}">${icon(ts.parts.odometer === 30 ? 'check' : 'gauge')} قراءات عداد متسلسلة <small>${num(ts.parts.odometer)}/٣٠</small></li>
      </ul>
    </section>`;

  view.querySelectorAll('[data-action=odometer]').forEach(b => b.onclick = () => openOdometer(car));
  view.querySelector('[data-action=score]').onclick = () => explainScore(car, ts);
  view.querySelectorAll('.record').forEach(li => li.onclick = () => go('add/' + li.dataset.id));
}

function openOdometer(car) {
  let photo = null;
  modal.innerHTML = `<form method="dialog" class="form" id="odo-form">
    <h2>حدّث العداد</h2>
    <p class="muted small">صوّر تابلوه العربية والعداد باين فيها، واكتب الرقم اللي في الصورة. الصورة بتتحفظ مع القراءة كإثبات للمشتري.</p>
    <label class="upload">${icon('camera')}<span>صوّر العداد</span><input type="file" accept="image/*" capture="environment" id="odo-photo"></label>
    <div id="odo-preview"></div>
    <label>الرقم اللي على العداد (كم)<input name="km" type="number" min="0" inputmode="numeric" required value="${currentKm(car)}"></label>
    <p class="muted small" id="odo-check"></p>
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>إلغاء</button>
      <button class="btn primary" value="ok">حفظ</button>
    </div>
  </form>`;
  modal.returnValue = '';
  modal.showModal();
  const form = modal.querySelector('form');
  const check = () => {
    const km = Number(form.elements.km.value);
    const last = currentKm(car);
    document.getElementById('odo-check').innerHTML = km < last
      ? `<span class="neg">${icon('triangle-alert', 'tiny')} الرقم ده أقل من آخر قراءة (${num(last)} كم). اتأكد منه.</span>`
      : km > last ? `هتضيف ${num(km - last)} كم من آخر قراءة.` : '';
  };
  form.elements.km.oninput = check;
  document.getElementById('odo-photo').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photo = await compressImage(file, 1100, 0.7);
      document.getElementById('odo-preview').innerHTML = `<img src="${photo}" alt="صورة العداد">`;
      form.elements.km.select();
    } catch { toast('مقدرناش نقرا الصورة'); }
  };
  form.onsubmit = e => {
    if (e.submitter?.value !== 'ok') return;
    const km = Number(new FormData(form).get('km'));
    car.records.push({ id: uid(), date: today(), km, type: 'odometer', title: 'قراءة عداد', source: photo ? 'photo' : 'owner', photo, parts: [] });
    persist();
    toast(photo ? 'القراءة اتسجّلت بالصورة' : 'القراءة اتسجّلت. المرة الجاية صوّر العداد عشان تبقى موثّقة');
    render();
  };
}

// Plain-language breakdown of the record score, opened from the ring on the home screen.
function explainScore(car, ts) {
  const row = (ic, title, got, max, detail) => `<li>
    <span class="ico ${got === max ? 'tone-good' : 'tone-soon'}">${icon(got === max ? 'check' : ic)}</span>
    <div class="grow"><b>${title} <span class="pts">${num(got)} من ${num(max)}</span></b><small>${detail}</small></div>
  </li>`;
  const services = car.records.filter(r => r.type !== 'odometer');
  const proven = services.filter(r => r.source === 'invoice' || r.source === 'workshop').length;
  modal.innerHTML = `<form method="dialog" class="form explain">
    <div class="explain-head">${scoreRing(ts.score)}<div><h2>درجة السجل: ${num(ts.score)} من ١٠٠</h2>
      <small class="muted">بتقول للمشتري قد إيه يقدر يصدّق تاريخ العربية دي. كل ما تعلى، العربية تتباع أسهل وبسعر أحسن.</small></div></div>
    ${ts.empty ? '<p class="notice"><span>الدرجة بتبدأ تتحسب أول ما تسجّل أول صيانة.</span></p>' : `<ul class="list">
      ${row('receipt', 'الإثبات', ts.parts.documentation, 40, `${num(proven)} من ${num(services.length)} صيانة معاها فاتورة أو تأكيد ورشة. صيانة من غير فاتورة بتتحسب، بس قيمتها أقل.`)}
      ${row('clock', 'الالتزام بالمواعيد', ts.parts.regularity, 30, ts.overdue ? `في ${num(ts.overdue)} صيانة متأخرة، وكل واحدة بتنقّص ١٠.` : 'مفيش صيانة متأخرة.')}
      ${row('gauge', 'العداد', ts.parts.odometer, 30, `${ts.parts.odometer >= 20 ? 'القراءات ماشية بالترتيب (٢٠).' : 'في قراءة أقل من اللي قبلها (٠ من ٢٠).'} ${ts.freshPhoto ? 'وفي صورة عداد حديثة (١٠).' : 'صوّر العداد مرة في الشهر عشان تاخد الـ ١٠ الباقيين.'}`)}
    </ul>`}
    <h3>درجات الثقة في كل سجل</h3>
    <ul class="levels">
      ${['workshop', 'invoice', 'owner'].map(k => `<li><span class="badge ${k}">${SOURCES[k].label}</span><small>${SOURCES[k].hint}</small></li>`).join('')}
    </ul>
    <button class="btn primary wide" value="cancel">فهمت</button>
  </form>`;
  modal.returnValue = '';
  modal.showModal();
}

function recordItem(r, flagged) {
  const t = SERVICE_TYPES[r.type] || SERVICE_TYPES.other;
  const wi = warrantyInfo(r, today());
  return `<li class="record ${flagged ? 'flagged' : ''}" data-id="${esc(r.id)}">
    <span class="ico">${icon(t.icon)}</span>
    <div class="grow">
      <b>${esc(r.title || t.label)}</b>
      <small>${esc(r.date)} • ${num(r.km)} كم${r.workshop ? ` • ${esc(r.workshop)}` : ''}</small>
      ${r.parts?.length ? `<small class="parts">${r.parts.map(p => `${esc(p.name)} (${esc(PART_GRADES[p.grade] || p.grade)})`).join('، ')}</small>` : ''}
      ${flagged ? `<small class="warn">${icon('triangle-alert', 'tiny')} القراءة دي أقل من قراءة قبلها</small>` : ''}
    </div>
    <div class="end">
      ${r.cost ? `<b>${money(r.cost)}</b>` : ''}
      ${wi?.active ? `<span class="badge good">${icon('shield-check', 'tiny')} ضمان</span>` : `<span class="badge ${esc(r.source)}">${esc(SOURCES[r.source]?.label || '')}</span>`}
    </div>
  </li>`;
}

function viewLog(car, filter = '') {
  const flagged = new Set(odometerAnomalies(car).map(a => a.recordId));
  const records = sortedRecords(car).reverse().filter(r => !filter || r.type === filter);
  const usedTypes = [...new Set(car.records.map(r => r.type))];

  view.innerHTML = `
    <div class="page-head"><h1 class="page-title">السجل</h1>
      ${usedTypes.length > 1 ? `<select id="log-filter" aria-label="فلترة">
        <option value="">كل الأنواع</option>
        ${usedTypes.map(k => `<option value="${k}" ${k === filter ? 'selected' : ''}>${SERVICE_TYPES[k]?.label || k}</option>`).join('')}
      </select>` : ''}
    </div>
    ${records.length
      ? `<ul class="list card timeline">${records.map(r => recordItem(r, flagged.has(r.id))).join('')}</ul>`
      : `<div class="empty-state">${icon('scroll-text')}<p>لسه مفيش سجلات. ابدأ بآخر تغيير زيت عملته.</p><a class="btn primary" href="#add">سجّل أول صيانة</a></div>`}`;

  document.getElementById('log-filter')?.addEventListener('change', e => viewLog(car, e.target.value));
  view.querySelectorAll('.record').forEach(li => li.onclick = () => go('add/' + li.dataset.id));
}

function partRow(p = {}) {
  return `<div class="part-row">
    <input name="partName" placeholder="اسم القطعة" value="${esc(p.name)}">
    <select name="partGrade">${Object.entries(PART_GRADES).map(([k, v]) =>
      `<option value="${k}" ${k === p.grade ? 'selected' : ''}>${v}</option>`).join('')}</select>
    <button type="button" class="icon-btn" data-remove-part aria-label="شيل">${icon('x')}</button>
  </div>`;
}

// arg: a record id to edit, or "shop:<id>" to log a job done at an app workshop (gets the warranty).
function viewAdd(car, arg) {
  const shop = arg?.startsWith('shop:') ? findShop(arg.slice(5)) : null;
  const rec = arg && !shop ? car.records.find(r => r.id === arg) : null;
  if (arg && !shop && !rec) return go('log');
  const r = rec || { date: today(), km: currentKm(car), type: shop ? 'repair' : 'oil', source: 'owner', parts: [], workshop: shop?.name };
  let photo = r.photo || null;
  const known = workshopDirectory(state.cars, state.workshops).map(w => w.name);

  view.innerHTML = `
    <h1 class="page-title">${rec ? 'تفاصيل الصيانة' : 'سجّل'}</h1>
    ${rec || shop ? '' : `<nav class="seg three" aria-label="تسجّل إيه؟">
      <a href="#add" class="on">${icon('wrench')} صيانة</a>
      <button type="button" data-quick="fuel">${icon('fuel')} تفويلة</button>
      <button type="button" data-quick="odo">${icon('gauge')} عداد</button>
    </nav>`}
    ${shop ? `<div class="notice good">${icon('shield-check')}<span>شغل مع <b>${esc(shop.name)}</b>. هياخد ضمان باسبور ${num(shop.warrantyDays)} يوم من تاريخ الشغل.</span></div>` : ''}
    ${rec ? warrantyBlock(rec) : ''}
    <form id="rec-form" class="card form">
      <label>النوع
        <select name="type">${Object.entries(SERVICE_TYPES).map(([k, t]) =>
          `<option value="${k}" ${k === r.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
      </label>
      <label>وصف مختصر<input name="title" value="${esc(r.title)}" placeholder="مثلاً: زيت 5W-30 + فلتر زيت"></label>
      <div class="row2">
        <label>التاريخ<input name="date" type="date" required value="${esc(r.date)}" max="${today()}"></label>
        <label>العداد (كم)<input name="km" type="number" min="0" inputmode="numeric" required value="${esc(r.km)}"></label>
      </div>
      <div class="row2">
        <label>التكلفة (ج.م)<input name="cost" type="number" min="0" inputmode="numeric" value="${esc(r.cost ?? '')}"></label>
        <label>الورشة / المركز<input name="workshop" list="ws-list" value="${esc(r.workshop)}" ${shop ? 'readonly' : ''}></label>
        <datalist id="ws-list">${known.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      </div>
      <fieldset>
        <legend>قطع الغيار</legend>
        <div id="parts">${(r.parts || []).map(partRow).join('')}</div>
        <button type="button" class="btn small" id="add-part">${icon('plus')} قطعة</button>
      </fieldset>
      <fieldset>
        <legend>صورة الفاتورة <small>(بترفع درجة السجل)</small></legend>
        <label class="upload">${icon('camera')}<span>صوّر أو ارفع الفاتورة</span><input type="file" accept="image/*" capture="environment" id="photo-input"></label>
        <div id="photo-preview">${photo ? `<img src="${photo}" alt="الفاتورة">` : ''}</div>
        <p class="trust-hint" id="trust-hint"></p>
      </fieldset>
      <label>ملاحظات<textarea name="notes" rows="2">${esc(r.notes)}</textarea></label>
      <button class="btn primary wide" type="submit">حفظ</button>
      ${rec ? `<button class="btn danger wide" type="button" id="del-rec">${icon('trash-2')} مسح السجل</button>` : ''}
    </form>`;

  const form = document.getElementById('rec-form');
  const parts = document.getElementById('parts');
  document.getElementById('add-part').onclick = () => parts.insertAdjacentHTML('beforeend', partRow());
  parts.onclick = e => { if (e.target.closest('[data-remove-part]')) e.target.closest('.part-row').remove(); };
  if (rec) bindWarranty(rec);
  view.querySelector('[data-quick=fuel]')?.addEventListener('click', () => editFuel(car, null));
  view.querySelector('[data-quick=odo]')?.addEventListener('click', () => openOdometer(car));
  const showTrust = () => {
    const k = rec?.source === 'workshop' ? 'workshop' : photo ? 'invoice' : 'owner';
    document.getElementById('trust-hint').innerHTML = `هيتسجّل <span class="badge ${k}">${SOURCES[k].label}</span> ${k === 'owner'
      ? 'ومقبول، بس صورة الفاتورة بتخلّيه يتحسب أكتر في درجة السجل وفي تقرير المشتري.' : ''}`;
  };
  showTrust();

  document.getElementById('photo-input').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      photo = await compressImage(file);
      document.getElementById('photo-preview').innerHTML = `<img src="${photo}" alt="الفاتورة">`;
      showTrust();
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
      source: rec?.source === 'workshop' ? 'workshop' : photo ? (fd.get('type') === 'odometer' ? 'photo' : 'invoice') : 'owner',
    };
    let saved = rec;
    if (rec) Object.assign(rec, data);
    else {
      saved = { id: uid(), ...data };
      if (shop) saved.warranty = newWarranty(shop.id, data.date, shop.warrantyDays);
      car.records.push(saved);
    }
    persist();
    const flagged = odometerAnomalies(car).some(a => a.recordId === saved.id);
    toast(flagged ? 'اتحفظ، بس العداد أقل من قراءة قبلها. اتأكد منه' : shop ? 'اتسجّل والضمان بدأ' : 'اتسجّل');
    go(shop ? 'shop/' + shop.id : 'log');
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
    qrSvg = '<p class="muted">السجل كبير على الـ QR. استخدم اللينك.</p>';
  }

  view.innerHTML = `
    <h1 class="page-title">الباسبور</h1>
    <section class="card passport">
      <div class="passport-cover">
        <small>${icon('book-marked', 'tiny')} باسبور العربية</small>
        <b>${esc(car.make)} ${esc(car.model)} ${esc(car.year)}</b>
      </div>
      <div class="qr">${qrSvg}</div>
      <p>المشتري أو الورشة يعمل سكان للكود ويشوف <b>تقرير تاريخ العربية</b> كامل، من غير اسمك ولا رقمك، واللوحة والشاسيه متخبيين جزئياً.</p>
      <label class="switch"><input type="checkbox" id="share-costs" ${includeCosts ? 'checked' : ''}> اعرض التكاليف في التقرير</label>
      <div class="actions">
        <button class="btn primary" id="share">${icon('share-2')} شارك التقرير</button>
        <button class="btn" id="copy">${icon('link')} انسخ اللينك</button>
        <a class="btn" href="#report">${icon('eye')} اعرض التقرير</a>
      </div>
      <input id="link-box" class="link-box" readonly dir="ltr" value="${esc(link)}" hidden>
    </section>

    <section class="card">
      <h2>نقل الملكية</h2>
      <p class="muted">بعت العربية؟ نزّل ملف الباسبور وابعته للمالك الجديد يستورده عنده، فتفضل قصة العربية مكمّلة معاها.</p>
      <div class="actions">
        <button class="btn" id="export">${icon('download')} نزّل ملف الباسبور</button>
        <button class="btn danger" id="transfer">${icon('key-round')} نقل الملكية</button>
      </div>
    </section>`;

  document.getElementById('share-costs').onchange = e => { state.shareCosts = e.target.checked; persist(); viewPassport(car); };
  document.getElementById('copy').onclick = async () => {
    try { await navigator.clipboard.writeText(link); toast('اللينك اتنسخ'); }
    catch {
      const box = document.getElementById('link-box');
      box.hidden = false;
      box.select();
      toast('النسخ التلقائي مش متاح هنا. انسخ اللينك من الخانة');
    }
  };
  document.getElementById('share').onclick = async () => {
    const title = `باسبور ${car.make} ${car.model} ${car.year}`;
    if (navigator.share) {
      try { await navigator.share({ title, text: title, url: link }); } catch { /* user cancelled */ }
    } else document.getElementById('copy').click();
  };
  const fileName = `passport-${car.make}-${car.model}-${car.year}.json`.replace(/\s+/g, '_');
  document.getElementById('export').onclick = () => download(fileName, exportCar(car));
  document.getElementById('transfer').onclick = async () => {
    if (!await ask('هننزّل ملف الباسبور، وبعدها العربية هتتمسح من الموبايل ده. كمّل؟', 'انقل الملكية')) return;
    download(fileName, exportCar(car));
    state.cars = state.cars.filter(c => c.id !== car.id);
    state.activeCarId = state.cars[0]?.id || null;
    persist();
    toast('ابعت الملف للمالك الجديد');
    go('home');
  };
}

// What the buyer sees, rendered in-app from the same payload the share link carries.
function viewReport(car) {
  const report = buildReport(car, { includeCosts: state.shareCosts !== false, today: today() });
  view.innerHTML = `<a class="back" href="#passport">${icon('chevron-left', 'flip')} الباسبور</a><h1 class="page-title">معاينة التقرير</h1><div id="report-body"></div>`;
  renderReport(document.getElementById('report-body'), expandReport(JSON.parse(JSON.stringify(report))));
}

function viewMore(car) {
  const item = (href, ic, label, extra = '') => `<li><a href="${href}" ${extra}>${icon(ic)}<span>${label}</span>${icon('chevron-left', 'chev')}</a></li>`;
  view.innerHTML = `
    <h1 class="page-title">المزيد</h1>
    <ul class="menu card">
      ${item('#reminders', 'bell', 'كل التذكيرات')}
      ${item('#docs', 'file-text', 'ورق العربية')}
      ${item('#fuel', 'fuel', 'البنزين والاستهلاك')}
      ${item('#lights', 'triangle-alert', 'دليل لمبات التابلوه')}
      ${item('#car', 'pencil', 'بيانات العربية والرخصة والتأمين')}
      ${item('#newcar', 'car', 'ضيف عربية تانية')}
    </ul>
    <h2 class="section-title">لأصحاب الأعمال</h2>
    ${bizAccounts()}
    <ul class="menu card">
      ${item('#join', 'wrench', 'سجّل ورشتك على باسبور')}
      ${item('#join-store', 'package', 'افتح محل قطع غيار على باسبور')}
    </ul>
    <ul class="menu card">
      <li><label class="file-link">${icon('download')}<span>استيراد باسبور (عربية اشتريتها)</span><input type="file" accept="application/json,.json" id="import" hidden></label></li>
      <li><button class="link-row" id="backup">${icon('file-text')}<span>نسخة احتياطية لكل البيانات</span></button></li>
      <li><button class="link-row danger" id="delete-car">${icon('trash-2')}<span>مسح العربية دي</span></button></li>
    </ul>
    <p class="muted small privacy">${icon('shield-check', 'tiny')} كل بياناتك متخزنة على موبايلك بس. التقرير اللي بتشاركه مفيهوش اسمك ولا رقمك ولا صور الفواتير.</p>`;

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
      toast('الباسبور اتنقل لك. راجع الرخصة والتأمين');
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

function viewReminders(car) {
  const t = today();
  const rem = reminders(car, t, kmNow(car, t));
  const est = estimateKm(car, t);
  view.innerHTML = `
    <a class="back" href="#home">${icon('chevron-left', 'flip')} الرئيسية</a>
    <h1 class="page-title">التذكيرات</h1>
    <p class="muted small">المواعيد محسوبة من آخر مرة اتسجّلت ومن فترات عامة متعارف عليها. ارجع لكتالوج عربيتك للمواعيد الدقيقة.${est && est.daysSince > 0 ? ` الكيلومترات محسوبة على عداد تقديري ${num(est.km)} كم.` : ''}</p>
    <ul class="list card">${rem.map(reminderItem).join('') || '<li class="muted">مفيش تذكيرات</li>'}</ul>`;
}

function viewLights() {
  const SEV = { red: ['overdue', 'وقّف'], amber: ['soon', 'افحص قريب'], info: ['ok', 'معلومة'] };
  view.innerHTML = `
    <a class="back" href="#more">${icon('chevron-left', 'flip')} المزيد</a>
    <h1 class="page-title">لمبات التابلوه</h1>
    <p class="muted small">إرشاد عام مش تشخيص. لو مش متأكد، اقف في مكان آمن واتصل بميكانيكي.</p>
    <ul class="list card">${WARNING_LIGHTS.map(l => `
      <li class="light">
        <span class="ico tone-${SEV[l.severity][0]}">${icon(l.icon)}</span>
        <div class="grow"><b>${l.name}</b><small>${l.advice}</small></div>
        <span class="pill ${SEV[l.severity][0]}">${SEV[l.severity][1]}</span>
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

const TAB_OF = { docs: 'home', fuel: 'home', report: 'passport', shop: 'workshops', chat: 'workshops', join: 'workshops', parts: 'workshops', store: 'workshops', cart: 'workshops', 'join-store': 'workshops' };
// Pages a workshop or parts-store owner can open without having a car in the app.
const NO_CAR_ROUTES = {
  join: arg => viewJoin(arg), 'join-store': arg => viewJoinStore(arg), biz: arg => viewBiz(arg), 'store-biz': arg => viewStoreBiz(arg),
  inbox: arg => viewInbox(arg), shop: arg => viewShop(arg), store: arg => viewStore(arg, null),
};

function render() {
  const [route, ...rest] = (location.hash.slice(1) || 'home').split('/');
  const arg = rest.join('/');
  const car = activeCar();
  renderCarSwitch();
  const tab = TAB_OF[route] || route;
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelector('.tabbar').hidden = !car;
  document.querySelector('.top-more').hidden = !car;
  document.body.dataset.route = route;
  window.scrollTo(0, 0);

  if (!car && NO_CAR_ROUTES[route]) return NO_CAR_ROUTES[route](arg);
  if (!car || route === 'newcar') {
    if (car) { view.innerHTML = '<h1 class="page-title">عربية جديدة</h1>' + carForm(); bindCarForm(null); }
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
    docs: () => viewDocs(car),
    fuel: () => viewFuel(car),
    report: () => viewReport(car),
    workshops: () => viewWorkshops(car),
    shop: () => viewShop(arg),
    chat: () => viewChat(arg),
    join: () => viewJoin(arg),
    'join-store': () => viewJoinStore(arg),
    parts: () => viewParts(car),
    store: () => viewStore(arg, car),
    cart: () => viewCart(car),
    biz: () => viewBiz(arg),
    'store-biz': () => viewStoreBiz(arg),
    inbox: () => viewInbox(arg),
    lights: () => viewLights(),
    car: () => { view.innerHTML = '<h1 class="page-title">بيانات العربية</h1>' + carForm(car); bindCarForm(car); },
  }[route] || (() => viewHome(car)))();
}

setRender(render);
hydrateIcons();
document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => go(b.dataset.tab));
window.addEventListener('hashchange', render);
render();

try { navigator.serviceWorker?.register('sw.js').catch(() => {}); } catch { /* sandboxed view */ }
