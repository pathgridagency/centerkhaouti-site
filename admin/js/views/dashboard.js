import { sb, q, esc, money, fmtDate, fmtTime, isoDate, monthStart, badge, STATUS, EXPENSE_CATS, rerender } from '../lib.js';
import { APPT_SELECT, apptName, apptPhone, openAppointment, waReminderLink } from './appt-common.js';

export default async function dashboard(el) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = ms => new Date(dayStart.getTime() + ms);
  const today = isoDate(), mStart = monthStart();
  const sixAgo = monthStart(new Date(now.getFullYear(), now.getMonth() - 5, 1));
  const in14 = isoDate(day(14 * 864e5));

  const [todayAppts, tomorrowAppts, pending, pays, expensesPaid, bills, devis] = await Promise.all([
    q(sb.from('appointments').select(APPT_SELECT).neq('status', 'cancelled')
      .gte('starts_at', dayStart.toISOString()).lt('starts_at', day(864e5).toISOString()).order('starts_at')),
    q(sb.from('appointments').select(APPT_SELECT).in('status', ['confirmed', 'pending'])
      .gte('starts_at', day(864e5).toISOString()).lt('starts_at', day(2 * 864e5).toISOString()).order('starts_at')),
    q(sb.from('appointments').select('id', { count: 'exact' }).eq('status', 'pending').gte('starts_at', now.toISOString())),
    q(sb.from('payments').select('amount,paid_on').gte('paid_on', sixAgo)),
    q(sb.from('expenses').select('amount,paid_on').gte('paid_on', sixAgo)),
    q(sb.from('expenses').select('*').is('paid_on', null).lte('due_date', in14).order('due_date')),
    q(sb.from('devis_summary').select('total,paid,status').in('status', ['sent', 'accepted']))
  ]);

  const month = (rows, from) => rows.filter(r => r.paid_on && r.paid_on >= from).reduce((s, r) => s + +r.amount, 0);
  const revenue = month(pays, mStart), costs = month(expensesPaid, mStart);
  const toCollect = devis.reduce((s, d) => s + Math.max(d.total - d.paid, 0), 0);
  const lateBills = bills.filter(b => b.due_date < today);

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = isoDate(d).slice(0, 7);
    const sumKey = rows => rows.filter(r => r.paid_on?.startsWith(key)).reduce((s, r) => s + +r.amount, 0);
    return { label: d.toLocaleDateString('fr-FR', { month: 'short' }), rev: sumKey(pays), cost: sumKey(expensesPaid) };
  });
  const max = Math.max(1, ...months.flatMap(m => [m.rev, m.cost]));

  const apptRow = (a, wa) => `
    <div class="list-item click" data-appt="${a.id}" style="cursor:pointer">
      <span class="time">${fmtTime(a.starts_at)}</span>
      <div class="grow"><b>${esc(apptName(a))}</b><small>${esc(a.service?.name || '')} ${esc(apptPhone(a))}</small></div>
      ${badge(STATUS, a.status)}
      ${wa && apptPhone(a) ? `<button class="btn sm wa" data-wa="${a.id}">Rappel</button>` : ''}
    </div>`;

  el.innerHTML = `
    <div class="page-head"><h1>Bonjour 👋</h1><span class="muted">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
    <div class="kpis">
      <div class="kpi"><span>RDV aujourd’hui</span><b>${todayAppts.length}</b></div>
      <a class="kpi ${pending.length ? 'warn' : ''}" href="#/rendez-vous" style="text-decoration:none"><span>Demandes en ligne à traiter</span><b>${pending.length}</b></a>
      <div class="kpi"><span>Encaissé ce mois</span><b>${money(revenue)}</b></div>
      <div class="kpi"><span>Charges payées ce mois</span><b>${money(costs)}</b></div>
      <div class="kpi ${revenue - costs < 0 ? 'neg' : ''}"><span>Résultat du mois</span><b>${money(revenue - costs)}</b></div>
      <a class="kpi ${toCollect ? 'warn' : ''}" href="#/devis" style="text-decoration:none"><span>Devis à encaisser</span><b>${money(toCollect)}</b></a>
    </div>
    <div class="grid g2">
      <div class="card"><h2>Aujourd’hui</h2>
        <div class="list">${todayAppts.map(a => apptRow(a)).join('') || '<p class="empty">Aucun rendez-vous aujourd’hui</p>'}</div></div>
      <div class="card"><h2>Demain — rappels à envoyer</h2>
        <div class="list">${tomorrowAppts.map(a => apptRow(a, true)).join('') || '<p class="empty">Aucun rendez-vous demain</p>'}</div></div>
      <div class="card"><h2>Factures à payer (14 jours)${lateBills.length ? ` <span class="badge b-red">${lateBills.length} en retard</span>` : ''}</h2>
        <div class="list">${bills.map(b => `
          <a class="list-item" href="#/charges" style="text-decoration:none;color:inherit">
            <div class="grow"><b>${esc(EXPENSE_CATS[b.category])}</b> ${esc(b.supplier || '')}<small>${esc(b.label || '')}</small></div>
            <span class="${b.due_date < today ? 'badge b-red' : 'small muted'}">${fmtDate(b.due_date)}</span>
            <b class="nowrap">${money(b.amount)}</b></a>`).join('') || '<p class="empty">Rien à payer prochainement</p>'}</div></div>
      <div class="card"><h2>Encaissements vs charges (6 mois)</h2>
        <div style="display:flex;align-items:flex-end;gap:14px;height:170px;padding-top:10px">
          ${months.map(m => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%">
            <div style="flex:1;display:flex;align-items:flex-end;gap:3px;width:100%;justify-content:center">
              <div title="Encaissé ${money(m.rev)}" style="width:42%;max-width:22px;height:${(m.rev / max) * 100}%;min-height:2px;background:var(--teal);border-radius:4px 4px 0 0"></div>
              <div title="Charges ${money(m.cost)}" style="width:42%;max-width:22px;height:${(m.cost / max) * 100}%;min-height:2px;background:var(--orange);border-radius:4px 4px 0 0"></div>
            </div><span class="small muted">${m.label}</span></div>`).join('')}
        </div>
        <div class="legend" style="margin:10px 0 0"><span><i style="background:var(--teal)"></i>Encaissé</span><span><i style="background:var(--orange)"></i>Charges payées</span></div>
      </div>
    </div>`;

  const all = [...todayAppts, ...tomorrowAppts];
  el.addEventListener('click', async e => {
    const wa = e.target.closest('[data-wa]');
    if (wa) { window.open(await waReminderLink(all.find(a => a.id === wa.dataset.wa)), '_blank', 'noopener'); return; }
    const row = e.target.closest('[data-appt]');
    if (row) openAppointment({ appt: all.find(a => a.id === row.dataset.appt), onSaved: rerender });
  });
}
