import { sb, q, esc, badge, STATUS, fmtDate, fmtTime, isoDate, options, rerender, toast, confirmBox, downloadCsv } from '../lib.js';
import { APPT_SELECT, apptName, apptPhone, openAppointment, confirmAppointment, waReminderLink } from './appt-common.js';

let filters = { status: '', from: isoDate(), to: '' };

export default async function appointments(el) {
  const pending = await q(sb.from('appointments').select(APPT_SELECT).eq('status', 'pending')
    .gte('starts_at', new Date().toISOString()).order('starts_at'));

  let query = sb.from('appointments').select(APPT_SELECT).order('starts_at').limit(500);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.from) query = query.gte('starts_at', new Date(filters.from + 'T00:00').toISOString());
  if (filters.to) query = query.lt('starts_at', new Date(new Date(filters.to + 'T00:00').getTime() + 864e5).toISOString());
  const rows = await q(query);
  const statusOpts = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label]));

  el.innerHTML = `
    <div class="page-head"><h1>Rendez-vous</h1>
      <button class="btn" data-csv>Exporter CSV</button>
      <button class="btn primary" data-new>+ Rendez-vous</button></div>

    ${pending.length ? `
    <div class="card" style="margin-bottom:18px;border-color:#f3dfb0">
      <h2>Demandes en ligne à traiter (${pending.length})</h2>
      <div class="list">${pending.map(a => `
        <div class="list-item" data-id="${a.id}">
          <div class="grow"><b>${esc(apptName(a))}</b> — ${fmtDate(a.starts_at)} à ${fmtTime(a.starts_at)}
            <small>${esc(a.req_phone || '')} ${a.service ? '· ' + esc(a.service.name) : ''} ${a.req_message ? '· « ' + esc(a.req_message) + ' »' : ''}</small></div>
          <a class="btn sm" href="tel:${esc(a.req_phone || '')}">Appeler</a>
          <button class="btn sm primary" data-ok>Confirmer</button>
          <button class="btn sm danger" data-no>Refuser</button>
        </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="toolbar">
      <select data-f="status">${options(statusOpts, filters.status, 'Tous les statuts')}</select>
      <label class="small muted">Du <input type="date" data-f="from" value="${filters.from || ''}"></label>
      <label class="small muted">au <input type="date" data-f="to" value="${filters.to || ''}"></label>
      <span class="muted small">${rows.length} rendez-vous</span>
    </div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Date</th><th>Heure</th><th>Patient</th><th>Téléphone</th><th>Prestation</th><th>Statut</th><th></th></tr></thead>
      <tbody>${rows.map(a => `
        <tr class="click" data-id="${a.id}">
          <td class="nowrap">${fmtDate(a.starts_at)}</td><td>${fmtTime(a.starts_at)}</td>
          <td>${esc(apptName(a))}${a.source === 'online' ? ' <span class="badge b-blue">en ligne</span>' : ''}</td>
          <td class="nowrap">${esc(apptPhone(a))}</td>
          <td>${esc(a.service?.name || '—')}</td>
          <td>${badge(STATUS, a.status)}</td>
          <td class="actions">
            ${a.status === 'confirmed' ? '<button class="btn sm" data-done>Effectué</button><button class="btn sm" data-absent>Absent</button>' : ''}
            ${apptPhone(a) && ['confirmed', 'pending'].includes(a.status) ? '<button class="btn sm wa" data-wa>Rappel</button>' : ''}
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="empty">Aucun rendez-vous</td></tr>'}
      </tbody></table></div>`;

  const byId = id => pending.find(a => a.id === id) || rows.find(a => a.id === id);
  el.querySelector('[data-new]').onclick = () => openAppointment({ onSaved: rerender });
  el.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { filters[i.dataset.f] = i.value; rerender(); });
  el.querySelector('[data-csv]').onclick = () => downloadCsv(`rendez-vous-${isoDate()}.csv`, [
    ['Date', 'Heure', 'Patient', 'Téléphone', 'Prestation', 'Statut', 'Source', 'Notes'],
    ...rows.map(a => [fmtDate(a.starts_at), fmtTime(a.starts_at), apptName(a), apptPhone(a), a.service?.name,
                      STATUS[a.status]?.label, a.source === 'online' ? 'En ligne' : 'Admin', a.notes])
  ]);

  el.addEventListener('click', async e => {
    const host = e.target.closest('[data-id]'); if (!host) return;
    const a = byId(host.dataset.id);
    const setStatus = async s => { await q(sb.from('appointments').update({ status: s }).eq('id', a.id)); toast('Statut mis à jour'); rerender(); };
    if (e.target.closest('[data-ok]')) { await confirmAppointment(a); rerender(); }
    else if (e.target.closest('[data-no]')) {
      if (await confirmBox(`Refuser la demande de ${apptName(a)} ? Le créneau sera libéré.`, 'Refuser')) await setStatus('cancelled');
    }
    else if (e.target.closest('[data-done]')) await setStatus('done');
    else if (e.target.closest('[data-absent]')) await setStatus('no_show');
    else if (e.target.closest('[data-wa]')) window.open(await waReminderLink(a), '_blank', 'noopener');
    else if (e.target.closest('a')) return;
    else openAppointment({ appt: a, onSaved: rerender });
  });
}
