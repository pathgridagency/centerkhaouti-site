import { sb, configured, esc } from './lib.js';
import dashboard from './views/dashboard.js';
import agenda from './views/agenda.js';
import appointments from './views/appointments.js';
import { patientsList, patientDetail } from './views/patients.js';
import { devisList, devisEditor } from './views/devis.js';
import payments from './views/payments.js';
import expenses from './views/expenses.js';
import settings from './views/settings.js';

const $ = id => document.getElementById(id);
const view = $('view');

const routes = {
  '': dashboard,
  agenda,
  'rendez-vous': appointments,
  patients: (el, id) => id ? patientDetail(el, id) : patientsList(el),
  devis: (el, id) => id ? devisEditor(el, id) : devisList(el),
  paiements: payments,
  charges: expenses,
  parametres: settings
};

let renderToken = 0;
async function render() {
  const [name = '', id] = location.hash.replace(/^#\/?/, '').split('/');
  document.querySelectorAll('.menu a').forEach(a => {
    const target = a.getAttribute('href').replace(/^#\/?/, '');
    a.classList.toggle('on', target === name);
  });
  $('app').querySelector('.side').classList.remove('open');
  const fn = routes[name] || dashboard;
  const token = ++renderToken;
  view.innerHTML = '<p class="muted">Chargement…</p>';
  const el = document.createElement('div');
  try {
    await fn(el, id && decodeURIComponent(id));
    if (token === renderToken) view.replaceChildren(el);
  } catch (err) {
    console.error(err);
    if (token === renderToken) view.innerHTML = `<div class="card"><b>Erreur :</b> ${esc(err.message || err)}</div>`;
  }
  refreshPendingCount();
}

async function refreshPendingCount() {
  const { count } = await sb.from('appointments').select('id', { count: 'exact', head: true })
    .eq('status', 'pending').gte('starts_at', new Date().toISOString());
  const el = $('pending-count');
  el.textContent = count || '';
  el.hidden = !count;
}

async function start(session) {
  const { data: staff } = await sb.from('staff').select('full_name').eq('user_id', session.user.id).maybeSingle();
  if (!staff) {
    showLogin(`Le compte ${session.user.email} n'est pas autorisé (ajoutez-le à la table « staff »).`);
    await sb.auth.signOut();
    return;
  }
  $('who').textContent = staff.full_name;
  $('login').hidden = true;
  $('app').hidden = false;
  $('boot').hidden = true;
  render();
}

function showLogin(msg = '') {
  $('boot').hidden = true;
  $('app').hidden = true;
  $('login').hidden = false;
  $('login').querySelector('.login-msg').textContent = msg;
}

if (!configured) {
  $('boot').innerHTML = `<div class="setup-box"><h2>Configuration requise</h2>
    <p>Renseignez <code>SUPABASE_URL</code> et <code>SUPABASE_ANON_KEY</code> dans
    <code>assets/js/config.js</code>, puis rechargez la page. Voir <code>SETUP.md</code>.</p></div>`;
} else {
  $('login').querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('button');
    btn.disabled = true;
    const { data, error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false;
    if (error) { f.querySelector('.login-msg').textContent = 'Email ou mot de passe incorrect.'; return; }
    f.reset();
    start(data.session);
  });
  $('logout').onclick = async () => { await sb.auth.signOut(); location.hash = ''; showLogin(); };
  $('menu-toggle').onclick = () => $('app').querySelector('.side').classList.toggle('open');
  window.addEventListener('hashchange', () => !$('app').hidden && render());
  window.addEventListener('ck:refresh', () => !$('app').hidden && render());

  const { data: { session } } = await sb.auth.getSession();
  session ? start(session) : showLogin();
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showLogin(); });
}

