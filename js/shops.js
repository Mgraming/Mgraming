// Workshops: location, nearby marketplace listings, workshop pages, in-app chat, warranty and reviews.
import { icon } from './icons.js';
import { SPECIALTIES, WARRANTY, DEMO_WORKSHOPS } from './market.js';
import { AREAS, RADII } from './places.js';
import { WORKSHOP_CATEGORIES, mapsSearchUrl } from './cars.js';
import { nearbyWorkshops, ratingSummary, warrantyInfo, workshopDirectory } from './logic.js';
import { uid } from './store.js';
import {
  state, view, modal, esc, num, money, km, today, stars, persist, toast, go, rerender, choose,
} from './ui.js';

export const allShops = () => [...state.market.listings, ...DEMO_WORKSHOPS];
export const findShop = id => allShops().find(w => w.id === id) || null;
const reviewsOf = id => state.market.reviews[id] || [];
const minPrice = w => w.services?.length ? Math.min(...w.services.map(s => Number(s.price) || Infinity)) : null;

function shopBadges(w) {
  return [
    w.demo ? '<span class="tag muted-tag">مثال للعرض</span>' : '',
    w.pending ? '<span class="tag warn-tag">في انتظار المراجعة</span>' : '',
    `<span class="tag good-tag">${icon('shield-check')} ضمان ${num(w.warrantyDays)} يوم</span>`,
  ].join('');
}

// ---------- location ----------

export function locationLabel() {
  return state.location ? state.location.label : 'حدد مكانك';
}

export async function pickArea() {
  const v = await choose({
    title: 'إنت فين؟', columns: 2,
    items: AREAS.map((a, i) => ({ label: a.name, sub: a.gov, value: i, selected: state.location?.label === a.name })),
  });
  if (v == null) return false;
  const a = AREAS[v];
  state.location = { lat: a.lat, lng: a.lng, label: a.name, source: 'area' };
  persist();
  return true;
}

export function useGps() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { toast('الموبايل ده مش بيدعم تحديد المكان. اختار منطقتك'); return resolve(pickArea()); }
    toast('بنحدد مكانك…');
    navigator.geolocation.getCurrentPosition(
      pos => {
        state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'مكاني الحالي', source: 'gps' };
        persist();
        resolve(true);
      },
      () => { toast('مقدرناش نوصل لمكانك. اختار منطقتك من القايمة'); resolve(pickArea()); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  });
}

function locationGate() {
  return `<section class="card loc-gate">
    <div class="loc-icon">${icon('map-pin')}</div>
    <h2>حدد مكانك الأول</h2>
    <p class="muted">عشان نطلع لك الورش القريبة منك بس، ومن غير ما نلفّك على ورش بعيدة.</p>
    <div class="stack">
      <button class="btn primary" id="loc-gps">${icon('locate-fixed')} استخدم موقعي الحالي</button>
      <button class="btn" id="loc-area">${icon('map-pin')} اختار منطقتي من القايمة</button>
    </div>
    <p class="muted small">مكانك بيتحفظ على موبايلك بس.</p>
  </section>`;
}

// ---------- list ----------

let filter = { specialty: '' };

export function viewWorkshops(car) {
  if (!state.location && !state.skipLocation) {
    view.innerHTML = `<h1 class="page-title">ورش وقطع غيار</h1>${locationGate()}
      <button class="link center" id="loc-skip">اعرض كل الورش من غير تحديد مكان</button>`;
    document.getElementById('loc-gps').onclick = async () => { if (await useGps()) rerender(); };
    document.getElementById('loc-area').onclick = async () => { if (await pickArea()) rerender(); };
    document.getElementById('loc-skip').onclick = () => { state.skipLocation = true; persist(); rerender(); };
    return;
  }

  const radius = state.location ? state.radiusKm : Infinity;
  const shops = nearbyWorkshops(allShops(), state.location, { radiusKm: radius, specialty: filter.specialty });
  const nextRadius = RADII.find(r => r.km > radius);
  const near = state.location?.source === 'area' ? state.location.label : '';

  view.innerHTML = `
    <h1 class="page-title">ورش وقطع غيار</h1>
    <nav class="seg" aria-label="القسم">
      <a href="#workshops" class="on">${icon('wrench')} ورش</a>
      <a href="#parts">${icon('package')} قطع غيار</a>
    </nav>
    <button class="loc-bar" id="loc-change">
      <span class="loc-dot">${icon('map-pin')}</span>
      <span class="grow"><small>بندوّر حوالين</small><b>${esc(locationLabel())}</b></span>
      <span class="link">غيّر</span>
    </button>

    ${state.location ? `<div class="chips" role="group" aria-label="المسافة">
      ${RADII.map(r => `<button class="chip ${r.km === radius ? 'on' : ''}" data-radius="${r.km}">${r.label}</button>`).join('')}
    </div>` : ''}

    <div class="chips scroll" role="group" aria-label="التخصص">
      <button class="chip ${!filter.specialty ? 'on' : ''}" data-spec="">الكل</button>
      ${Object.entries(SPECIALTIES).map(([k, s]) => `<button class="chip ${filter.specialty === k ? 'on' : ''}" data-spec="${k}">${icon(s.icon)} ${s.label}</button>`).join('')}
    </div>

    <p class="notice">${icon('info')}<span>الورش اللي تحت <b>أمثلة للعرض</b> لحد ما الورش الحقيقية تنضم. الأسعار توضيحية.</span></p>

    ${shops.length ? `<div class="shop-list">${shops.map(shopCard).join('')}</div>` : `
      <div class="empty-card card">
        <p>مفيش ورش ${filter.specialty ? `«${SPECIALTIES[filter.specialty].label}» ` : ''}في نطاق ${RADII.find(r => r.km === radius)?.label || ''} منك.</p>
        ${nextRadius ? `<button class="btn primary" data-radius="${nextRadius.km}">وسّع البحث لـ ${nextRadius.label}</button>` : ''}
      </div>`}

    <section class="card">
      <h2>مش لاقي اللي محتاجه؟</h2>
      <p class="muted small">دوّر على خرائط جوجل${near ? ` في ${esc(near)}` : ' حواليك'}. دي ورش برّه التطبيق ومش عليها ضمان باسبور.</p>
      <div class="chips wrap">
        ${WORKSHOP_CATEGORIES.map(c => `<a class="chip" href="${esc(mapsSearchUrl(c.query(car.make), near))}" target="_blank" rel="noopener">${esc(c.label)} ${icon('chevron-left', 'tiny')}</a>`).join('')}
      </div>
    </section>

    ${visitedSection()}

    <a class="join-cta" href="#join">
      <span class="join-icon">${icon('store')}</span>
      <span class="grow"><b>عندك ورشة أو مركز صيانة؟</b><small>اعمل صفحة لورشتك وخلّي العملا يوصلوا لك</small></span>
      ${icon('chevron-left')}
    </a>`;

  document.getElementById('loc-change').onclick = async () => {
    const v = await choose({ title: 'غيّر المكان', columns: 1, items: [
      { label: 'استخدم موقعي الحالي', value: 'gps' },
      { label: 'اختار منطقة من القايمة', value: 'area' },
    ] });
    if (v === 'gps' && await useGps()) rerender();
    if (v === 'area' && await pickArea()) rerender();
  };
  view.querySelectorAll('[data-radius]').forEach(b => b.onclick = () => {
    state.radiusKm = Number(b.dataset.radius); persist(); rerender();
  });
  view.querySelectorAll('[data-spec]').forEach(b => b.onclick = () => { filter.specialty = b.dataset.spec; rerender(); });
  view.querySelectorAll('.shop-card').forEach(c => c.onclick = () => go('shop/' + c.dataset.id));
  bindVisited();
}

function shopCard(w) {
  const r = ratingSummary(reviewsOf(w.id));
  const from = minPrice(w);
  return `<article class="shop-card" data-id="${esc(w.id)}" tabindex="0">
    <div class="shop-avatar">${icon(SPECIALTIES[w.specialties[0]]?.icon || 'store')}</div>
    <div class="grow">
      <div class="shop-top"><b>${esc(w.name)}</b>${w.distanceKm != null ? `<span class="dist">${km(w.distanceKm)}</span>` : ''}</div>
      <small class="muted">${esc(w.area)} • ${w.specialties.map(s => SPECIALTIES[s]?.label).filter(Boolean).join('، ')}</small>
      <div class="shop-meta">
        ${r.count ? `${stars(r.avg)} <small>${num(r.avg)} (${num(r.count)})</small>` : '<small class="muted">لسه مفيش تقييمات</small>'}
        ${from ? `<small class="price-from">من ${money(from)}</small>` : ''}
      </div>
      <div class="tags">${shopBadges(w)}</div>
    </div>
  </article>`;
}

// Workshops the owner visited outside the marketplace (from the service log) or saved by hand.
function visitedSection() {
  const dir = workshopDirectory(state.cars, state.workshops);
  return `<section class="card">
    <div class="card-head"><h2>ورش زرتها</h2><button class="btn small" id="add-ws">${icon('plus')} ضيف</button></div>
    ${dir.length ? `<ul class="list">${dir.map((w, i) => `
      <li class="ws-item" data-i="${i}">
        <span class="ico">${icon('wrench')}</span>
        <div class="grow">
          <b>${esc(w.name)}</b>
          ${w.rating ? stars(w.rating, 'sm') : ''}
          <small>${w.visits ? `${num(w.visits)} زيارة • ${money(w.spent)} • آخر مرة ${esc(w.lastDate)}` : 'لسه مفيش زيارات مسجّلة'}</small>
          ${w.area ? `<small>${esc(w.area)}</small>` : ''}
        </div>
        ${icon('chevron-left', 'chev')}
      </li>`).join('')}</ul>`
      : '<p class="muted small">الورش اللي بتكتبها مع الصيانة هتظهر هنا لوحدها، ومعاها عدد الزيارات واللي صرفته.</p>'}
  </section>`;
}

function bindVisited() {
  const dir = workshopDirectory(state.cars, state.workshops);
  document.getElementById('add-ws').onclick = () => editVisited({});
  view.querySelectorAll('.ws-item').forEach(li => li.onclick = () => editVisited(dir[li.dataset.i]));
}

function editVisited(w) {
  const saved = state.workshops.find(x => x.id && x.id === w.id);
  modal.innerHTML = `<form method="dialog" class="form" id="ws-form">
    <h2>${w.name ? esc(w.name) : 'ورشة جديدة'}</h2>
    <label>الاسم*<input name="name" required value="${esc(w.name)}"></label>
    <div class="row2">
      <label>التليفون<input name="phone" type="tel" dir="ltr" value="${esc(w.phone)}"></label>
      <label>المنطقة<input name="area" value="${esc(w.area)}" placeholder="مثلاً: مدينة نصر"></label>
    </div>
    <fieldset class="rating">
      <legend>تقييمك</legend>
      ${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="rate-${n}" value="${n}" ${Number(w.rating) === n ? 'checked' : ''}><label for="rate-${n}" title="${n}">${icon('star')}</label>`).join('')}
    </fieldset>
    <label>ملاحظات<textarea name="notes" rows="2" placeholder="أمين؟ أسعاره؟ بيلتزم بالمعاد؟">${esc(w.notes)}</textarea></label>
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
    if (action === 'delete') state.workshops = state.workshops.filter(x => x !== saved);
    else if (action === 'ok') {
      const f = Object.fromEntries(new FormData(e.target));
      const data = { name: f.name.trim(), phone: f.phone.trim(), area: f.area.trim(), rating: Number(f.rating) || 0, notes: f.notes.trim() };
      if (saved) Object.assign(saved, data);
      else state.workshops.push({ id: uid(), ...data });
    } else return;
    persist();
    rerender();
  };
}

// ---------- workshop page ----------

function jobsAt(id) {
  return state.cars.flatMap(c => c.records.filter(r => r.warranty?.workshopId === id).map(r => ({ car: c, rec: r })));
}

export function viewShop(id) {
  const w = findShop(id);
  if (!w) return go('workshops');
  const [withDist] = nearbyWorkshops([w], state.location);
  const reviews = reviewsOf(id);
  const r = ratingSummary(reviews);
  const unrated = jobsAt(id).filter(j => !j.rec.reviewed);

  view.innerHTML = `
    <a class="back" href="#workshops">${icon('chevron-left', 'flip')} الورش</a>
    <section class="shop-hero card">
      <div class="shop-avatar lg">${icon(SPECIALTIES[w.specialties[0]]?.icon || 'store')}</div>
      <div class="grow">
        <h1>${esc(w.name)}</h1>
        <p class="muted">${icon('map-pin', 'tiny')} ${esc(w.area)}${withDist.distanceKm != null ? ` • ${km(withDist.distanceKm)} منك` : ''}</p>
        <div class="shop-meta">${r.count ? `${stars(r.avg)} <b>${num(r.avg)}</b> <small class="muted">(${num(r.count)} تقييم)</small>` : '<small class="muted">لسه مفيش تقييمات</small>'}</div>
        <div class="tags">${shopBadges(w)}</div>
      </div>
    </section>

    ${state.market.listings.includes(w) ? `<a class="notice" href="#biz/${esc(id)}">${icon('gauge')}<span>دي ورشتك. <b>افتح الداشبورد</b></span></a>` : ''}
    <div class="action-row">
      <a class="btn primary" href="#chat/${esc(id)}">${icon('message-circle')} كلّم الورشة</a>
      <button class="btn" id="book">${icon('calendar')} احجز معاد</button>
    </div>

    <section class="card">
      <h2>قايمة الأسعار</h2>
      ${w.services?.length ? `<table class="price-table">
        <tbody>${w.services.map(s => `<tr><td>${esc(s.name)}</td><td class="num">${money(s.price)}</td></tr>`).join('')}</tbody>
      </table>
      <p class="muted small">${w.demo ? 'أسعار توضيحية لورشة تجريبية. ' : ''}الأسعار من الورشة نفسها، وقطع الغيار بتتحسب لوحدها.</p>`
      : '<p class="muted">الورشة لسه ما نزّلتش أسعارها.</p>'}
    </section>

    <section class="card warranty-card">
      <div class="warranty-head">${icon('shield-check')}<div><h2>ضمان باسبور ${num(w.warrantyDays)} يوم</h2><small>على ${WARRANTY.scope}، والضامن هو التطبيق</small></div></div>
      <ul class="terms">${WARRANTY.terms.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <button class="btn wide" id="log-job">${icon('receipt')} الشغل خلص؟ سجّله هنا عشان ياخد الضمان</button>
    </section>

    <section class="card">
      <h2>عن الورشة</h2>
      <dl class="facts">
        <dt>${icon('clock')} المواعيد</dt><dd>${esc(w.hours || '—')}</dd>
        <dt>${icon('wrench')} التخصص</dt><dd>${w.specialties.map(s => SPECIALTIES[s]?.label).filter(Boolean).join('، ')}</dd>
        ${w.about ? `<dt>${icon('info')} نبذة</dt><dd>${esc(w.about)}</dd>` : ''}
      </dl>
      ${w.lat != null ? `<a class="btn small" href="https://www.google.com/maps/search/?api=1&query=${w.lat},${w.lng}" target="_blank" rel="noopener">${icon('navigation')} افتح المكان على الخريطة</a>` : ''}
    </section>

    <section class="card">
      <div class="card-head"><h2>التقييمات</h2>${unrated.length ? '<button class="btn small primary" id="rate">قيّم الورشة</button>' : ''}</div>
      ${reviews.length ? `<ul class="list reviews">${reviews.slice().reverse().map(rv => `
        <li><div class="grow">${stars(rv.rating, 'sm')}<p>${esc(rv.text || '')}</p><small class="muted">${esc(rv.carLabel)} • ${esc(rv.date)}</small></div></li>`).join('')}</ul>`
        : '<p class="muted small">التقييم متاح بس للي عمل شغل في الورشة وسجّله من التطبيق، عشان كل التقييمات تبقى من عملا حقيقيين.</p>'}
    </section>`;

  document.getElementById('book').onclick = () => openBooking(w);
  document.getElementById('log-job').onclick = () => go('add/shop:' + id);
  document.getElementById('rate')?.addEventListener('click', () => openReview(w, unrated[0]));
}

function openBooking(w) {
  modal.innerHTML = `<form method="dialog" class="form" id="book-form">
    <h2>احجز معاد مع ${esc(w.name)}</h2>
    <label>محتاج إيه؟
      <select name="service">${(w.services || []).map(s => `<option>${esc(s.name)}</option>`).join('')}<option>حاجة تانية</option></select>
    </label>
    <label>اليوم المناسب<input name="date" type="date" required min="${today()}" value="${today()}"></label>
    <label>تفاصيل<textarea name="note" rows="2" placeholder="مثلاً: صوت في العفشة من قدام"></textarea></label>
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>إلغاء</button>
      <button class="btn primary" value="ok">ابعت الطلب</button>
    </div>
  </form>`;
  modal.returnValue = '';
  modal.showModal();
  modal.querySelector('form').onsubmit = e => {
    if (e.submitter?.value !== 'ok') return;
    const f = Object.fromEntries(new FormData(e.target));
    sendMessage(w.id, `طلب حجز: ${f.service} يوم ${f.date}${f.note.trim() ? `\n${f.note.trim()}` : ''}`, 'booking');
    toast('طلب الحجز اتسجّل في المحادثة');
    go('chat/' + w.id);
  };
}

function openReview(w, job) {
  modal.innerHTML = `<form method="dialog" class="form">
    <h2>قيّم ${esc(w.name)}</h2>
    <p class="muted small">على شغل ${esc(job.rec.title || '')} يوم ${esc(job.rec.date)}</p>
    <fieldset class="rating big">
      <legend>تقييمك</legend>
      ${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="rv-${n}" value="${n}" required><label for="rv-${n}" title="${n}">${icon('star')}</label>`).join('')}
    </fieldset>
    <label>رأيك<textarea name="text" rows="3" placeholder="الأمانة، الالتزام بالسعر والمعاد، جودة الشغل"></textarea></label>
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>بعدين</button>
      <button class="btn primary" value="ok">انشر التقييم</button>
    </div>
  </form>`;
  modal.returnValue = '';
  modal.showModal();
  modal.querySelector('form').onsubmit = e => {
    if (e.submitter?.value !== 'ok') return;
    const f = Object.fromEntries(new FormData(e.target));
    (state.market.reviews[w.id] ||= []).push({
      rating: Number(f.rating), text: f.text.trim(), date: today(), recordId: job.rec.id,
      carLabel: `${job.car.make} ${job.car.model} ${job.car.year}`,
    });
    job.rec.reviewed = true;
    persist();
    toast('شكراً! تقييمك اتنشر');
    rerender();
  };
}

// ---------- chat ----------

function sendMessage(id, text, kind = 'text') {
  (state.market.chats[id] ||= []).push({ id: uid(), from: 'me', text, kind, at: new Date().toISOString() });
  persist();
}

export function viewChat(id) {
  const w = findShop(id);
  if (!w) return go('workshops');
  const msgs = state.market.chats[id] || [];
  const time = iso => new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

  view.innerHTML = `
    <div class="chat">
      <header class="chat-head">
        <a class="icon-btn" href="#shop/${esc(id)}" aria-label="رجوع">${icon('chevron-left', 'flip')}</a>
        <div class="shop-avatar sm">${icon('store')}</div>
        <div class="grow"><b>${esc(w.name)}</b><small class="muted">رقمك مش بيظهر للورشة</small></div>
      </header>
      <p class="notice">${icon('info')}<span>نسخة تجريبية: الرسايل بتتحفظ على موبايلك ومش بتوصل للورشة لحد ما نشغّل السيرفر.</span></p>
      <div class="msgs" id="msgs">
        ${msgs.length ? msgs.map(m => `<div class="msg ${m.from} ${m.kind}">${m.kind === 'claim' ? `<b>${icon('shield-check', 'tiny')} طلب ضمان</b>` : m.kind === 'booking' ? `<b>${icon('calendar', 'tiny')} طلب حجز</b>` : ''}<p>${esc(m.text)}</p><time>${time(m.at)}</time></div>`).join('')
          : `<div class="chat-empty">${icon('message-circle')}<p>ابدأ الكلام مع الورشة: اسأل على سعر، أو احجز معاد.</p></div>`}
      </div>
      <div class="quick">
        ${['بكام تغيير الزيت لعربيتي؟', 'متاحين امتى النهارده؟', 'محتاج فحص كمبيوتر'].map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
      </div>
      <form class="composer" id="composer">
        <input id="chat-input" placeholder="اكتب رسالتك…" autocomplete="off" aria-label="الرسالة">
        <button class="send" aria-label="ابعت">${icon('send', 'flip')}</button>
      </form>
    </div>`;

  const box = document.getElementById('msgs');
  box.scrollTop = box.scrollHeight;
  const input = document.getElementById('chat-input');
  document.getElementById('composer').onsubmit = e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    sendMessage(id, text);
    rerender();
    document.getElementById('chat-input').focus();
  };
  view.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { input.value = b.dataset.q; input.focus(); });
}

// ---------- warranty on a record ----------

export function warrantyBlock(rec) {
  const wi = warrantyInfo(rec, today());
  if (!wi) return '';
  const shop = findShop(wi.workshopId);
  const claims = wi.claims || [];
  return `<section class="card warranty-card">
    <div class="warranty-head">${icon('shield-check')}<div>
      <h2>${wi.active ? `ضمان شغّال: باقي ${num(wi.daysLeft)} يوم` : 'الضمان خلص'}</h2>
      <small>${esc(shop?.name || '')} • لحد ${esc(wi.until)}</small>
    </div></div>
    ${claims.length ? `<ul class="list">${claims.map(c => `<li><div class="grow"><b>طلب ضمان • ${esc(c.date)}</b><small>${esc(c.text)}</small></div><span class="pill soon">مفتوح</span></li>`).join('')}</ul>` : ''}
    ${wi.active ? '<button type="button" class="btn wide" id="claim">المشكلة رجعت؟ افتح طلب ضمان</button>' : ''}
  </section>`;
}

export function bindWarranty(rec) {
  document.getElementById('claim')?.addEventListener('click', () => {
    modal.innerHTML = `<form method="dialog" class="form">
      <h2>طلب ضمان</h2>
      <p class="muted small">هنبعت الطلب للورشة في المحادثة، ولو ما اتحلّش فريق باسبور هيتدخل.</p>
      <label>إيه اللي حصل؟<textarea name="text" rows="3" required placeholder="مثلاً: نفس الصوت رجع بعد أسبوع"></textarea></label>
      <div class="row2">
        <button class="btn" value="cancel" formnovalidate>إلغاء</button>
        <button class="btn primary" value="ok">ابعت الطلب</button>
      </div>
    </form>`;
    modal.returnValue = '';
    modal.showModal();
    modal.querySelector('form').onsubmit = e => {
      if (e.submitter?.value !== 'ok') return;
      const text = new FormData(e.target).get('text').trim();
      (rec.warranty.claims ||= []).push({ date: today(), text, status: 'open' });
      sendMessage(rec.warranty.workshopId, `${rec.title || 'شغل'} يوم ${rec.date}: ${text}`, 'claim');
      toast('طلب الضمان اتفتح');
      rerender();
    };
  });
}

// ---------- workshop sign-up ----------

// id: edit an existing local listing; omitted: new workshop sign-up.
export function viewJoin(id) {
  const existing = id ? state.market.listings.find(w => w.id === id) : null;
  let loc = existing ? AREAS.find(a => a.name === existing.area) || { name: existing.area, gov: '', lat: existing.lat, lng: existing.lng } : null;
  const v = existing || {};
  view.innerHTML = `
    <a class="back" href="${existing ? `#biz/${esc(id)}` : '#workshops'}">${icon('chevron-left', 'flip')} ${existing ? 'الداشبورد' : 'الورش'}</a>
    <section class="join-hero">
      <h1>${existing ? 'عدّل صفحة الورشة' : 'انضم لباسبور كورشة'}</h1>
      ${existing ? '' : '<p>صفحة لورشتك فيها أسعارك وتقييمات عملا حقيقيين، وعملا جايين لك من المنطقة، وداشبورد تعرف منه دخلك وربحك. وضمان التطبيق بيطمّن العميل إنه يجرّبك.</p>'}
    </section>
    <form id="join-form" class="card form">
      <label>اسم الورشة*<input name="name" required value="${esc(v.name)}"></label>
      <div class="row2">
        <label>اسم المسؤول*<input name="owner" required value="${esc(v.owner)}"></label>
        <label>الموبايل*<input name="phone" type="tel" dir="ltr" required value="${esc(v.phone)}"></label>
      </div>
      <p class="muted small">الموبايل للتواصل مع فريق باسبور بس، ومش بيظهر للعملا. العملا بيكلموك من المحادثة جوه التطبيق.</p>

      <div class="field">
        <span class="field-label">المكان*</span>
        <button type="button" class="select-btn ${loc ? '' : 'empty'}" id="join-loc"><span>${loc ? esc(loc.name) : 'اختار منطقة الورشة'}</span>${icon('chevron-down', 'tiny')}</button>
      </div>

      <fieldset>
        <legend>التخصص*</legend>
        <div class="chips wrap">${Object.entries(SPECIALTIES).map(([k, s]) => `
          <label class="chip check"><input type="checkbox" name="spec" value="${k}" ${v.specialties?.includes(k) ? 'checked' : ''}>${icon(s.icon)} ${s.label}</label>`).join('')}</div>
      </fieldset>

      <label>مواعيد العمل<input name="hours" value="${esc(v.hours)}" placeholder="مثلاً: السبت–الخميس ١٠ص–١٠م"></label>
      <label>نبذة عن الورشة<textarea name="about" rows="2">${esc(v.about)}</textarea></label>

      <fieldset>
        <legend>قايمة الأسعار (المصنعية)</legend>
        <div id="price-rows"></div>
        <button type="button" class="btn small" id="add-price">${icon('plus')} خدمة</button>
      </fieldset>

      <label class="agree"><input type="checkbox" name="agree" required ${existing ? 'checked' : ''}> موافق أدّي ضمان ${num(WARRANTY.days)} يوم على ${WARRANTY.scope} للشغل اللي بيتسجّل من التطبيق، وعلى شروط باسبور.</label>
      <button class="btn primary" type="submit">${existing ? 'حفظ التعديلات' : 'ابعت طلب الانضمام'}</button>
      <p class="muted small">في النسخة دي الطلب بيتحفظ على الموبايل ده بس عشان تشوف شكل صفحتك. لما السيرفر يشتغل، الطلب هيروح لفريق المراجعة.</p>
    </form>`;

  const rows = document.getElementById('price-rows');
  const addRow = (s = {}) => rows.insertAdjacentHTML('beforeend', `<div class="part-row">
    <input name="svc" placeholder="الخدمة" value="${esc(s.name)}"><input name="price" type="number" min="0" inputmode="numeric" placeholder="السعر" class="price-in" value="${esc(s.price)}">
    <button type="button" class="icon-btn" data-remove aria-label="شيل">${icon('x')}</button></div>`);
  if (existing?.services?.length) existing.services.forEach(addRow);
  else { addRow(); addRow(); }
  document.getElementById('add-price').onclick = () => addRow();
  rows.onclick = e => { if (e.target.closest('[data-remove]')) e.target.closest('.part-row').remove(); };

  document.getElementById('join-loc').onclick = async () => {
    const v = await choose({ title: 'مكان الورشة', columns: 2, items: AREAS.map((a, i) => ({ label: a.name, sub: a.gov, value: i })) });
    if (v == null) return;
    loc = AREAS[v];
    const btn = document.getElementById('join-loc');
    btn.classList.remove('empty');
    btn.firstElementChild.textContent = `${loc.name} — ${loc.gov}`;
  };

  document.getElementById('join-form').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const specialties = fd.getAll('spec');
    if (!loc) return toast('اختار مكان الورشة');
    if (!specialties.length) return toast('اختار تخصص واحد على الأقل');
    const prices = fd.getAll('price');
    const services = fd.getAll('svc').map((name, i) => ({ name: name.trim(), price: Number(prices[i]) || 0 }))
      .filter(s => s.name && s.price > 0);
    const data = {
      name: fd.get('name').trim(), owner: fd.get('owner').trim(), phone: fd.get('phone').trim(),
      area: loc.name, lat: loc.lat, lng: loc.lng, specialties, hours: fd.get('hours').trim(),
      about: fd.get('about').trim(), services,
    };
    if (existing) {
      Object.assign(existing, data);
      persist();
      toast('صفحتك اتحدّثت');
      return go('biz/' + existing.id);
    }
    const shop = { id: 'local-' + uid(), brands: [], warrantyDays: WARRANTY.days, pending: true, createdAt: today(), ...data };
    state.market.listings.push(shop);
    persist();
    toast('طلبك اتسجّل! ده الداشبورد بتاع ورشتك');
    go('biz/' + shop.id);
  };
}
