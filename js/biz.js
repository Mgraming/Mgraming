// Workshop dashboard: income and profit per job, monthly chart, inbox with replies, open warranty claims.
import { icon } from './icons.js';
import { PLATFORM_FEE_RATE } from './market.js';
import { jobFinancials, periodStats, periodStart, ratingSummary, warrantyInfo } from './logic.js';
import { uid } from './store.js';
import {
  state, view, modal, esc, num, money, today, persist, toast, go, rerender, ask, stars, barChart, PERIODS,
} from './ui.js';

import { auth, friendlyError } from './backend.js';
import {
  myShops, isRemoteId, loadJobs, saveJob, deleteJob, loadInbox, loadMessages, sendRemoteMessage, watchConversation, toMessage, online,
} from './remote.js';
import { chatLayout, bindChat, appendBubble } from './shops.js';

const myShop = id => state.market.listings.find(w => w.id === id) || myShops().find(w => w.id === id) || null;
const isRemote = id => isRemoteId(id) && online();
// Server-backed workshops keep their jobs and inbox in memory, loaded when the dashboard opens.
const jobsCache = {};
const inboxCache = {};
const jobsOf = id => (isRemote(id) ? jobsCache[id] || [] : (state.market.jobs[id] ||= []));
let period = 'month';

// Load once per visit, then re-draw if the person is still on the same screen.
function loadThen(key, cacheObj, loader) {
  if (cacheObj[key] || cacheObj[`${key}:loading`]) return;
  cacheObj[`${key}:loading`] = true;
  const route = location.hash;
  // On failure keep an empty result so the screen settles instead of retrying in a loop; reopening retries.
  loader().then(v => { cacheObj[key] = v; }, ex => { cacheObj[key] = []; toast(friendlyError(ex)); })
    .finally(() => { cacheObj[`${key}:loading`] = false; if (location.hash === route) rerender(); });
}

function kpi(label, value, tone = '') {
  return `<div class="stat ${tone}"><small>${label}</small><b>${value}</b></div>`;
}

export function viewBiz(id) {
  const shop = myShop(id);
  if (!shop) return go('more');
  if (isRemote(id)) {
    loadThen(id, jobsCache, () => loadJobs(id));
    loadThen(id, inboxCache, () => loadInbox(id));
  }
  const jobs = jobsOf(id);
  const t = today();
  const fin = j => jobFinancials(j, PLATFORM_FEE_RATE);
  const stats = periodStats(jobs, {
    from: periodStart(period, t), today: t, months: 6,
    value: j => { const f = fin(j); return { revenue: f.revenue, profit: f.profit, labor: f.labor, partsPrice: f.partsPrice, partsCost: f.partsCost, fee: f.fee }; },
  });
  const T = stats.totals;
  const reviews = shop.rating || ratingSummary(state.market.reviews[id]);
  const remoteInbox = isRemote(id) ? inboxCache[id] || [] : null;
  const msgs = state.market.chats[id] || [];
  const lastWs = msgs.map(m => m.from).lastIndexOf('ws');
  const unread = remoteInbox ? remoteInbox.reduce((n, c) => n + c.unread, 0) : msgs.slice(lastWs + 1).filter(m => m.from === 'me').length;
  const inboxLabel = remoteInbox
    ? (remoteInbox.length ? `${num(remoteInbox.length)} محادثة` : 'مفيش رسايل لسه')
    : (msgs.length ? `${num(msgs.length)} رسالة` : 'مفيش رسايل لسه');
  const claims = state.cars.flatMap(c => c.records
    .filter(r => r.warranty?.workshopId === id && (r.warranty.claims || []).some(cl => cl.status === 'open'))
    .map(r => ({ car: c, rec: r, wi: warrantyInfo(r, t) })));
  const hasDemo = jobs.some(j => j.demo);

  view.innerHTML = `
    <header class="biz-head">
      <div class="shop-avatar">${icon('store')}</div>
      <div class="grow"><small class="muted">داشبورد الورشة</small><h1>${esc(shop.name)}</h1></div>
      ${shop.pending ? '<span class="tag warn-tag">في انتظار المراجعة</span>' : ''}
    </header>
    <div class="actions">
      <a class="btn small" href="#shop/${esc(id)}">${icon('eye')} صفحتي زي ما العميل شايفها</a>
      <a class="btn small" href="#join/${esc(id)}">${icon('pencil')} عدّل الصفحة والأسعار</a>
    </div>

    <div class="chips" role="group" aria-label="الفترة">
      ${PERIODS.map(p => `<button class="chip ${p.id === period ? 'on' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
    </div>

    <section class="stats">
      ${kpi('الدخل', money(T.revenue || 0))}
      ${kpi('صافي الربح', money(T.profit || 0), (T.profit || 0) < 0 ? 'bad' : 'good')}
      ${kpi('الشغلانات', num(T.count))}
      ${kpi('متوسط الفاتورة', T.count ? money(T.revenue / T.count) : '—')}
    </section>

    <section class="card">
      <div class="card-head"><h2>آخر ٦ شهور</h2></div>
      ${barChart(stats.series, { main: 'revenue', inner: 'profit', mainLabel: 'الدخل', innerLabel: 'صافي الربح' })}
      <dl class="breakdown">
        <dt>مصنعية</dt><dd>${money(T.labor || 0)}</dd>
        <dt>مبيعات قطع غيار</dt><dd>${money(T.partsPrice || 0)}</dd>
        <dt>تكلفة القطع عليك</dt><dd class="neg">− ${money(T.partsCost || 0)}</dd>
        <dt>عمولة باسبور (${num(PLATFORM_FEE_RATE * 100)}٪)</dt><dd class="neg">− ${money(T.fee || 0)}</dd>
        <dt class="total">صافي الربح</dt><dd class="total">${money(T.profit || 0)}</dd>
      </dl>
      <p class="muted small">نسبة العمولة هنا افتراضية للتجربة، والنسبة الحقيقية لسه هتتحدد.</p>
    </section>

    <div class="biz-links">
      <a class="biz-link" href="#inbox/${esc(id)}">
        <span class="ico">${icon('message-circle')}</span>
        <span class="grow"><b>الرسايل والحجوزات</b><small>${inboxLabel}</small></span>
        ${unread ? `<span class="count">${num(unread)}</span>` : icon('chevron-left', 'chev')}
      </a>
      <div class="biz-link static">
        <span class="ico">${icon('star')}</span>
        <span class="grow"><b>التقييم</b><small>${reviews.count ? `${num(reviews.avg)} من ${num(reviews.count)} تقييم` : 'لسه مفيش تقييمات'}</small></span>
        ${reviews.count ? stars(reviews.avg, 'sm') : ''}
      </div>
    </div>

    ${claims.length ? `<section class="card">
      <h2>طلبات ضمان مفتوحة</h2>
      <ul class="list">${claims.map(({ car, rec }) => {
        const cl = rec.warranty.claims.filter(x => x.status === 'open').at(-1);
        return `<li><span class="ico tone-soon">${icon('shield-check')}</span>
          <div class="grow"><b>${esc(rec.title || 'شغل')} • ${esc(car.make)} ${esc(car.model)}</b><small>${esc(cl.date)}: ${esc(cl.text)}</small></div></li>`;
      }).join('')}</ul>
      <p class="muted small">الضمان بيلزمك تصلّح نفس المشكلة من غير تكلفة على العميل.</p>
    </section>` : ''}

    <section class="card">
      <div class="card-head"><h2>الشغلانات</h2><button class="btn small primary" id="add-job">${icon('plus')} شغلانة</button></div>
      ${jobs.length ? `<ul class="list">${jobs.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(j => {
        const f = fin(j);
        return `<li class="job" data-id="${esc(j.id)}">
          <span class="ico">${icon('wrench')}</span>
          <div class="grow"><b>${esc(j.service)}</b><small>${esc(j.date)} • ${esc(j.customer || 'عميل')}${j.car ? ` • ${esc(j.car)}` : ''}${j.demo ? ' • تجريبي' : ''}</small></div>
          <div class="end"><b>${money(f.revenue)}</b><small class="${f.profit < 0 ? 'neg' : 'pos'}">ربح ${money(f.profit)}</small></div>
        </li>`;
      }).join('')}</ul>` : `<div class="empty-state small-empty">${icon('receipt')}<p>سجّل كل شغلانة بالمصنعية وسعر القطع وتكلفتها عليك، والداشبورد هيحسب دخلك وربحك لوحده.</p></div>`}
      <div class="actions">
        ${isRemote(id) ? '' : hasDemo ? '<button class="btn small" id="clear-demo">امسح البيانات التجريبية</button>'
          : '<button class="btn small" id="fill-demo">عبّي بيانات تجريبية عشان تشوف الشكل</button>'}
      </div>
    </section>`;

  view.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { period = b.dataset.period; rerender(); });
  document.getElementById('add-job').onclick = () => editJob(id, null);
  view.querySelectorAll('.job').forEach(li => li.onclick = () => editJob(id, jobs.find(j => j.id === li.dataset.id)));
  document.getElementById('fill-demo')?.addEventListener('click', () => { fillDemoJobs(id); rerender(); });
  document.getElementById('clear-demo')?.addEventListener('click', async () => {
    if (!await ask('مسح كل الشغلانات التجريبية؟', 'امسح')) return;
    state.market.jobs[id] = jobs.filter(j => !j.demo);
    persist();
    rerender();
  });
}

function editJob(shopId, job) {
  const j = job || { date: today(), labor: '', partsPrice: '', partsCost: '' };
  modal.innerHTML = `<form method="dialog" class="form" id="job-form">
    <h2>${job ? 'تعديل شغلانة' : 'شغلانة جديدة'}</h2>
    <label>الشغل*<input name="service" required value="${esc(j.service)}" placeholder="مثلاً: تغيير طرمبة مياه"></label>
    <div class="row2">
      <label>العميل<input name="customer" value="${esc(j.customer)}" placeholder="اختياري"></label>
      <label>العربية<input name="car" value="${esc(j.car)}" placeholder="مثلاً: كيا Rio"></label>
    </div>
    <label>التاريخ<input name="date" type="date" required value="${esc(j.date)}"></label>
    <div class="row2">
      <label>المصنعية (ج.م)<input name="labor" type="number" min="0" inputmode="numeric" value="${esc(j.labor)}"></label>
      <label>سعر القطع للعميل<input name="partsPrice" type="number" min="0" inputmode="numeric" value="${esc(j.partsPrice)}"></label>
    </div>
    <label>تكلفة القطع عليك<input name="partsCost" type="number" min="0" inputmode="numeric" value="${esc(j.partsCost)}"></label>
    <p class="muted small" id="job-preview"></p>
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>إلغاء</button>
      <button class="btn primary" value="ok">حفظ</button>
    </div>
    ${job ? `<button class="btn danger wide" value="delete" formnovalidate>${icon('trash-2')} مسح</button>` : ''}
  </form>`;
  modal.returnValue = '';
  modal.showModal();
  const form = modal.querySelector('form');
  const preview = () => {
    const f = jobFinancials(Object.fromEntries(new FormData(form)), PLATFORM_FEE_RATE);
    document.getElementById('job-preview').textContent =
      `الفاتورة ${money(f.revenue)} • عمولة ${money(f.fee)} • ربحك ${money(f.profit)}`;
  };
  form.oninput = preview;
  preview();
  form.onsubmit = async e => {
    const action = e.submitter?.value;
    if (isRemote(shopId) && (action === 'ok' || action === 'delete')) {
      try {
        if (action === 'delete') await deleteJob(job.id);
        else {
          const f = Object.fromEntries(new FormData(form));
          await saveJob(shopId, {
            id: job?.id, service: f.service.trim(), customer: [f.customer.trim(), f.car.trim()].filter(Boolean).join(' • '),
            date: f.date, labor: Number(f.labor) || 0, partsPrice: Number(f.partsPrice) || 0, partsCost: Number(f.partsCost) || 0,
          });
        }
        jobsCache[shopId] = await loadJobs(shopId);
        toast(action === 'delete' ? 'اتمسحت' : 'اتحفظ');
      } catch (ex) { toast(friendlyError(ex)); }
      return rerender();
    }
    const jobs = jobsOf(shopId);
    if (action === 'delete') state.market.jobs[shopId] = jobs.filter(x => x !== job);
    else if (action === 'ok') {
      const f = Object.fromEntries(new FormData(form));
      const data = {
        service: f.service.trim(), customer: f.customer.trim(), car: f.car.trim(), date: f.date,
        labor: Number(f.labor) || 0, partsPrice: Number(f.partsPrice) || 0, partsCost: Number(f.partsCost) || 0,
      };
      if (job) Object.assign(job, data, { demo: false });
      else jobs.push({ id: uid(), ...data });
      toast('اتحفظ');
    } else return;
    persist();
    rerender();
  };
}

// User-triggered sample data so a new workshop can see a filled dashboard; every row is marked demo.
function fillDemoJobs(shopId) {
  const t = today();
  const services = [
    ['غيار زيت وفلتر', 150, 1600, 1350], ['تغيير تيل فرامل', 250, 950, 780], ['فحص كمبيوتر', 300, 0, 0],
    ['تغيير طرمبة مياه', 600, 1800, 1500], ['تغيير بوجيهات', 200, 720, 600], ['ضبط زوايا وترصيص', 450, 0, 0],
  ];
  const jobs = jobsOf(shopId);
  for (let m = 0; m < 6; m++) {
    const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1 - m, 1));
    const n = 3 + ((m * 7) % 5);
    for (let k = 0; k < n; k++) {
      const [service, labor, partsPrice, partsCost] = services[(m + k) % services.length];
      const day = Math.min(1 + k * 5, m === 0 ? Number(t.slice(8, 10)) : 28);
      d.setUTCDate(day);
      jobs.push({ id: uid(), demo: true, service, labor, partsPrice, partsCost, customer: 'عميل تجريبي',
        date: d.toISOString().slice(0, 10) });
    }
  }
  persist();
}

// ---------- inbox (workshop side of the chat) ----------

export function viewInbox(arg) {
  const [id, convId] = arg.split('/');
  if (isRemote(id)) return convId ? viewRemoteThread(id, convId) : viewRemoteInbox(id);
  return viewLocalInbox(id);
}

const when = iso => new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function viewRemoteInbox(id) {
  const shop = myShop(id);
  if (!shop) return go('more');
  inboxCache[id] = null; // always fresh when opening the inbox
  loadThen(`${id}:list`, inboxCache, () => loadInbox(id));
  const list = inboxCache[`${id}:list`];
  view.innerHTML = `
    <a class="back" href="#biz/${esc(id)}">${icon('chevron-left', 'flip')} الداشبورد</a>
    <h1 class="page-title">الرسايل والحجوزات</h1>
    ${!list ? `<p class="notice">${icon('refresh-cw')}<span>بنحمّل الرسايل…</span></p>`
      : list.length ? `<ul class="list card">${list.map((c, i) => `
        <li class="conv" data-conv="${esc(c.id)}">
          <span class="ico">${icon('circle-user')}</span>
          <div class="grow"><b>عميل ${num(i + 1)}</b><small>${esc(c.last.slice(0, 80))}</small><small>${when(c.lastAt)}</small></div>
          ${c.unread ? `<span class="count">${num(c.unread)}</span>` : icon('chevron-left', 'chev')}
        </li>`).join('')}</ul>`
      : `<div class="empty-state">${icon('message-circle')}<p>لما عميل يكلمك أو يطلب حجز هيظهر هنا.</p></div>`}`;
  view.querySelectorAll('.conv').forEach(li => li.onclick = () => { delete inboxCache[`${id}:list`]; go(`inbox/${id}/${li.dataset.conv}`); });
}

const threads = {};
async function viewRemoteThread(id, convId) {
  const route = location.hash;
  const t = threads[convId] || (threads[convId] = { msgs: null, customerId: null });
  const draw = () => {
    view.innerHTML = chatLayout({
      back: `#inbox/${esc(id)}`, title: 'عميل باسبور', subtitle: 'رقم العميل مش بيظهر لك. الكلام كله من هنا', avatar: 'circle-user',
      mineFrom: 'ws', msgs: t.msgs || [], quick: ['أهلاً، تحت أمرك', 'متاحين النهارده من ٥ لـ ٨', 'السعر شامل المصنعية'],
      notice: t.msgs ? '' : `<p class="notice">${icon('refresh-cw')}<span>بنحمّل المحادثة…</span></p>`,
    });
    bindChat({ onSend: text => sendRemoteMessage(convId, text) });
  };
  draw();
  try {
    if (!t.customerId) {
      const list = inboxCache[`${id}:list`] || await loadInbox(id);
      t.customerId = list.find(c => c.id === convId)?.customerId;
    }
    const conv = { id: convId, customer_id: t.customerId };
    t.msgs = await loadMessages(conv);
    if (location.hash !== route) return;
    draw();
    watchConversation(convId, row => {
      const m = toMessage(row, t.customerId);
      if (t.msgs.some(x => x.id === m.id)) return;
      t.msgs.push(m);
      if (location.hash === route) appendBubble(m, m.from === 'ws');
    });
  } catch (ex) { if (location.hash === route) toast(friendlyError(ex)); }
}

function viewLocalInbox(id) {
  const shop = myShop(id);
  if (!shop) return go('more');
  const msgs = state.market.chats[id] || [];
  const time = iso => new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  view.innerHTML = `
    <div class="chat">
      <header class="chat-head">
        <a class="icon-btn" href="#biz/${esc(id)}" aria-label="رجوع">${icon('chevron-left', 'flip')}</a>
        <div class="shop-avatar sm">${icon('circle-user')}</div>
        <div class="grow"><b>عميل باسبور</b><small class="muted">رقم العميل مش بيظهر لك. الكلام كله من هنا</small></div>
      </header>
      <p class="notice">${icon('info')}<span>نسخة تجريبية: إنت شايف المحادثة من ناحية الورشة على نفس الموبايل. لما السيرفر يشتغل، كل عميل هيبقى ليه محادثة لوحده.</span></p>
      <div class="msgs" id="msgs">
        ${msgs.length ? msgs.map(m => `<div class="msg ${m.from === 'ws' ? 'me' : 'them'} ${m.kind}">${m.kind === 'claim' ? `<b>${icon('shield-check', 'tiny')} طلب ضمان</b>` : m.kind === 'booking' ? `<b>${icon('calendar', 'tiny')} طلب حجز</b>` : ''}<p>${esc(m.text)}</p><time>${time(m.at)}</time></div>`).join('')
          : `<div class="chat-empty">${icon('message-circle')}<p>لما عميل يكلمك أو يطلب حجز هيظهر هنا.</p></div>`}
      </div>
      <div class="quick">
        ${['أهلاً، تحت أمرك', 'متاحين النهارده من ٥ لـ ٨', 'السعر شامل المصنعية'].map(q => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
      </div>
      <form class="composer" id="composer">
        <input id="chat-input" placeholder="رد على العميل…" autocomplete="off" aria-label="الرد">
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
    (state.market.chats[id] ||= []).push({ id: uid(), from: 'ws', text, kind: 'text', at: new Date().toISOString() });
    persist();
    rerender();
  };
  view.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { input.value = b.dataset.q; input.focus(); });
}
