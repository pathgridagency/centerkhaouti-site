import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm';

const cfg = window.CK_CONFIG || {};
export const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
export const sb = configured ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

// ── Libellés ──────────────────────────────────────────────────────
export const STATUS = {
  pending:   { label: 'En attente', cls: 'b-amber' },
  confirmed: { label: 'Confirmé',   cls: 'b-teal' },
  done:      { label: 'Effectué',   cls: 'b-green' },
  cancelled: { label: 'Annulé',     cls: 'b-grey' },
  no_show:   { label: 'Absent',     cls: 'b-red' }
};
export const DEVIS_STATUS = {
  draft:     { label: 'Brouillon', cls: 'b-grey' },
  sent:      { label: 'Remis',     cls: 'b-blue' },
  accepted:  { label: 'Accepté',   cls: 'b-teal' },
  cancelled: { label: 'Annulé',    cls: 'b-red' }
};
export const METHODS = { cash: 'Espèces', card: 'Carte', cheque: 'Chèque', transfer: 'Virement', insurance: 'Mutuelle / assurance' };
export const EXPENSE_CATS = {
  electricite: 'Électricité', eau: 'Eau', internet: 'Internet', telephone: 'Téléphone', loyer: 'Loyer',
  salaires: 'Salaires', fournitures: 'Fournitures', materiel: 'Matériel', entretien: 'Entretien / ménage',
  impots: 'Impôts & taxes', autre: 'Autre'
};

// ── Formatage ─────────────────────────────────────────────────────
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const money = n => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  .format(+n || 0).replace(/ /g, ' ') + ' DH';
export const fmtDate = d => d ? new Date(String(d).length === 10 ? d + 'T12:00' : d)
  .toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
export const fmtDateLong = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = d => `${fmtDate(d)} ${fmtTime(d)}`;
const pad = n => String(n).padStart(2, '0');
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isoTime = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const monthStart = (d = new Date()) => isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
export const badge = (map, key) => `<span class="badge ${map[key]?.cls || ''}">${esc(map[key]?.label || key)}</span>`;

export function normalizePhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0') && d.length === 10) d = '212' + d.slice(1);
  return d;
}
export const waLink = (phone, text) => `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;

// ── Montant en lettres (devis) ────────────────────────────────────
const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
           'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const T = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };
function below100(n, noPlural) {
  if (n < 17) return U[n];
  if (n < 20) return 'dix-' + U[n - 10];
  const t = Math.floor(n / 10), u = n % 10;
  if (t === 7) return n === 71 ? 'soixante et onze' : 'soixante-' + below100(n - 60);
  if (t === 9) return 'quatre-vingt-' + below100(n - 80);
  if (t === 8) return u === 0 ? (noPlural ? 'quatre-vingt' : 'quatre-vingts') : 'quatre-vingt-' + U[u];
  if (u === 0) return T[t];
  return T[t] + (u === 1 ? ' et un' : '-' + U[u]);
}
function below1000(n, noPlural) {
  const h = Math.floor(n / 100), r = n % 100;
  if (!h) return below100(r, noPlural);
  const hs = h === 1 ? 'cent' : U[h] + ' cent';
  if (!r) return h > 1 && !noPlural ? hs + 's' : hs;
  return hs + ' ' + below100(r, noPlural);
}
export function numberToWords(n) {
  n = Math.floor(n);
  if (n === 0) return 'zéro';
  const parts = [], m = Math.floor(n / 1e6), k = Math.floor((n % 1e6) / 1000), r = n % 1000;
  if (m) parts.push(below1000(m) + ' million' + (m > 1 ? 's' : ''));
  if (k) parts.push(k === 1 ? 'mille' : below1000(k, true) + ' mille');
  if (r) parts.push(below1000(r));
  return parts.join(' ');
}
export function amountInWords(x) {
  const cents = Math.round((+x || 0) * 100), dh = Math.floor(cents / 100), c = cents % 100;
  let s = numberToWords(dh) + (dh >= 1e6 && dh % 1e6 === 0 ? ' de' : '') + ' dirham' + (dh > 1 ? 's' : '');
  if (c) s += ' et ' + numberToWords(c) + ' centime' + (c > 1 ? 's' : '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Données ───────────────────────────────────────────────────────
export async function q(promise) {
  const { data, error } = await promise;
  if (error) { toast(error.message, 'err'); throw error; }
  return data;
}
let settingsCache;
export async function getSettings(force) {
  if (!settingsCache || force) settingsCache = await q(sb.from('settings').select('*').eq('id', 1).single());
  return settingsCache;
}
let servicesCache;
export async function getServices(force) {
  if (!servicesCache || force) servicesCache = await q(sb.from('services').select('*').order('sort').order('name'));
  return servicesCache;
}
export const devisTotal = (items, discount, tva) => {
  const sub = items.reduce((s, i) => s + (+i.quantity || 0) * (+i.unit_price || 0), 0);
  const total = Math.round(Math.max(sub - (+discount || 0), 0) * (1 + (+tva || 0) / 100) * 100) / 100;
  return { sub, total };
};

// ── Interface ─────────────────────────────────────────────────────
export function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 3800);
}

/** Ouvre une fenêtre modale. `onSubmit(data, form)` renvoie false pour garder la fenêtre ouverte. */
export function modal({ title, body, submit = 'Enregistrer', onSubmit, extra = '', wide = false, onOpen }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg';
  wrap.innerHTML = `
    <form class="modal${wide ? ' wide' : ''}" novalidate>
      <header><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="Fermer">✕</button></header>
      <div class="modal-body">${body}</div>
      <footer>${extra}<span class="grow"></span>
        <button type="button" class="btn ghost" data-close>Annuler</button>
        ${onSubmit ? `<button type="submit" class="btn primary">${esc(submit)}</button>` : ''}
      </footer>
    </form>`;
  const form = wrap.firstElementChild;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', e => e.target === wrap && close());
  form.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try { if ((await onSubmit(formData(form), form)) !== false) close(); }
    catch (err) { console.error(err); }
    finally { btn.disabled = false; }
  });
  document.body.append(wrap);
  form.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  onOpen?.(form, close);
  return { form, close };
}

export function confirmBox(text, okLabel = 'Confirmer') {
  return new Promise(res => {
    let answered = false;
    const m = modal({
      title: 'Confirmation', body: `<p>${esc(text)}</p>`, submit: okLabel,
      onSubmit: () => { answered = true; res(true); }
    });
    const obs = new MutationObserver(() => { if (!m.form.isConnected) { obs.disconnect(); if (!answered) res(false); } });
    obs.observe(document.body, { childList: true });
  });
}

/** FormData → objet ; champs vides → null, cases à cocher → booléen */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value.trim() === '' ? null : el.value.trim();
  }
  return out;
}

export const field = (label, input, cls = '') => `<label class="field ${cls}"><span>${label}</span>${input}</label>`;
export const options = (map, sel, empty) =>
  (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
  Object.entries(map).map(([k, v]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

export function downloadCsv(name, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Champ de recherche de patient avec création rapide. Renvoie le HTML ; appeler bindPatientPicker(form). */
export const patientPicker = (p, name = 'patient_id') => `
  <div class="picker" data-picker="${name}">
    <input type="hidden" name="${name}" value="${esc(p?.id || '')}">
    <input type="search" class="picker-q" placeholder="Rechercher un patient (nom, téléphone, CIN)…" value="${esc(p?.full_name || '')}" autocomplete="off">
    <div class="picker-list" hidden></div>
  </div>`;
export function bindPatientPicker(form, onPick) {
  form.querySelectorAll('[data-picker]').forEach(box => {
    const hid = box.querySelector('input[type=hidden]'), qi = box.querySelector('.picker-q'), list = box.querySelector('.picker-list');
    let t;
    qi.addEventListener('input', () => {
      hid.value = '';
      clearTimeout(t);
      t = setTimeout(async () => {
        const s = qi.value.trim();
        if (s.length < 2) { list.hidden = true; return; }
        const like = `*${s.replace(/[*%_,()]/g, ' ')}*`;
        const rows = await q(sb.from('patients').select('id,full_name,phone,cin')
          .or(`full_name.ilike.${like},phone.ilike.${like},cin.ilike.${like}`).order('full_name').limit(8));
        list.innerHTML = rows.map(r => `<button type="button" data-id="${r.id}" data-name="${esc(r.full_name)}">
            <b>${esc(r.full_name)}</b> <small>${esc(r.phone || '')} ${esc(r.cin || '')}</small></button>`).join('')
          + `<button type="button" data-new><b>+ Nouveau patient :</b> ${esc(s)}</button>`;
        list.hidden = false;
      }, 220);
    });
    list.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.new !== undefined) {
        const [row] = await q(sb.from('patients').insert({ full_name: qi.value.trim() }).select('id,full_name,phone'));
        hid.value = row.id; qi.value = row.full_name;
        toast('Patient créé — complétez sa fiche plus tard');
        onPick?.(row);
      } else {
        hid.value = b.dataset.id; qi.value = b.dataset.name;
        onPick?.({ id: b.dataset.id, full_name: b.dataset.name });
      }
      list.hidden = true;
    });
    qi.addEventListener('blur', () => setTimeout(() => list.hidden = true, 200));
  });
}

/** Recharge la vue courante */
export const rerender = () => window.dispatchEvent(new Event('ck:refresh'));
