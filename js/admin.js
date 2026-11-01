// Admin: review workshop and parts-store sign-ups, approve them, or suspend listings.
import { icon } from './icons.js';
import { SPECIALTIES } from './market.js';
import { auth, friendlyError } from './backend.js';
import { cache, loadPending, setListingStatus, loadMarket } from './remote.js';
import { view, esc, num, money, toast, rerender, ask } from './ui.js';

let data = null;
let loading = false;
let tab = 'pending';

const STATUS = { pending: ['soon', 'مستني موافقتك'], approved: ['ok', 'شغّال'], suspended: ['overdue', 'موقوف'] };

function load() {
  if (loading) return;
  loading = true;
  const route = location.hash;
  loadPending().then(d => { data = d; }, ex => { data = { shops: [], stores: [] }; toast(friendlyError(ex)); })
    .finally(() => { loading = false; if (location.hash === route) rerender(); });
}

function card(kind, x) {
  const [tone, label] = STATUS[x.status] || STATUS.pending;
  const details = kind === 'shop'
    ? `${(x.specialties || []).map(s => SPECIALTIES[s]?.label).filter(Boolean).join('، ')} • ${num((x.workshop_services || []).length)} خدمة في قايمة الأسعار`
    : `${num((x.products || []).length)} صنف في الكتالوج • ${x.delivery ? 'فيه توصيل' : 'استلام من المحل'}`;
  const prices = kind === 'shop' && x.workshop_services?.length
    ? `<small>${x.workshop_services.slice(0, 3).map(s => `${esc(s.name)} ${money(s.price)}`).join(' • ')}</small>` : '';
  return `<article class="card admin-card">
    <div class="card-head">
      <div class="grow"><b>${icon(kind === 'shop' ? 'wrench' : 'package', 'tiny')} ${esc(x.name)}</b><small class="muted">${esc(x.area)} • ${new Date(x.created_at).toLocaleDateString('ar-EG')}</small></div>
      <span class="pill ${tone}">${label}</span>
    </div>
    <small>${details}</small>
    ${prices}
    ${x.about ? `<small class="muted">${esc(x.about)}</small>` : ''}
    ${x.source ? `<small>${icon('link', 'tiny')} جه من: <b dir="ltr">${esc(x.source)}</b></small>` : ''}
    <div class="owner-line">${icon('circle-user', 'tiny')} ${esc(x.owner.full_name || 'بدون اسم')}
      ${x.owner.phone ? ` • <span dir="ltr" class="selectable">${esc(x.owner.phone)}</span>` : ''}</div>
    <div class="actions">
      ${x.status !== 'approved' ? `<button class="btn small primary" data-act="approved" data-kind="${kind}" data-id="${esc(x.id)}">${icon('check')} وافق</button>` : ''}
      ${x.status !== 'suspended' ? `<button class="btn small danger" data-act="suspended" data-kind="${kind}" data-id="${esc(x.id)}">${x.status === 'pending' ? 'ارفض' : 'أوقف'}</button>` : ''}
    </div>
  </article>`;
}

export function viewAdmin() {
  if (!auth.user || cache.role !== 'admin') {
    view.innerHTML = `<h1 class="page-title">الإدارة</h1><div class="notice">${icon('lock')}<span>الصفحة دي للأدمن بس.</span></div>`;
    return;
  }
  if (!data) load();
  const all = data ? [...data.shops.map(x => ['shop', x]), ...data.stores.map(x => ['store', x])] : [];
  const pending = all.filter(([, x]) => x.status === 'pending');
  const shown = tab === 'pending' ? pending : all.filter(([, x]) => x.status !== 'pending');

  view.innerHTML = `
    <h1 class="page-title">الإدارة</h1>
    <nav class="seg" aria-label="القسم">
      <button type="button" class="${tab === 'pending' ? 'on' : ''}" data-tab="pending">${icon('hourglass')} مستني موافقة ${pending.length ? `(${num(pending.length)})` : ''}</button>
      <button type="button" class="${tab === 'all' ? 'on' : ''}" data-tab="all">${icon('list-checks')} الباقي</button>
    </nav>
    <p class="muted small">راجع الطلب، واتصل بصاحبه لو محتاج تتأكد، وبعدين وافق. الورشة أو المحل بيظهر للعملا أول ما توافق.</p>
    <section class="card promo">
      <h2>${icon('send', 'flip')} أدوات استقطاب الورش</h2>
      <p class="muted small">ابعت صفحة التعريف للورش، أو اطبع بوستر الدعوة. ضيف <b dir="ltr">?src=</b> واسم القناة عشان تعرف كل ورشة جت منين، وهتلاقيه مكتوب على طلبها هنا.</p>
      <div class="actions">
        <a class="btn small primary" href="for-workshops.html" target="_blank" rel="noopener">${icon('eye')} صفحة التعريف للورش</a>
        <a class="btn small" href="poster.html?type=join&src=poster-join" target="_blank" rel="noopener">${icon('qr-code')} بوستر دعوة الورش</a>
        <button class="btn small" id="copy-links">${icon('link')} انسخ لينكات القنوات</button>
      </div>
    </section>
    ${!data ? `<p class="notice">${icon('refresh-cw')}<span>بنحمّل الطلبات…</span></p>`
      : shown.length ? shown.map(([k, x]) => card(k, x)).join('')
      : `<div class="empty-state">${icon('check')}<p>${tab === 'pending' ? 'مفيش طلبات جديدة.' : 'مفيش ورش أو محلات شغّالة لسه.'}</p></div>`}
    <button class="btn small" id="reload">${icon('refresh-cw')} تحديث</button>`;

  view.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; rerender(); });
  document.getElementById('reload').onclick = () => { data = null; rerender(); };
  document.getElementById('copy-links').onclick = async () => {
    const base = new URL('for-workshops.html', location.href.split('#')[0]).href.split('?')[0];
    const text = ['whatsapp', 'facebook', 'visit', 'parts-stores'].map(c => `${c}: ${base}?src=${c}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('اتنسخت ٤ لينكات: واتساب، فيسبوك، زيارات، محلات قطع'); }
    catch { toast(text); }
  };
  view.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
    const { act, kind, id } = b.dataset;
    if (act === 'suspended' && !await ask('متأكد؟ مش هيظهر للعملا تاني لحد ما توافق عليه.', 'تمام')) return;
    b.disabled = true;
    try {
      await setListingStatus(kind, id, act);
      toast(act === 'approved' ? 'اتوافق عليه وبقى ظاهر للعملا' : 'اتوقف');
      data = null;
      loadMarket().catch(() => {});
    } catch (ex) { toast(friendlyError(ex)); }
    rerender();
  });
}
