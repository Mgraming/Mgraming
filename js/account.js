// Account screen: sign up / sign in with email, sync status, sign out.
import { icon } from './icons.js';
import { client, auth, signIn, signUp, signOut, resetPassword, runSync, friendlyError } from './backend.js';
import { state, view, esc, num, toast, go, rerender, ask } from './ui.js';

let mode = 'signin';
let sentTo = '';

const when = iso => iso ? new Date(iso).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export function accountBanner() {
  if (!client || auth.user || state.hideAccountBanner) return '';
  return `<div class="account-banner">
    <span class="ico">${icon('cloud')}</span>
    <a class="grow" href="#account"><b>احفظ بياناتك في حساب</b><small>عشان متضيعش لو الموبايل ضاع، وتفتحها من أي جهاز.</small></a>
    <button class="icon-btn" data-hide-banner aria-label="مش دلوقتي">${icon('x')}</button>
  </div>`;
}

export function bindAccountBanner() {
  view.querySelector('[data-hide-banner]')?.addEventListener('click', () => {
    state.hideAccountBanner = true;
    rerender();
  });
}

export function viewAccount() {
  if (!client) {
    view.innerHTML = `<h1 class="page-title">حسابي</h1>
      <div class="notice">${icon('cloud-off')}<span>الحسابات مش متاحة في النسخة دي من التطبيق. بياناتك محفوظة على الموبايل ده.</span></div>`;
    return;
  }
  if (auth.user) return viewSignedIn();

  view.innerHTML = `
    <h1 class="page-title">حسابي</h1>
    <section class="account-why card">
      <div class="ico">${icon('cloud')}</div>
      <ul>
        <li>${icon('check', 'tiny')} بياناتك وصورك متتحفظ على السيرفر، ومتضيعش لو غيّرت الموبايل</li>
        <li>${icon('check', 'tiny')} تفتح عربيتك من أي موبايل أو كمبيوتر</li>
        <li>${icon('check', 'tiny')} تكلّم الورش وتطلب قطع غيار بجد</li>
      </ul>
    </section>
    ${sentTo ? `<div class="notice good">${icon('mail')}<span>بعتنالك إيميل على <b dir="ltr">${esc(sentTo)}</b>. افتحه ودوس على اللينك، وبعدين ارجع هنا وسجّل دخول. (بص في الـ Spam لو مش لاقيه)</span></div>` : ''}
    <nav class="seg" aria-label="الدخول">
      <button type="button" class="${mode === 'signin' ? 'on' : ''}" data-mode="signin">${icon('log-in')} دخول</button>
      <button type="button" class="${mode === 'signup' ? 'on' : ''}" data-mode="signup">${icon('plus')} حساب جديد</button>
    </nav>
    <form class="card form" id="auth-form">
      ${mode === 'signup' ? '<label>اسمك<input name="name" autocomplete="name" required></label>' : ''}
      <label>الإيميل<input name="email" type="email" dir="ltr" autocomplete="email" required></label>
      <label>الباسورد<input name="password" type="password" dir="ltr" minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required></label>
      <p class="form-error" id="auth-error" role="alert"></p>
      <button class="btn primary wide" type="submit" id="auth-submit">${mode === 'signup' ? 'اعمل الحساب' : 'دخول'}</button>
      ${mode === 'signin' ? '<button type="button" class="link center" id="forgot">نسيت الباسورد؟</button>' : ''}
    </form>
    ${state.cars.length ? `<p class="muted small">${icon('info', 'tiny')} العربيات اللي على الموبايل ده (${num(state.cars.length)}) هتتنقل لحسابك أول ما تسجّل دخول.</p>` : ''}`;

  view.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { mode = b.dataset.mode; rerender(); });
  const form = document.getElementById('auth-form');
  const err = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit');
  form.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    err.textContent = '';
    btn.disabled = true;
    btn.textContent = 'لحظة…';
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUp({ name: f.name.trim(), email: f.email.trim(), password: f.password });
        if (needsConfirmation) { sentTo = f.email.trim(); mode = 'signin'; rerender(); return; }
      } else {
        await signIn({ email: f.email.trim(), password: f.password });
      }
      sentTo = '';
      toast('أهلاً بيك! بننقل بياناتك…');
      go('account');
    } catch (ex) {
      err.textContent = friendlyError(ex);
      btn.disabled = false;
      btn.textContent = mode === 'signup' ? 'اعمل الحساب' : 'دخول';
    }
  };
  document.getElementById('forgot')?.addEventListener('click', async () => {
    const email = form.elements.email.value.trim();
    if (!email) { err.textContent = 'اكتب الإيميل الأول.'; return; }
    try { await resetPassword(email); toast('بعتنالك لينك تغيير الباسورد على الإيميل'); }
    catch (ex) { err.textContent = friendlyError(ex); }
  });
}

function viewSignedIn() {
  const s = state.sync || {};
  const name = auth.user.user_metadata?.full_name;
  view.innerHTML = `
    <h1 class="page-title">حسابي</h1>
    <section class="card account-card">
      <div class="shop-avatar">${icon('circle-user')}</div>
      <div class="grow">${name ? `<b>${esc(name)}</b>` : ''}<small dir="ltr">${esc(auth.user.email || auth.user.phone || '')}</small></div>
    </section>
    <section class="card">
      <div class="card-head"><h2>المزامنة</h2>
        <button class="btn small" id="sync-now" ${auth.syncing ? 'disabled' : ''}>${icon('refresh-cw')} ${auth.syncing ? 'بنزامن…' : 'زامن دلوقتي'}</button></div>
      ${s.error ? `<p class="notice bad">${icon('cloud-off')}<span>${esc(s.error)}</span></p>`
        : s.lastSync ? `<p class="ok-line">${icon('check')} كل حاجة متحفوظة. آخر مزامنة ${when(s.lastSync)}</p>`
        : '<p class="muted">لسه ما اتزامنش.</p>'}
      <p class="muted small">${num(state.cars.length)} عربية • ${num(state.cars.reduce((n, c) => n + (c.records?.length || 0), 0))} سجل • ${num(state.cars.reduce((n, c) => n + (c.fuel?.length || 0), 0))} تفويلة • ${num(state.cars.reduce((n, c) => n + (c.docs?.length || 0), 0))} ورقة</p>
      <p class="muted small">الورش والمحلات والشات لسه على الموبايل بس، وهيتربطوا بالحساب في الخطوة الجاية.</p>
    </section>
    <button class="btn danger wide" id="sign-out">${icon('log-out')} خروج</button>`;

  document.getElementById('sync-now').onclick = () => runSync();
  document.getElementById('sign-out').onclick = async () => {
    if (!await ask('هنحفظ آخر تعديلاتك على السيرفر، وبعدين نشيل بياناتك من الموبايل ده. تقدر ترجعها في أي وقت بتسجيل الدخول. خروج؟', 'خروج')) return;
    try { await signOut(); toast('خرجت من الحساب'); go('home'); }
    catch (ex) { toast(friendlyError(ex)); }
  };
}
