// Shared state and UI helpers used by every view.
import { load, save } from './store.js';
import { formatDate } from './logic.js';
import { icon } from './icons.js';

export const state = load();
state.workshops ||= [];
state.market ||= { listings: [], chats: {}, reviews: {} };
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

export function persist() {
  if (!save(state)) toast('مساحة التخزين اتملت. امسح صور فواتير قديمة أو اعمل نسخة احتياطية');
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
