// Shared state and UI helpers used by every view.
import { load, save } from './store.js';
import { formatDate } from './logic.js';
import { icon } from './icons.js';

export const state = load();
state.workshops ||= [];
state.market ||= {};
state.market.listings ||= [];
state.market.chats ||= {};
state.market.reviews ||= {};
state.market.jobs ||= {};
state.market.stores ||= [];
state.market.orders ||= [];
state.cart ||= [];
state.location ||= null;
state.radiusKm ??= 10;

export const view = document.getElementById('view');
export const modal = document.getElementById('modal');

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = n => Number(n || 0).toLocaleString('ar-EG');
export const money = n => `${num(Math.round(n))} ج.م`;
export const km = d => d == null ? '' : d < 1 ? `${num(Math.round(d * 1000))} م` : `${Number(d.toFixed(1)).toLocaleString('ar-EG')} كم`;
export const today = () => formatDate(Date.now() - new Date().getTimezoneOffset() * 60000);
export const activeCar = () => state.cars.find(c => c.id === state.activeCarId) || state.cars[0] || null;

export function stars(rating, cls = '') {
  const full = Math.round(rating || 0);
  return `<span class="stars ${cls}" aria-label="${num(rating)} من ٥">${[1, 2, 3, 4, 5]
    .map(n => `<span class="${n <= full ? 'on' : ''}">${icon('star')}</span>`).join('')}</span>`;
}

let afterPersist = () => {};
export const setAfterPersist = fn => { afterPersist = fn; };

export function persist({ skipSync = false } = {}) {
  if (!save(state)) toast('مساحة التخزين اتملت. سجّل دخول عشان الصور تتحفظ على السيرفر، أو امسح صور قديمة');
  if (!skipSync) afterPersist();
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2800);
}

let renderFn = () => {};
export const setRender = fn => { renderFn = fn; };
export const rerender = () => renderFn();

export function go(hash) {
  if (location.hash === '#' + hash) renderFn();
  else location.hash = hash;
}

// In-page confirmation; native confirm() is blocked in embedded/sandboxed views.
export function ask(message, okLabel = 'تأكيد', danger = true) {
  return new Promise(resolve => {
    modal.innerHTML = `<form method="dialog" class="form">
      <p class="ask-text">${esc(message)}</p>
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

// Bottom-sheet searchable chooser. Resolves with the chosen value, a typed custom value, or null.
export function choose({ title, items, columns = 2, customLabel }) {
  return new Promise(resolve => {
    modal.classList.add('sheet');
    modal.innerHTML = `<form method="dialog" class="picker">
      <div class="picker-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" value="cancel" aria-label="قفل">${icon('x')}</button>
      </div>
      <label class="search-box">${icon('search')}<input type="search" id="picker-search" placeholder="دوّر…" autocomplete="off"></label>
      <div class="picker-grid cols-${columns}" id="picker-grid">
        ${items.map((it, i) => `<button type="button" class="pick ${it.selected ? 'selected' : ''}" data-i="${i}" data-q="${esc((it.label + ' ' + (it.sub || '') + ' ' + (it.group || '')).toLowerCase())}">
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
    modal.querySelector('.selected')?.scrollIntoView({ block: 'center' });
  });
}

// Downscale invoice photos so dozens fit in localStorage.
export function compressImage(file, maxSide = 900, quality = 0.6) {
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

export function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const MONTH_FMT = new Intl.DateTimeFormat('ar-EG', { month: 'short', timeZone: 'UTC' });
export const monthLabel = ym => MONTH_FMT.format(new Date(ym + '-15T00:00:00Z'));

// Monthly bars: `main` as the full bar, optional `inner` (e.g. profit) drawn inside it.
export function barChart(series, { main, inner, mainLabel, innerLabel }) {
  const W = 320, H = 150, top = 18, bottom = 24, gap = 10;
  const max = Math.max(1, ...series.map(r => r[main] || 0));
  const bw = (W - gap * (series.length + 1)) / series.length;
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const bars = series.map((r, i) => {
    const x = W - gap - (i + 1) * (bw + gap) + gap; // right-to-left: oldest on the right
    const v = r[main] || 0, iv = Math.max(0, r[inner] || 0);
    const last = i === series.length - 1;
    return `<g>
      <rect x="${x}" y="${y(v)}" width="${bw}" height="${H - bottom - y(v)}" rx="5" class="bar ${last ? 'last' : ''}"/>
      ${inner ? `<rect x="${x + bw * 0.2}" y="${y(Math.min(iv, v))}" width="${bw * 0.6}" height="${H - bottom - y(Math.min(iv, v))}" rx="3" class="bar-inner"/>` : ''}
      ${v ? `<text x="${x + bw / 2}" y="${y(v) - 5}" class="bar-val">${compact(v)}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 6}" class="bar-lbl">${monthLabel(r.month)}</text>
    </g>`;
  }).join('');
  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(mainLabel)} آخر ${num(series.length)} شهور">
      <line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" class="axis"/>${bars}
    </svg>
    <figcaption><span class="key main"></span>${esc(mainLabel)}${inner ? ` <span class="key inner"></span>${esc(innerLabel)}` : ''}</figcaption>
  </figure>`;
}

function compact(v) {
  return v >= 1000 ? `${Number((v / 1000).toFixed(v >= 10000 ? 0 : 1)).toLocaleString('ar-EG')}ك` : num(v);
}

export const PERIODS = [
  { id: 'month', label: 'الشهر ده' },
  { id: 'quarter', label: '٣ شهور' },
  { id: 'year', label: 'السنة دي' },
  { id: 'all', label: 'الكل' },
];
