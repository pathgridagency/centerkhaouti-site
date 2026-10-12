import { sb, q, esc, modal, field, options, toast, confirmBox, rerender, money, fmtDate, isoDate, monthStart,
         METHODS, patientPicker, bindPatientPicker, downloadCsv } from '../lib.js';

/** Encaissement : { payment?, patient?, devis?: {id, number, total, paid}, onSaved } */
export async function openPayment({ payment, patient, devis, onSaved }) {
  const x = payment || {};
  const pat = x.patient || patient;
  const loadDevis = async pid => pid ? q(sb.from('devis_summary').select('id,number,total,paid,status')
    .eq('patient_id', pid).neq('status', 'cancelled').order('issue_date', { ascending: false })) : [];
  const devisOpts = list => '<option value="">— Sans devis —</option>' + list.map(d =>
    `<option value="${d.id}" data-rest="${Math.max(d.total - d.paid, 0)}"${d.id === (x.devis_id || devis?.id) ? ' selected' : ''}>
      ${esc(d.number)} — reste ${money(Math.max(d.total - d.paid, 0))}</option>`).join('');
  const initial = await loadDevis(pat?.id || x.patient_id);
  const rest = devis ? Math.max(devis.total - devis.paid, 0) : '';

  const extra = x.id ? '<button type="button" class="btn danger" data-del>Supprimer</button>' : '';
  modal({
    title: x.id ? 'Encaissement' : 'Nouvel encaissement',
    extra,
    body: `${field('Patient', patientPicker(pat))}
      ${field('Devis concerné', `<select name="devis_id">${devisOpts(initial)}</select>`)}
      <div class="form-grid">
        ${field('Montant (DH) *', `<input name="amount" type="number" min="0.01" step="0.01" required value="${esc(x.amount ?? rest)}">`)}
        ${field('Date', `<input name="paid_on" type="date" required value="${esc(x.paid_on || isoDate())}">`)}
        ${field('Mode de paiement', `<select name="method">${options(METHODS, x.method || 'cash')}</select>`)}
        ${field('Référence (n° chèque, virement…)', `<input name="reference" value="${esc(x.reference || '')}">`)}
      </div>
      ${field('Notes', `<textarea name="notes">${esc(x.notes || '')}</textarea>`)}`,
    onSubmit: async d => {
      if (!d.patient_id) { toast('Choisissez un patient', 'err'); return false; }
      d.amount = +d.amount;
      if (x.id) await q(sb.from('payments').update(d).eq('id', x.id));
      else await q(sb.from('payments').insert(d));
      toast('Encaissement enregistré');
      onSaved?.();
    },
    onOpen: (f, close) => {
      bindPatientPicker(f, async p => { f.devis_id.innerHTML = devisOpts(await loadDevis(p.id)); });
      f.devis_id.addEventListener('change', () => {
        const r = f.devis_id.selectedOptions[0]?.dataset.rest;
        if (r && !x.id) f.amount.value = r;
      });
      f.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmBox('Supprimer cet encaissement ?', 'Supprimer'))) return;
        await q(sb.from('payments').delete().eq('id', x.id));
        toast('Encaissement supprimé'); close(); onSaved?.();
      });
    }
  });
}

let range = { from: monthStart(), to: isoDate() };

export default async function payments(el) {
  const rows = await q(sb.from('payments').select('*, patient:patients(id,full_name), devis(number)')
    .gte('paid_on', range.from).lte('paid_on', range.to).order('paid_on', { ascending: false }).order('created_at', { ascending: false }));
  const total = rows.reduce((s, x) => s + +x.amount, 0);
  const byMethod = Object.entries(rows.reduce((m, x) => (m[x.method] = (m[x.method] || 0) + +x.amount, m), {}));

  el.innerHTML = `
    <div class="page-head"><h1>Encaissements</h1>
      <button class="btn" data-csv>Exporter CSV</button>
      <button class="btn primary" data-new>+ Encaissement</button></div>
    <div class="toolbar">
      <label class="small muted">Du <input type="date" data-f="from" value="${range.from}"></label>
      <label class="small muted">au <input type="date" data-f="to" value="${range.to}"></label>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Total encaissé</span><b>${money(total)}</b><small>${rows.length} opération(s)</small></div>
      ${byMethod.map(([m, v]) => `<div class="kpi"><span>${esc(METHODS[m])}</span><b>${money(v)}</b></div>`).join('')}
    </div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Date</th><th>Patient</th><th>Devis</th><th>Mode</th><th>Référence</th><th class="right">Montant</th></tr></thead>
      <tbody>${rows.map(x => `<tr class="click" data-id="${x.id}">
        <td>${fmtDate(x.paid_on)}</td><td>${esc(x.patient?.full_name || '—')}</td><td>${esc(x.devis?.number || '—')}</td>
        <td>${esc(METHODS[x.method])}</td><td>${esc(x.reference || '')}</td><td class="right">${money(x.amount)}</td></tr>`).join('')
        || '<tr><td colspan="6" class="empty">Aucun encaissement sur la période</td></tr>'}</tbody>
      ${rows.length ? `<tfoot><tr><td colspan="5">Total</td><td class="right">${money(total)}</td></tr></tfoot>` : ''}
    </table></div>`;

  el.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { range[i.dataset.f] = i.value; rerender(); });
  el.querySelector('[data-new]').onclick = () => openPayment({ onSaved: rerender });
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = () =>
    openPayment({ payment: rows.find(x => x.id === tr.dataset.id), onSaved: rerender }));
  el.querySelector('[data-csv]').onclick = () => downloadCsv(`encaissements-${range.from}-${range.to}.csv`, [
    ['Date', 'Patient', 'Devis', 'Mode', 'Référence', 'Montant'],
    ...rows.map(x => [x.paid_on, x.patient?.full_name, x.devis?.number, METHODS[x.method], x.reference, String(x.amount).replace('.', ',')])
  ]);
}
