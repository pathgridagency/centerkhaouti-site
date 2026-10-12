import { sb, q, esc, modal, field, toast, confirmBox, rerender, money, fmtDate, fmtTime, badge, STATUS, DEVIS_STATUS,
         METHODS, downloadCsv, isoDate } from '../lib.js';
import { APPT_SELECT, openAppointment } from './appt-common.js';
import { openPayment } from './payments.js';

let search = '';

export function openPatient(p = {}, onSaved) {
  modal({
    title: p.id ? 'Modifier la fiche patient' : 'Nouveau patient',
    wide: true,
    body: `<div class="form-grid">
      ${field('Nom complet *', `<input name="full_name" required maxlength="120" value="${esc(p.full_name || '')}">`)}
      ${field('Téléphone', `<input name="phone" type="tel" value="${esc(p.phone || '')}">`)}
      ${field('Email', `<input name="email" type="email" value="${esc(p.email || '')}">`)}
      ${field('CIN', `<input name="cin" value="${esc(p.cin || '')}">`)}
      ${field('Date de naissance', `<input name="birth_date" type="date" value="${esc(p.birth_date || '')}">`)}
      ${field('Sexe', `<select name="gender"><option value="">—</option>
          <option value="F"${p.gender === 'F' ? ' selected' : ''}>Femme</option>
          <option value="M"${p.gender === 'M' ? ' selected' : ''}>Homme</option></select>`)}
      ${field('Adresse', `<input name="address" value="${esc(p.address || '')}">`, 'full')}
      ${field('Couverture (CNSS, CNOPS, AMO, mutuelle…)', `<input name="insurance" list="ins-list" value="${esc(p.insurance || '')}">
          <datalist id="ins-list"><option>CNSS</option><option>CNOPS</option><option>AMO Tadamon</option><option>FAR</option><option>Mutuelle privée</option><option>Aucune</option></datalist>`)}
      ${field('N° d’immatriculation', `<input name="insurance_number" value="${esc(p.insurance_number || '')}">`)}
      ${field('Médecin prescripteur', `<input name="referring_doctor" value="${esc(p.referring_doctor || '')}">`)}
      ${field('Diagnostic / motif', `<input name="diagnosis" value="${esc(p.diagnosis || '')}">`)}
      ${field('Notes', `<textarea name="notes">${esc(p.notes || '')}</textarea>`, 'full')}
    </div>`,
    onSubmit: async d => {
      if (p.id) await q(sb.from('patients').update(d).eq('id', p.id));
      else { const [row] = await q(sb.from('patients').insert(d).select('id')); p.id = row.id; }
      toast('Fiche enregistrée');
      onSaved?.(p.id);
    }
  });
}

export async function patientsList(el) {
  el.innerHTML = `
    <div class="page-head"><h1>Patients</h1>
      <button class="btn" data-csv>Exporter CSV</button>
      <button class="btn primary" data-new>+ Patient</button></div>
    <div class="toolbar">
      <input type="search" placeholder="Rechercher : nom, téléphone, CIN, email…" value="${esc(search)}" data-q>
      <span class="muted small" data-count></span>
    </div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Nom</th><th>Téléphone</th><th>CIN</th><th>Couverture</th><th>Diagnostic</th><th>Créé le</th></tr></thead>
      <tbody></tbody></table></div>`;

  let rows = [];
  const load = async () => {
    let query = sb.from('patients').select('*').order('full_name').limit(300);
    const s = search.trim().replace(/[*%_,()]/g, ' ');
    if (s) query = query.or(`full_name.ilike.*${s}*,phone.ilike.*${s}*,cin.ilike.*${s}*,email.ilike.*${s}*`);
    rows = await q(query);
    el.querySelector('[data-count]').textContent = `${rows.length} patient(s)${rows.length === 300 ? ' — affinez la recherche' : ''}`;
    el.querySelector('tbody').innerHTML = rows.map(p => `
        <tr class="click" data-id="${p.id}">
          <td><b>${esc(p.full_name)}</b></td><td class="nowrap">${esc(p.phone || '')}</td><td>${esc(p.cin || '')}</td>
          <td>${esc(p.insurance || '')}</td><td>${esc(p.diagnosis || '')}</td><td>${fmtDate(p.created_at)}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty">Aucun patient</td></tr>';
  };
  await load();

  const qi = el.querySelector('[data-q]');
  let t;
  qi.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { search = qi.value; load(); }, 300); });
  requestAnimationFrame(() => qi.focus());
  el.querySelector('[data-new]').onclick = () => openPatient({}, id => location.hash = `#/patients/${id}`);
  el.querySelector('tbody').onclick = e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) location.hash = `#/patients/${tr.dataset.id}`;
  };
  el.querySelector('[data-csv]').onclick = () => downloadCsv(`patients-${isoDate()}.csv`, [
    ['Nom', 'Téléphone', 'Email', 'CIN', 'Naissance', 'Sexe', 'Adresse', 'Couverture', 'N° immatriculation', 'Médecin', 'Diagnostic'],
    ...rows.map(p => [p.full_name, p.phone, p.email, p.cin, p.birth_date, p.gender, p.address, p.insurance,
                      p.insurance_number, p.referring_doctor, p.diagnosis])
  ]);
}

let tab = 'rdv';
export async function patientDetail(el, id) {
  const [p, appts, devis, pays] = await Promise.all([
    q(sb.from('patients').select('*').eq('id', id).single()),
    q(sb.from('appointments').select(APPT_SELECT).eq('patient_id', id).order('starts_at', { ascending: false })),
    q(sb.from('devis_summary').select('*').eq('patient_id', id).order('issue_date', { ascending: false })),
    q(sb.from('payments').select('*, devis(number)').eq('patient_id', id).order('paid_on', { ascending: false }))
  ]);
  const billed = devis.filter(d => d.status !== 'cancelled').reduce((s, d) => s + +d.total, 0);
  const paid = pays.reduce((s, x) => s + +x.amount, 0);
  const age = p.birth_date ? Math.floor((Date.now() - new Date(p.birth_date)) / 31557600000) : null;
  const sessions = appts.filter(a => a.status === 'done').length;

  el.innerHTML = `
    <div class="page-head">
      <a href="#/patients" class="btn ghost sm">← Patients</a>
      <h1>${esc(p.full_name)}</h1>
      <button class="btn" data-edit>Modifier</button>
      <button class="btn" data-rdv>+ Rendez-vous</button>
      <button class="btn" data-pay>+ Encaissement</button>
      <a class="btn primary" href="#/devis/new?patient=${p.id}">+ Devis</a>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Séances effectuées</span><b>${sessions}</b></div>
      <div class="kpi"><span>Total des devis</span><b>${money(billed)}</b></div>
      <div class="kpi"><span>Total encaissé</span><b>${money(paid)}</b></div>
      <div class="kpi ${billed - paid > 0 ? 'warn' : ''}"><span>Reste à payer</span><b>${money(Math.max(billed - paid, 0))}</b></div>
    </div>
    <div class="card">
      <dl class="info">
        <dt>Téléphone</dt><dd>${p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '—'}</dd>
        <dt>Email</dt><dd>${esc(p.email || '—')}</dd>
        <dt>CIN</dt><dd>${esc(p.cin || '—')}</dd>
        <dt>Naissance</dt><dd>${p.birth_date ? `${fmtDate(p.birth_date)} (${age} ans)` : '—'}</dd>
        <dt>Adresse</dt><dd>${esc(p.address || '—')}</dd>
        <dt>Couverture</dt><dd>${esc(p.insurance || '—')} ${p.insurance_number ? '· ' + esc(p.insurance_number) : ''}</dd>
        <dt>Médecin prescripteur</dt><dd>${esc(p.referring_doctor || '—')}</dd>
        <dt>Diagnostic</dt><dd>${esc(p.diagnosis || '—')}</dd>
        <dt>Notes</dt><dd style="white-space:pre-wrap">${esc(p.notes || '—')}</dd>
      </dl>
    </div>
    <div class="tabs">
      <button data-tab="rdv">Rendez-vous & séances (${appts.length})</button>
      <button data-tab="devis">Devis (${devis.length})</button>
      <button data-tab="pay">Encaissements (${pays.length})</button>
    </div>
    <div data-pane="rdv" class="table-wrap"><table class="t">
      <thead><tr><th>Date</th><th>Prestation</th><th>Statut</th><th>Notes de séance</th></tr></thead>
      <tbody>${appts.map(a => `<tr class="click" data-appt="${a.id}">
        <td class="nowrap">${fmtDate(a.starts_at)} ${fmtTime(a.starts_at)}</td><td>${esc(a.service?.name || '—')}</td>
        <td>${badge(STATUS, a.status)}</td><td style="white-space:pre-wrap">${esc(a.notes || '')}</td></tr>`).join('')
        || '<tr><td colspan="4" class="empty">Aucun rendez-vous</td></tr>'}</tbody></table></div>
    <div data-pane="devis" class="table-wrap"><table class="t">
      <thead><tr><th>N°</th><th>Date</th><th>Statut</th><th class="right">Total</th><th class="right">Encaissé</th></tr></thead>
      <tbody>${devis.map(d => `<tr class="click" data-devis="${d.id}">
        <td><b>${esc(d.number)}</b></td><td>${fmtDate(d.issue_date)}</td><td>${badge(DEVIS_STATUS, d.status)}</td>
        <td class="right">${money(d.total)}</td><td class="right">${money(d.paid)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="empty">Aucun devis</td></tr>'}</tbody></table></div>
    <div data-pane="pay" class="table-wrap"><table class="t">
      <thead><tr><th>Date</th><th>Mode</th><th>Devis</th><th>Référence</th><th class="right">Montant</th></tr></thead>
      <tbody>${pays.map(x => `<tr class="click" data-pay-id="${x.id}">
        <td>${fmtDate(x.paid_on)}</td><td>${esc(METHODS[x.method])}</td><td>${esc(x.devis?.number || '—')}</td>
        <td>${esc(x.reference || '')}</td><td class="right">${money(x.amount)}</td></tr>`).join('')
        || '<tr><td colspan="5" class="empty">Aucun encaissement</td></tr>'}</tbody></table></div>
    <p style="margin-top:28px"><button class="btn danger sm" data-delete>Supprimer ce patient</button></p>`;

  const showTab = name => {
    tab = name;
    el.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    el.querySelectorAll('[data-pane]').forEach(p => p.hidden = p.dataset.pane !== name);
  };
  showTab(tab);
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  el.querySelector('[data-edit]').onclick = () => openPatient(p, rerender);
  el.querySelector('[data-rdv]').onclick = () => openAppointment({ patient: p, onSaved: rerender });
  el.querySelector('[data-pay]').onclick = () => openPayment({ patient: p, onSaved: rerender });
  el.querySelectorAll('[data-appt]').forEach(tr => tr.onclick = () =>
    openAppointment({ appt: appts.find(a => a.id === tr.dataset.appt), onSaved: rerender }));
  el.querySelectorAll('[data-devis]').forEach(tr => tr.onclick = () => location.hash = `#/devis/${tr.dataset.devis}`);
  el.querySelectorAll('[data-pay-id]').forEach(tr => tr.onclick = () =>
    openPayment({ payment: pays.find(x => x.id === tr.dataset.payId), patient: p, onSaved: rerender }));
  el.querySelector('[data-delete]').onclick = async () => {
    if (devis.length) { toast('Ce patient a des devis : annulez-les plutôt que de supprimer la fiche.', 'err'); return; }
    if (!(await confirmBox(`Supprimer définitivement la fiche de ${p.full_name} ? Ses rendez-vous seront détachés.`, 'Supprimer'))) return;
    await q(sb.from('patients').delete().eq('id', p.id));
    toast('Patient supprimé');
    location.hash = '#/patients';
  };
}
