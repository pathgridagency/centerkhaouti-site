import { sb, q, esc, field, options, toast, confirmBox, rerender, money, fmtDate, isoDate, badge, DEVIS_STATUS,
         patientPicker, bindPatientPicker, getServices, getSettings, devisTotal, amountInWords, downloadCsv } from '../lib.js';
import { openPayment } from './payments.js';

let filters = { status: '', search: '' };

export async function devisList(el) {
  let query = sb.from('devis_summary').select('*').order('issue_date', { ascending: false }).order('number', { ascending: false }).limit(300);
  if (filters.status) query = query.eq('status', filters.status);
  let rows = await q(query);
  const s = filters.search.trim().toLowerCase();
  if (s) rows = rows.filter(d => d.number.toLowerCase().includes(s) || (d.patient_name || '').toLowerCase().includes(s));
  const active = rows.filter(d => d.status !== 'cancelled');
  const total = active.reduce((a, d) => a + +d.total, 0), paid = active.reduce((a, d) => a + +d.paid, 0);
  const statusOpts = Object.fromEntries(Object.entries(DEVIS_STATUS).map(([k, v]) => [k, v.label]));

  el.innerHTML = `
    <div class="page-head"><h1>Devis</h1>
      <button class="btn" data-csv>Exporter CSV</button>
      <a class="btn primary" href="#/devis/new">+ Nouveau devis</a></div>
    <div class="kpis">
      <div class="kpi"><span>Montant des devis</span><b>${money(total)}</b><small>${active.length} devis (hors annulés)</small></div>
      <div class="kpi"><span>Encaissé</span><b>${money(paid)}</b></div>
      <div class="kpi ${total - paid > 0 ? 'warn' : ''}"><span>Reste à encaisser</span><b>${money(Math.max(total - paid, 0))}</b></div>
    </div>
    <div class="toolbar">
      <input type="search" placeholder="N° de devis ou patient…" value="${esc(filters.search)}" data-q>
      <select data-status>${options(statusOpts, filters.status, 'Tous les statuts')}</select>
    </div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>N°</th><th>Date</th><th>Patient</th><th>Statut</th><th class="right">Total</th><th class="right">Encaissé</th><th>Paiement</th><th></th></tr></thead>
      <tbody>${rows.map(d => {
        const rest = d.total - d.paid;
        const pay = d.status === 'cancelled' ? '' : d.total > 0 && rest <= 0 ? '<span class="badge b-green">Soldé</span>'
                  : d.paid > 0 ? '<span class="badge b-amber">Partiel</span>' : '<span class="badge b-grey">Non payé</span>';
        return `<tr class="click" data-id="${d.id}">
          <td><b>${esc(d.number)}</b></td><td>${fmtDate(d.issue_date)}</td><td>${esc(d.patient_name || '')}</td>
          <td>${badge(DEVIS_STATUS, d.status)}</td><td class="right nowrap">${money(d.total)}</td>
          <td class="right nowrap">${money(d.paid)}</td><td>${pay}</td>
          <td class="actions"><a class="btn sm" href="devis-print.html?id=${d.id}" target="_blank" data-print>Imprimer</a></td></tr>`;
      }).join('') || '<tr><td colspan="8" class="empty">Aucun devis</td></tr>'}</tbody></table></div>`;

  const qi = el.querySelector('[data-q]');
  let t;
  qi.oninput = () => { clearTimeout(t); t = setTimeout(() => { filters.search = qi.value; rerender(); }, 400); };
  el.querySelector('[data-status]').onchange = e => { filters.status = e.target.value; rerender(); };
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = e => {
    if (!e.target.closest('[data-print]')) location.hash = `#/devis/${tr.dataset.id}`;
  });
  el.querySelector('[data-csv]').onclick = () => downloadCsv(`devis-${isoDate()}.csv`, [
    ['N°', 'Date', 'Patient', 'Statut', 'Total', 'Encaissé'],
    ...rows.map(d => [d.number, d.issue_date, d.patient_name, DEVIS_STATUS[d.status]?.label,
                      String(d.total).replace('.', ','), String(d.paid).replace('.', ',')])
  ]);
}

export async function devisEditor(el, id) {
  const isNew = id.startsWith('new');
  const [services, settings] = await Promise.all([getServices(), getSettings()]);
  let d, items, patient;
  if (isNew) {
    const pid = new URLSearchParams(id.split('?')[1] || '').get('patient');
    patient = pid ? await q(sb.from('patients').select('id,full_name').eq('id', pid).single()) : null;
    const valid = new Date(Date.now() + settings.devis_validity_days * 864e5);
    d = { status: 'draft', issue_date: isoDate(), valid_until: isoDate(valid), discount: 0, tva_rate: settings.tva_rate,
          issued_by: settings.issuer_name, total: 0, paid: 0 };
    items = [{ description: '', quantity: 1, unit_price: 0 }];
  } else {
    [d, items] = await Promise.all([
      q(sb.from('devis_summary').select('*').eq('id', id).single()),
      q(sb.from('devis_items').select('*').eq('devis_id', id).order('position'))
    ]);
    patient = { id: d.patient_id, full_name: d.patient_name };
  }
  const statusOpts = Object.fromEntries(Object.entries(DEVIS_STATUS).map(([k, v]) => [k, v.label]));
  const svcOpts = '<option value="">+ Ajouter une prestation…</option>' + services.filter(s => s.active)
    .map(s => `<option value="${s.id}">${esc(s.name)} — ${money(s.price)}</option>`).join('');

  el.innerHTML = `
    <div class="page-head">
      <a href="#/devis" class="btn ghost sm">← Devis</a>
      <h1>${isNew ? 'Nouveau devis' : 'Devis ' + esc(d.number)}</h1>
      ${!isNew ? `<button class="btn" data-pay>+ Encaissement</button>
                  <button class="btn" data-print-now>Imprimer / PDF</button>` : ''}
      <button class="btn primary" data-save>Enregistrer</button>
    </div>
    <form class="card" data-form novalidate>
      <div class="form-grid">
        ${field('Patient *', patientPicker(patient))}
        ${field('Statut', `<select name="status">${options(statusOpts, d.status)}</select>`)}
        ${field('Date du devis', `<input type="date" name="issue_date" required value="${esc(d.issue_date)}">`)}
        ${field('Valable jusqu’au', `<input type="date" name="valid_until" value="${esc(d.valid_until || '')}">`)}
      </div>
      <h2 style="margin-top:22px">Prestations</h2>
      <div class="table-wrap"><table class="t items">
        <thead><tr><th>Désignation</th><th>Qté</th><th>P.U. (DH)</th><th class="right">Montant</th><th></th></tr></thead>
        <tbody data-items></tbody>
      </table></div>
      <div class="toolbar" style="margin-top:10px">
        <select data-add-svc>${svcOpts}</select>
        <button type="button" class="btn sm" data-add>+ Ligne libre</button>
      </div>
      <div class="form-grid" style="margin-top:10px">
        ${field('Remise (DH)', `<input type="number" name="discount" min="0" step="0.01" value="${esc(d.discount)}">`)}
        ${field('TVA (%)', `<input type="number" name="tva_rate" min="0" step="0.01" value="${esc(d.tva_rate)}">`)}
        ${field('Établi par', `<input name="issued_by" required value="${esc(d.issued_by)}">`)}
        ${field('Notes (imprimées sur le devis)', `<textarea name="notes" placeholder="Ex : 10 séances de rééducation du genou, 2 séances/semaine">${esc(d.notes || '')}</textarea>`, 'full')}
      </div>
      <div class="totals" data-totals></div>
      ${!isNew ? `<p class="muted small" style="margin-top:12px">Encaissé : <b>${money(d.paid)}</b> — reste : <b>${money(Math.max(d.total - d.paid, 0))}</b></p>` : ''}
    </form>
    ${!isNew ? '<p style="margin-top:22px"><button class="btn danger sm" data-delete>Supprimer ce devis</button></p>' : ''}`;

  const form = el.querySelector('[data-form]'), tbody = el.querySelector('[data-items]');
  bindPatientPicker(form);

  const drawItems = () => {
    tbody.innerHTML = items.map((it, i) => `<tr data-i="${i}">
      <td><input data-k="description" value="${esc(it.description)}" placeholder="Ex : Séance de kinésithérapie"></td>
      <td class="qty"><input data-k="quantity" type="number" min="0.01" step="0.01" value="${esc(it.quantity)}"></td>
      <td class="num"><input data-k="unit_price" type="number" min="0" step="0.01" value="${esc(it.unit_price)}"></td>
      <td class="right nowrap" data-line>${money(it.quantity * it.unit_price)}</td>
      <td><button type="button" class="icon-btn" data-rm title="Retirer">✕</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">Aucune ligne</td></tr>';
    drawTotals();
  };
  const drawTotals = () => {
    const { sub, total } = devisTotal(items, form.discount.value, form.tva_rate.value);
    const tva = +form.tva_rate.value || 0;
    el.querySelector('[data-totals]').innerHTML = `
      <span>Sous-total</span><b class="right">${money(sub)}</b>
      ${+form.discount.value ? `<span>Remise</span><b class="right">− ${money(form.discount.value)}</b>` : ''}
      ${tva ? `<span>TVA ${tva} %</span><b class="right">${money(total - Math.max(sub - (+form.discount.value || 0), 0))}</b>` : ''}
      <span class="grand">Total</span><span class="grand right">${money(total)}</span>
      <span class="small muted" style="grid-column:1/-1">${esc(amountInWords(total))}</span>`;
  };
  drawItems();

  tbody.addEventListener('input', e => {
    const tr = e.target.closest('tr[data-i]'); if (!tr) return;
    const it = items[tr.dataset.i];
    it[e.target.dataset.k] = e.target.dataset.k === 'description' ? e.target.value : +e.target.value;
    tr.querySelector('[data-line]').textContent = money(it.quantity * it.unit_price);
    drawTotals();
  });
  tbody.addEventListener('click', e => {
    if (!e.target.closest('[data-rm]')) return;
    items.splice(+e.target.closest('tr').dataset.i, 1);
    drawItems();
  });
  el.querySelector('[data-add]').onclick = () => { items.push({ description: '', quantity: 1, unit_price: 0 }); drawItems(); };
  el.querySelector('[data-add-svc]').onchange = e => {
    const s = services.find(x => x.id === e.target.value); if (!s) return;
    const blank = items.findIndex(i => !i.description);
    const row = { service_id: s.id, description: s.name, quantity: 1, unit_price: +s.price };
    blank >= 0 ? items.splice(blank, 1, row) : items.push(row);
    e.target.value = '';
    drawItems();
  };
  form.discount.oninput = form.tva_rate.oninput = drawTotals;

  const save = async () => {
    const f = Object.fromEntries(new FormData(form));
    if (!f.patient_id) { toast('Choisissez un patient', 'err'); return null; }
    const lines = items.filter(i => i.description.trim());
    if (!lines.length) { toast('Ajoutez au moins une prestation', 'err'); return null; }
    const row = { patient_id: f.patient_id, status: f.status, issue_date: f.issue_date, valid_until: f.valid_until || null,
                  discount: +f.discount || 0, tva_rate: +f.tva_rate || 0, issued_by: f.issued_by || settings.issuer_name,
                  notes: f.notes.trim() || null };
    let devisId = d.id;
    if (isNew) [{ id: devisId }] = await q(sb.from('devis').insert(row).select('id'));
    else {
      await q(sb.from('devis').update(row).eq('id', devisId));
      await q(sb.from('devis_items').delete().eq('devis_id', devisId));
    }
    await q(sb.from('devis_items').insert(lines.map((l, i) => ({
      devis_id: devisId, position: i, service_id: l.service_id || null,
      description: l.description.trim(), quantity: +l.quantity || 1, unit_price: +l.unit_price || 0
    }))));
    toast('Devis enregistré');
    return devisId;
  };

  const saveBtn = el.querySelector('[data-save]');
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try {
      const newId = await save();
      if (newId && isNew) location.hash = `#/devis/${newId}`;
      else if (newId) rerender();
    } finally { saveBtn.disabled = false; }
  };
  el.querySelector('[data-print-now]')?.addEventListener('click', async () => {
    const w = window.open('about:blank', '_blank'); // ouvert avant l'enregistrement pour éviter le blocage des pop-ups
    const savedId = await save().catch(() => null);
    if (savedId && w) w.location.href = `devis-print.html?id=${savedId}`;
    else w?.close();
  });
  el.querySelector('[data-pay]')?.addEventListener('click', () =>
    openPayment({ patient, devis: d, onSaved: rerender }));
  el.querySelector('[data-delete]')?.addEventListener('click', async () => {
    if (d.paid > 0) { toast('Ce devis a des encaissements : passez-le plutôt en « Annulé ».', 'err'); return; }
    if (!(await confirmBox(`Supprimer définitivement le devis ${d.number} ?`, 'Supprimer'))) return;
    await q(sb.from('devis').delete().eq('id', d.id));
    toast('Devis supprimé');
    location.hash = '#/devis';
  });
}
