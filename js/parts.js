// Spare parts: nearby stores' catalogues filtered to the owner's car, cart and orders,
// store sign-up with catalogue upload (CSV from Excel), and the store's own dashboard.
import { icon } from './icons.js';
import { PART_CATEGORIES, ORDER_STATUSES, DEMO_STORES, PLATFORM_FEE_RATE } from './market.js';
import { PART_GRADES } from './data.js';
import { AREAS, RADII } from './places.js';
import { nearbyWorkshops, productFits, cartTotal, parseCatalogCsv, periodStats, periodStart } from './logic.js';
import { uid } from './store.js';
import {
  state, view, modal, esc, num, money, km, today, persist, toast, go, rerender, ask, choose, download, barChart, PERIODS,
} from './ui.js';
import { locationLabel, pickArea, useGps } from './shops.js';

export const allStores = () => [...state.market.stores, ...DEMO_STORES];
export const findStore = id => allStores().find(s => s.id === id) || null;
const findProduct = (store, pid) => store?.catalog.find(p => p.id === pid) || null;

export const segNav = active => `<nav class="seg" aria-label="القسم">
  <a href="#workshops" class="${active === 'workshops' ? 'on' : ''}">${icon('wrench')} ورش</a>
  <a href="#parts" class="${active === 'parts' ? 'on' : ''}">${icon('package')} قطع غيار</a>
</nav>`;

const cartCount = () => state.cart.reduce((s, l) => s + l.qty, 0);

function cartFab() {
  const n = cartCount();
  return n ? `<a class="cart-fab" href="#cart">${icon('package')}<span>السلة</span><b>${num(n)}</b></a>` : '';
}

function fitsText(p) {
  return p.fits?.length ? `يناسب: ${p.fits.join('، ')}` : 'مناسب لكل العربيات';
}

function productCard(p, store, car, { showStore = true } = {}) {
  const inCart = state.cart.find(l => l.storeId === store.id && l.productId === p.id);
  const fits = productFits(p, car);
  const out = p.stock === 0;
  return `<article class="product">
    <div class="product-icon">${icon(PART_CATEGORIES[p.category]?.icon || 'package')}</div>
    <div class="grow">
      <b>${esc(p.name)}</b>
      <small>${p.brand ? `${esc(p.brand)} • ` : ''}${esc(PART_GRADES[p.condition] || '')}</small>
      <small class="${fits ? 'fit-ok' : 'fit-no'}">${fits ? icon('check', 'tiny') : icon('x', 'tiny')} ${esc(fitsText(p))}</small>
      ${showStore ? `<a class="store-line" href="#store/${esc(store.id)}">${icon('store', 'tiny')} ${esc(store.name)}${store.distanceKm != null ? ` • ${km(store.distanceKm)}` : ''}</a>` : ''}
    </div>
    <div class="end">
      <b class="price">${money(p.price)}</b>
      ${out ? '<span class="pill overdue">خلصان</span>'
        : inCart ? `<div class="stepper" data-store="${esc(store.id)}" data-product="${esc(p.id)}">
            <button type="button" data-step="-1" aria-label="أقل">−</button><span>${num(inCart.qty)}</span><button type="button" data-step="1" aria-label="أكتر">+</button></div>`
        : `<button type="button" class="btn small primary" data-add="${esc(store.id)}|${esc(p.id)}">${icon('plus')} أضف</button>`}
    </div>
  </article>`;
}

function bindCartButtons() {
  view.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
    const [storeId, productId] = b.dataset.add.split('|');
    const p = findProduct(findStore(storeId), productId);
    state.cart.push({ storeId, productId, qty: 1, price: p.price, name: p.name });
    persist();
    toast('اتضافت للسلة');
    rerender();
  });
  view.querySelectorAll('.stepper').forEach(st => st.onclick = e => {
    const step = Number(e.target.closest('[data-step]')?.dataset.step);
    if (!step) return;
    const line = state.cart.find(l => l.storeId === st.dataset.store && l.productId === st.dataset.product);
    const p = findProduct(findStore(line.storeId), line.productId);
    line.qty += step;
    if (p?.stock != null && line.qty > p.stock) { line.qty = p.stock; toast('دي كل الكمية المتاحة'); }
    if (line.qty <= 0) state.cart = state.cart.filter(l => l !== line);
    persist();
    rerender();
  });
}

// ---------- browse ----------

let pf = { q: '', category: '' };

export function viewParts(car) {
  if (state.fitOnly === undefined) state.fitOnly = true;
  const radius = state.location ? state.radiusKm : Infinity;
  const stores = nearbyWorkshops(allStores().map(s => ({ ...s, specialties: [] })), state.location, { radiusKm: radius });
  const q = pf.q.trim().toLowerCase();
  const results = stores.flatMap(s => s.catalog.map(p => ({ p, s })))
    .filter(({ p }) => !pf.category || p.category === pf.category)
    .filter(({ p }) => !q || `${p.name} ${p.brand || ''} ${p.sku || ''}`.toLowerCase().includes(q))
    .filter(({ p }) => !state.fitOnly || productFits(p, car))
    .sort((a, b) => (a.s.distanceKm ?? 0) - (b.s.distanceKm ?? 0) || a.p.price - b.p.price);
  const nextRadius = RADII.find(r => r.km > radius);

  view.innerHTML = `
    <h1 class="page-title">ورش وقطع غيار</h1>
    ${segNav('parts')}
    <button class="loc-bar" id="loc-change">
      <span class="loc-dot">${icon('map-pin')}</span>
      <span class="grow"><small>محلات حوالين</small><b>${esc(locationLabel())}</b></span>
      <span class="link">غيّر</span>
    </button>
    ${state.location ? `<div class="chips" role="group" aria-label="المسافة">
      ${RADII.map(r => `<button class="chip ${r.km === radius ? 'on' : ''}" data-radius="${r.km}">${r.label}</button>`).join('')}
    </div>` : ''}

    <label class="search-box big">${icon('search')}<input type="search" id="parts-q" placeholder="دوّر على قطعة: فلتر زيت، تيل، بطارية…" value="${esc(pf.q)}"></label>
    <div class="chips scroll" role="group" aria-label="القسم">
      <button class="chip ${!pf.category ? 'on' : ''}" data-cat="">الكل</button>
      ${Object.entries(PART_CATEGORIES).map(([k, c]) => `<button class="chip ${pf.category === k ? 'on' : ''}" data-cat="${k}">${icon(c.icon)} ${c.label}</button>`).join('')}
    </div>
    <label class="switch"><input type="checkbox" id="fit-only" ${state.fitOnly ? 'checked' : ''}> اللي يناسب ${esc(car.make)} ${esc(car.model)} بس</label>

    <p class="notice">${icon('info')}<span>المحلات والأسعار دي <b>أمثلة للعرض</b> لحد ما المحلات الحقيقية ترفع كتالوجاتها.</span></p>

    ${stores.length ? `<div class="store-strip">${stores.map(s => `
      <a class="store-chip" href="#store/${esc(s.id)}">${icon('store')}<span><b>${esc(s.name)}</b><small>${esc(s.area)}${s.distanceKm != null ? ` • ${km(s.distanceKm)}` : ''}</small></span></a>`).join('')}</div>` : ''}

    ${results.length ? `<div class="product-list">${results.map(({ p, s }) => productCard(p, s, car)).join('')}</div>`
      : `<div class="card empty-card"><p>مفيش نتايج${q ? ` لـ «${esc(pf.q)}»` : ''} في المحلات القريبة.</p>
        ${state.fitOnly ? '<button class="btn" id="show-all">اعرض كل القطع حتى اللي مش لعربيتي</button>' : ''}
        ${nextRadius && state.location ? `<button class="btn primary" data-radius="${nextRadius.km}">وسّع البحث لـ ${nextRadius.label}</button>` : ''}</div>`}

    <a class="join-cta" href="#join-store">
      <span class="join-icon">${icon('package')}</span>
      <span class="grow"><b>عندك محل قطع غيار؟</b><small>ارفع الكتالوج بتاعك وبيع لأصحاب العربيات اللي حواليك</small></span>
      ${icon('chevron-left')}
    </a>
    ${cartFab()}`;

  const input = document.getElementById('parts-q');
  input.oninput = () => { pf.q = input.value; clearTimeout(viewParts.t); viewParts.t = setTimeout(() => { rerender(); const el = document.getElementById('parts-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
  view.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { pf.category = b.dataset.cat; rerender(); });
  view.querySelectorAll('[data-radius]').forEach(b => b.onclick = () => { state.radiusKm = Number(b.dataset.radius); persist(); rerender(); });
  document.getElementById('fit-only').onchange = e => { state.fitOnly = e.target.checked; persist(); rerender(); };
  document.getElementById('show-all')?.addEventListener('click', () => { state.fitOnly = false; persist(); rerender(); });
  document.getElementById('loc-change').onclick = async () => {
    const v = await choose({ title: 'غيّر المكان', columns: 1, items: [
      { label: 'استخدم موقعي الحالي', value: 'gps' }, { label: 'اختار منطقة من القايمة', value: 'area' },
    ] });
    if (v === 'gps' && await useGps()) rerender();
    if (v === 'area' && await pickArea()) rerender();
  };
  bindCartButtons();
}

export function viewStore(id, car) {
  const s = findStore(id);
  if (!s) return go('parts');
  const [withDist] = nearbyWorkshops([{ ...s, specialties: [] }], state.location);
  const cats = [...new Set(s.catalog.map(p => p.category))];
  view.innerHTML = `
    <a class="back" href="#parts">${icon('chevron-left', 'flip')} قطع الغيار</a>
    <section class="shop-hero card">
      <div class="shop-avatar lg">${icon('store')}</div>
      <div class="grow">
        <h1>${esc(s.name)}</h1>
        <p class="muted">${icon('map-pin', 'tiny')} ${esc(s.area)}${withDist.distanceKm != null ? ` • ${km(withDist.distanceKm)} منك` : ''}</p>
        ${s.hours ? `<p class="muted small">${icon('clock', 'tiny')} ${esc(s.hours)}</p>` : ''}
        <div class="tags">
          ${s.demo ? '<span class="tag muted-tag">مثال للعرض</span>' : ''}
          ${s.pending ? '<span class="tag warn-tag">في انتظار المراجعة</span>' : ''}
          <span class="tag ${s.delivery ? 'good-tag' : 'muted-tag'}">${s.delivery ? 'فيه توصيل' : 'استلام من المحل'}</span>
          <span class="tag muted-tag">${num(s.catalog.length)} صنف</span>
        </div>
      </div>
    </section>
    ${s.about ? `<p class="muted">${esc(s.about)}</p>` : ''}
    ${car ? `<label class="switch"><input type="checkbox" id="fit-only" ${state.fitOnly !== false ? 'checked' : ''}> اللي يناسب عربيتي بس</label>` : ''}
    ${cats.map(c => {
      const items = s.catalog.filter(p => p.category === c && (!car || state.fitOnly === false || productFits(p, car)));
      return items.length ? `<section class="card catalog-sec"><h2>${icon(PART_CATEGORIES[c]?.icon || 'package')} ${esc(PART_CATEGORIES[c]?.label || c)}</h2>
        <div class="product-list">${items.map(p => productCard(p, s, car, { showStore: false })).join('')}</div></section>` : '';
    }).join('') || '<div class="card empty-card"><p>مفيش أصناف تناسب عربيتك هنا.</p></div>'}
    ${cartFab()}`;
  document.getElementById('fit-only')?.addEventListener('change', e => { state.fitOnly = e.target.checked; persist(); rerender(); });
  bindCartButtons();
}

// ---------- cart and orders ----------

export function viewCart(car) {
  const groups = [...new Set(state.cart.map(l => l.storeId))].map(id => ({ store: findStore(id), lines: state.cart.filter(l => l.storeId === id) }))
    .filter(g => g.store);
  const mine = state.market.orders.filter(o => o.buyer === 'me').slice().reverse();

  view.innerHTML = `
    <a class="back" href="#parts">${icon('chevron-left', 'flip')} قطع الغيار</a>
    <h1 class="page-title">السلة</h1>
    ${groups.length ? groups.map(({ store, lines }) => `
      <form class="card form order-form" data-store="${esc(store.id)}">
        <div class="card-head"><h2>${icon('store', 'tiny')} ${esc(store.name)}</h2><small class="muted">${esc(store.area)}</small></div>
        <ul class="list">${lines.map(l => `<li>
          <div class="grow"><b>${esc(l.name)}</b><small>${money(l.price)} للواحدة</small></div>
          <div class="stepper" data-store="${esc(l.storeId)}" data-product="${esc(l.productId)}">
            <button type="button" data-step="-1" aria-label="أقل">−</button><span>${num(l.qty)}</span><button type="button" data-step="1" aria-label="أكتر">+</button></div>
          <b class="line-total">${money(l.price * l.qty)}</b>
        </li>`).join('')}</ul>
        <label>الاستلام
          <select name="delivery">
            <option value="pickup">استلام من المحل</option>
            ${store.delivery ? '<option value="delivery">توصيل</option>' : ''}
          </select>
        </label>
        <label>ملاحظة للمحل<input name="note" placeholder="مثلاً: العنوان أو وقت الاستلام"></label>
        <div class="order-total"><span>الإجمالي</span><b>${money(cartTotal(lines))}</b></div>
        <p class="muted small">الدفع عند الاستلام. المحل هيأكد الطلب والسعر النهائي.</p>
        <button class="btn primary wide" type="submit">${icon('send', 'flip')} ابعت الطلب للمحل</button>
      </form>`).join('')
      : `<div class="empty-state">${icon('package')}<p>السلة فاضية.</p><a class="btn primary" href="#parts">دوّر على قطع</a></div>`}

    ${mine.length ? `<section class="card">
      <h2>طلباتي</h2>
      <ul class="list">${mine.map(o => `<li>
        <span class="ico">${icon('receipt')}</span>
        <div class="grow"><b>${esc(findStore(o.storeId)?.name || '')}</b><small>${esc(o.date)} • ${num(o.lines.reduce((s, l) => s + l.qty, 0))} قطعة • ${money(o.total)}</small></div>
        <span class="pill ${ORDER_STATUSES[o.status].tone}">${ORDER_STATUSES[o.status].label}</span>
      </li>`).join('')}</ul>
    </section>` : ''}`;

  bindCartButtons();
  view.querySelectorAll('.order-form').forEach(f => f.onsubmit = e => {
    e.preventDefault();
    const storeId = f.dataset.store;
    const lines = state.cart.filter(l => l.storeId === storeId);
    const fd = new FormData(f);
    state.market.orders.push({
      id: uid(), buyer: 'me', storeId, date: today(), status: 'new', delivery: fd.get('delivery'), note: fd.get('note').trim(),
      car: car ? `${car.make} ${car.model} ${car.year}` : '', lines: lines.map(l => ({ ...l })), total: cartTotal(lines),
    });
    state.cart = state.cart.filter(l => l.storeId !== storeId);
    persist();
    toast('الطلب اتبعت للمحل');
    rerender();
  });
}

// ---------- store sign-up / edit ----------

const TEMPLATE_CSV = '﻿الاسم,الماركة,العربيات,السعر,الكمية,الحالة,القسم,الكود\n' +
  'فلتر زيت,Denso,Toyota Corolla|Toyota Yaris,180,25,أصلي,oil,DN-123\n' +
  'تيل فرامل أمامي,Brembo,Hyundai Elantra,950,8,بديل,brakes,BR-77\n';

function catalogRows(items) {
  return items.length ? `<ul class="list cat-preview">${items.map((p, i) => `<li>
    <div class="grow"><b>${esc(p.name)}</b><small>${esc(p.brand || '')} • ${esc(PART_GRADES[p.condition] || '')} • ${esc(PART_CATEGORIES[p.category]?.label || p.category)}${p.stock != null ? ` • متاح ${num(p.stock)}` : ''}</small>
      <small>${esc(fitsText(p))}</small></div>
    <b>${money(p.price)}</b>
    <button type="button" class="icon-btn" data-edit-item="${i}" aria-label="تعديل">${icon('pencil')}</button>
  </li>`).join('')}</ul>` : '<p class="muted small">لسه مفيش أصناف. ارفع ملف أو ضيف صنف بإيدك.</p>';
}

function editItem(item, onSave, onDelete) {
  const p = item || { condition: 'aftermarket', category: 'other', fits: [] };
  modal.innerHTML = `<form method="dialog" class="form">
    <h2>${item ? 'تعديل صنف' : 'صنف جديد'}</h2>
    <label>الاسم*<input name="name" required value="${esc(p.name)}"></label>
    <div class="row2">
      <label>الماركة<input name="brand" value="${esc(p.brand)}"></label>
      <label>الكود<input name="sku" value="${esc(p.sku)}" dir="ltr"></label>
    </div>
    <div class="row2">
      <label>السعر*<input name="price" type="number" min="1" inputmode="numeric" required value="${esc(p.price)}"></label>
      <label>الكمية<input name="stock" type="number" min="0" inputmode="numeric" value="${esc(p.stock ?? '')}" placeholder="مفتوح"></label>
    </div>
    <div class="row2">
      <label>الحالة<select name="condition">${Object.entries(PART_GRADES).map(([k, v]) => `<option value="${k}" ${k === p.condition ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>القسم<select name="category">${Object.entries(PART_CATEGORIES).map(([k, c]) => `<option value="${k}" ${k === p.category ? 'selected' : ''}>${c.label}</option>`).join('')}</select></label>
    </div>
    <label>تناسب أنهي عربيات؟<input name="fits" value="${esc((p.fits || []).join('، '))}" placeholder="مثلاً: Toyota Corolla، Hyundai — فاضي = كل العربيات"></label>
    <div class="row2">
      <button class="btn" value="cancel" formnovalidate>إلغاء</button>
      <button class="btn primary" value="ok">حفظ</button>
    </div>
    ${item && onDelete ? `<button class="btn danger wide" value="delete" formnovalidate>${icon('trash-2')} مسح الصنف</button>` : ''}
  </form>`;
  modal.returnValue = '';
  modal.showModal();
  modal.querySelector('form').onsubmit = e => {
    const action = e.submitter?.value;
    if (action === 'delete') return onDelete();
    if (action !== 'ok') return;
    const f = Object.fromEntries(new FormData(e.target));
    onSave({
      name: f.name.trim(), brand: f.brand.trim(), sku: f.sku.trim(), price: Number(f.price),
      stock: f.stock === '' ? null : Number(f.stock), condition: f.condition, category: f.category,
      fits: f.fits.split(/[،,|]/).map(x => x.trim()).filter(Boolean),
    });
  };
}

// Shared catalogue editor: CSV upload (append or replace), template download, manual add/edit.
function catalogEditor(catalog, onChange) {
  return {
    html: `<fieldset>
      <legend>الكتالوج (${num(catalog.length)} صنف)</legend>
      <div class="upload-row">
        <label class="upload">${icon('file-text')}<span>ارفع ملف الكتالوج (CSV)</span><input type="file" accept=".csv,text/csv" id="cat-file"></label>
        <button type="button" class="btn small" id="cat-template">${icon('download')} نموذج الملف</button>
      </div>
      <p class="muted small">من Excel: «حفظ باسم» ← CSV UTF-8. الأعمدة: الاسم، الماركة، العربيات (افصل بينهم بـ |)، السعر، الكمية، الحالة، القسم، الكود.</p>
      <div id="cat-report"></div>
      <div id="cat-list">${catalogRows(catalog)}</div>
      <button type="button" class="btn small" id="cat-add">${icon('plus')} صنف بإيدك</button>
    </fieldset>`,
    bind() {
      const refresh = () => { document.getElementById('cat-list').innerHTML = catalogRows(catalog); bindRows(); onChange(); };
      const bindRows = () => document.querySelectorAll('[data-edit-item]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.editItem);
        editItem(catalog[i], data => { Object.assign(catalog[i], data); refresh(); }, () => { catalog.splice(i, 1); modal.close(); refresh(); });
      });
      bindRows();
      document.getElementById('cat-add').onclick = () => editItem(null, data => { catalog.push({ id: 'p-' + uid(), ...data }); refresh(); });
      document.getElementById('cat-template').onclick = () => {
        try { download('catalog-template.csv', TEMPLATE_CSV); } catch { /* blocked in sandboxed views */ }
        toast('لو التنزيل ما اشتغلش: اعمل شيت بنفس أسماء الأعمدة');
      };
      document.getElementById('cat-file').onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        const { items, errors } = parseCatalogCsv(await file.text());
        e.target.value = '';
        const report = document.getElementById('cat-report');
        if (!items.length) { report.innerHTML = `<p class="notice bad">${icon('triangle-alert')}<span>${esc(errors[0] || 'مفيش أصناف في الملف')}</span></p>`; return; }
        const replace = catalog.length && await ask(`لقينا ${num(items.length)} صنف. تستبدل الكتالوج الحالي (${num(catalog.length)} صنف) ولا تضيفهم عليه؟`, 'استبدل', false);
        if (replace) catalog.splice(0, catalog.length);
        catalog.push(...items.map(p => ({ id: 'p-' + uid(), ...p })));
        refresh();
        document.getElementById('cat-report').innerHTML = `<p class="notice good">${icon('check')}<span>اتضاف ${num(items.length)} صنف${errors.length ? `، و${num(errors.length)} سطر فيهم مشكلة: ${esc(errors.slice(0, 3).join(' — '))}` : ''}</span></p>`;
      };
    },
  };
}

export function viewJoinStore(id) {
  const existing = id ? state.market.stores.find(s => s.id === id) : null;
  const v = existing || {};
  let loc = existing ? AREAS.find(a => a.name === existing.area) || { name: existing.area, lat: existing.lat, lng: existing.lng } : null;
  const catalog = existing ? existing.catalog : [];
  const editor = catalogEditor(catalog, () => { if (existing) persist(); });

  view.innerHTML = `
    <a class="back" href="${existing ? `#store-biz/${esc(id)}` : '#parts'}">${icon('chevron-left', 'flip')} ${existing ? 'الداشبورد' : 'قطع الغيار'}</a>
    <section class="join-hero">
      <h1>${existing ? 'عدّل بيانات المحل والكتالوج' : 'انضم لباسبور كمحل قطع غيار'}</h1>
      ${existing ? '' : '<p>ارفع الكتالوج بتاعك مرة واحدة، وأصحاب العربيات اللي حواليك هيلاقوا القطع اللي تناسب عربياتهم ويطلبوها منك على طول.</p>'}
    </section>
    <form id="store-form" class="card form">
      <label>اسم المحل*<input name="name" required value="${esc(v.name)}"></label>
      <div class="row2">
        <label>اسم المسؤول*<input name="owner" required value="${esc(v.owner)}"></label>
        <label>الموبايل*<input name="phone" type="tel" dir="ltr" required value="${esc(v.phone)}"></label>
      </div>
      <div class="field">
        <span class="field-label">المكان*</span>
        <button type="button" class="select-btn ${loc ? '' : 'empty'}" id="store-loc"><span>${loc ? esc(loc.name) : 'اختار منطقة المحل'}</span>${icon('chevron-down', 'tiny')}</button>
      </div>
      <div class="row2">
        <label>مواعيد العمل<input name="hours" value="${esc(v.hours)}" placeholder="السبت–الخميس ١٠ص–١٠م"></label>
        <label class="agree inline"><input type="checkbox" name="delivery" ${v.delivery ? 'checked' : ''}> عندي توصيل</label>
      </div>
      <label>نبذة<textarea name="about" rows="2">${esc(v.about)}</textarea></label>
      ${editor.html}
      ${existing ? '' : '<label class="agree"><input type="checkbox" required> موافق على شروط باسبور للبيع، وإن الأسعار والكميات اللي برفعها صحيحة.</label>'}
      <button class="btn primary wide" type="submit">${existing ? 'حفظ' : 'افتح المحل'}</button>
      ${existing ? '' : '<p class="muted small">في النسخة دي المحل بيتحفظ على الموبايل ده بس. لما السيرفر يشتغل، الطلب هيروح لفريق المراجعة.</p>'}
    </form>`;

  editor.bind();
  document.getElementById('store-loc').onclick = async () => {
    const i = await choose({ title: 'مكان المحل', columns: 2, items: AREAS.map((a, n) => ({ label: a.name, sub: a.gov, value: n })) });
    if (i == null) return;
    loc = AREAS[i];
    const btn = document.getElementById('store-loc');
    btn.classList.remove('empty');
    btn.firstElementChild.textContent = `${loc.name} — ${loc.gov}`;
  };
  document.getElementById('store-form').onsubmit = e => {
    e.preventDefault();
    if (!loc) return toast('اختار مكان المحل');
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name').trim(), owner: fd.get('owner').trim(), phone: fd.get('phone').trim(),
      area: loc.name, lat: loc.lat, lng: loc.lng, hours: fd.get('hours').trim(), about: fd.get('about').trim(),
      delivery: fd.get('delivery') === 'on', categories: [...new Set(catalog.map(p => p.category))],
    };
    if (existing) { Object.assign(existing, data); persist(); toast('اتحفظ'); return go('store-biz/' + existing.id); }
    const store = { id: 'store-' + uid(), pending: true, createdAt: today(), catalog, ...data };
    state.market.stores.push(store);
    persist();
    toast('المحل اتفتح! ده الداشبورد بتاعك');
    go('store-biz/' + store.id);
  };
}

// ---------- store dashboard ----------

let sp = 'month';

export function viewStoreBiz(id) {
  const s = state.market.stores.find(x => x.id === id);
  if (!s) return go('more');
  const t = today();
  const orders = state.market.orders.filter(o => o.storeId === id);
  const counted = orders.filter(o => o.status !== 'cancelled');
  const stats = periodStats(counted, {
    from: periodStart(sp, t), today: t, months: 6,
    value: o => ({ sales: o.total, fee: Math.round(o.total * PLATFORM_FEE_RATE), net: o.total - Math.round(o.total * PLATFORM_FEE_RATE) }),
  });
  const T = stats.totals;
  const fresh = orders.filter(o => o.status === 'new').length;
  const low = s.catalog.filter(p => p.stock != null && p.stock <= 2);

  view.innerHTML = `
    <header class="biz-head">
      <div class="shop-avatar">${icon('package')}</div>
      <div class="grow"><small class="muted">داشبورد المحل</small><h1>${esc(s.name)}</h1></div>
      ${s.pending ? '<span class="tag warn-tag">في انتظار المراجعة</span>' : ''}
    </header>
    <div class="actions">
      <a class="btn small" href="#store/${esc(id)}">${icon('eye')} المحل زي ما العميل شايفه</a>
      <a class="btn small" href="#join-store/${esc(id)}">${icon('pencil')} الكتالوج والبيانات</a>
    </div>
    <div class="chips" role="group" aria-label="الفترة">
      ${PERIODS.map(p => `<button class="chip ${p.id === sp ? 'on' : ''}" data-period="${p.id}">${p.label}</button>`).join('')}
    </div>
    <section class="stats">
      <div class="stat"><small>المبيعات</small><b>${money(T.sales || 0)}</b></div>
      <div class="stat good"><small>صافي بعد العمولة</small><b>${money(T.net || 0)}</b></div>
      <div class="stat"><small>الطلبات</small><b>${num(T.count)}</b></div>
      <div class="stat ${fresh ? 'warn' : ''}"><small>طلبات جديدة</small><b>${num(fresh)}</b></div>
    </section>
    <section class="card">
      <h2>المبيعات آخر ٦ شهور</h2>
      ${barChart(stats.series, { main: 'sales', inner: 'net', mainLabel: 'المبيعات', innerLabel: 'الصافي' })}
      <p class="muted small">عمولة باسبور ${num(PLATFORM_FEE_RATE * 100)}٪ نسبة افتراضية للتجربة.</p>
    </section>

    <section class="card">
      <h2>الطلبات</h2>
      ${orders.length ? `<ul class="list">${orders.slice().reverse().map(o => `<li class="order-row">
        <div class="grow">
          <b>${money(o.total)} • ${num(o.lines.reduce((n, l) => n + l.qty, 0))} قطعة</b>
          <small>${esc(o.date)} • ${o.delivery === 'delivery' ? 'توصيل' : 'استلام'}${o.car ? ` • ${esc(o.car)}` : ''}</small>
          <small>${o.lines.map(l => `${esc(l.name)} × ${num(l.qty)}`).join('، ')}</small>
          ${o.note ? `<small>ملاحظة: ${esc(o.note)}</small>` : ''}
        </div>
        <select class="status-select tone-${ORDER_STATUSES[o.status].tone}" data-order="${esc(o.id)}" aria-label="حالة الطلب">
          ${Object.entries(ORDER_STATUSES).map(([k, st]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${st.label}</option>`).join('')}
        </select>
      </li>`).join('')}</ul>` : `<div class="empty-state small-empty">${icon('receipt')}<p>الطلبات اللي بتجيلك من التطبيق هتظهر هنا. جرّب تطلب من محلك من قسم «قطع غيار».</p></div>`}
    </section>

    <section class="card">
      <div class="card-head"><h2>المخزون</h2><a href="#join-store/${esc(id)}">عدّل الكتالوج</a></div>
      <p>${num(s.catalog.length)} صنف في الكتالوج${low.length ? ` • <b class="neg">${num(low.length)} قرّبوا يخلصوا</b>` : ''}</p>
      ${low.length ? `<ul class="list">${low.map(p => `<li><div class="grow"><b>${esc(p.name)}</b><small>${esc(p.brand || '')}</small></div><span class="pill ${p.stock ? 'soon' : 'overdue'}">${p.stock ? `باقي ${num(p.stock)}` : 'خلصان'}</span></li>`).join('')}</ul>` : ''}
    </section>`;

  view.querySelectorAll('[data-period]').forEach(b => b.onclick = () => { sp = b.dataset.period; rerender(); });
  view.querySelectorAll('[data-order]').forEach(sel => sel.onchange = () => {
    const o = state.market.orders.find(x => x.id === sel.dataset.order);
    const was = o.status;
    o.status = sel.value;
    // Stock moves once, when an order is first confirmed, and comes back if it's cancelled after that.
    const counts = st => ['confirmed', 'ready', 'delivered'].includes(st);
    if (counts(o.status) !== counts(was)) {
      for (const l of o.lines) {
        const p = s.catalog.find(x => x.id === l.productId);
        if (p?.stock != null) p.stock = Math.max(0, p.stock + (counts(o.status) ? -l.qty : l.qty));
      }
    }
    persist();
    toast(`الطلب بقى: ${ORDER_STATUSES[o.status].label}`);
    rerender();
  });
}
