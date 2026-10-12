import { sb, q, esc, modal, field, options, toast, confirmBox, rerender, money, fmtDate, isoDate, EXPENSE_CATS, downloadCsv } from '../lib.js';

const year = new Date().getFullYear();
let filters = { from: `${year}-01-01`, to: `${year}-12-31`, category: '', state: '' };

function openExpense(x = {}, onSaved) {
  const dup = !!x._dup;
  modal({
    title: x.id ? 'Charge / facture' : 'Nouvelle charge',
    extra: x.id ? `<button type="button" class="btn danger" data-del>Supprimer</button>
                   <button type="button" class="btn" data-dup>Dupliquer (mois suivant)</button>` : '',
    body: `<div class="form-grid">
        ${field('Catégorie', `<select name="category">${options(EXPENSE_CATS, x.category || 'electricite')}</select>`)}
        ${field('Fournisseur', `<input name="supplier" list="sup-list" value="${esc(x.supplier || '')}" placeholder="Ex : Redal, Maroc Telecom…">
           <datalist id="sup-list"><option>Redal</option><option>ONEE</option><option>Lydec</option><option>Maroc Telecom</option><option>Orange</option><option>inwi</option></datalist>`)}
        ${field('Libellé', `<input name="label" value="${esc(x.label || '')}" placeholder="Ex : Facture électricité septembre">`, 'full')}
        ${field('Montant (DH) *', `<input name="amount" type="number" min="0" step="0.01" required value="${esc(x.amount ?? '')}">`)}
        ${field('Mois concerné', `<input name="period" type="month" value="${esc((x.period || '').slice(0, 7))}">`)}
        ${field('Échéance', `<input name="due_date" type="date" value="${esc(x.due_date || '')}">`)}
        ${field('Payée le (vide = à payer)', `<input name="paid_on" type="date" value="${esc(x.paid_on || '')}">`)}
        ${field('N° de facture / référence', `<input name="reference" value="${esc(x.reference || '')}">`)}
        ${field('Notes', `<textarea name="notes">${esc(x.notes || '')}</textarea>`, 'full')}
      </div>`,
    onSubmit: async d => {
      d.amount = +d.amount;
      d.period = d.period ? d.period + '-01' : null;
      if (x.id && !dup) await q(sb.from('expenses').update(d).eq('id', x.id));
      else await q(sb.from('expenses').insert(d));
      toast('Charge enregistrée');
      onSaved?.();
    },
    onOpen: (f, close) => {
      f.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmBox('Supprimer cette charge ?', 'Supprimer'))) return;
        await q(sb.from('expenses').delete().eq('id', x.id));
        toast('Charge supprimée'); close(); onSaved?.();
      });
      f.querySelector('[data-dup]')?.addEventListener('click', () => {
        close();
        const next = s => { if (!s) return null; const dt = new Date(s + 'T12:00'); dt.setMonth(dt.getMonth() + 1); return isoDate(dt); };
        openExpense({ ...x, id: null, _dup: true, period: next(x.period), due_date: next(x.due_date), paid_on: null, reference: null }, onSaved);
      });
    }
  });
}

export default async function expenses(el) {
  let query = sb.from('expenses').select('*')
    .or(`and(period.gte.${filters.from},period.lte.${filters.to}),and(period.is.null,due_date.gte.${filters.from},due_date.lte.${filters.to}),and(period.is.null,due_date.is.null)`)
    .order('due_date', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false });
  if (filters.category) query = query.eq('category', filters.category);
  let rows = await q(query);
  const today = isoDate();
  const state = x => x.paid_on ? 'paid' : x.due_date && x.due_date < today ? 'late' : 'due';
  if (filters.state) rows = rows.filter(x => state(x) === filters.state);

  const sum = f => rows.filter(f).reduce((s, x) => s + +x.amount, 0);
  const byCat = Object.entries(rows.reduce((m, x) => (m[x.category] = (m[x.category] || 0) + +x.amount, m), {}))
    .sort((a, b) => b[1] - a[1]);
  const max = byCat[0]?.[1] || 1;

  el.innerHTML = `
    <div class="page-head"><h1>Charges & factures</h1>
      <button class="btn" data-csv>Exporter CSV</button>
      <button class="btn primary" data-new>+ Charge</button></div>
    <div class="toolbar">
      <label class="small muted">Du <input type="date" data-f="from" value="${filters.from}"></label>
      <label class="small muted">au <input type="date" data-f="to" value="${filters.to}"></label>
      <select data-f="category">${options(EXPENSE_CATS, filters.category, 'Toutes catégories')}</select>
      <select data-f="state">${options({ due: 'À payer', late: 'En retard', paid: 'Payées' }, filters.state, 'Tous états')}</select>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Total des charges</span><b>${money(sum(() => true))}</b><small>${rows.length} ligne(s)</small></div>
      <div class="kpi"><span>Payées</span><b>${money(sum(x => state(x) === 'paid'))}</b></div>
      <div class="kpi warn"><span>À payer</span><b>${money(sum(x => state(x) === 'due'))}</b></div>
      <div class="kpi neg"><span>En retard</span><b>${money(sum(x => state(x) === 'late'))}</b></div>
    </div>
    <div class="grid split">
      <div class="table-wrap"><table class="t">
        <thead><tr><th>Échéance</th><th>Catégorie</th><th>Libellé / fournisseur</th><th>Mois</th><th>État</th><th class="right">Montant</th><th></th></tr></thead>
        <tbody>${rows.map(x => {
          const s = state(x);
          return `<tr class="click" data-id="${x.id}">
          <td class="nowrap">${fmtDate(x.due_date)}</td><td>${esc(EXPENSE_CATS[x.category])}</td>
          <td>${esc(x.label || '')}<br><small class="muted">${esc(x.supplier || '')} ${x.reference ? '· ' + esc(x.reference) : ''}</small></td>
          <td class="nowrap">${x.period ? new Date(x.period + 'T12:00').toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '—'}</td>
          <td>${s === 'paid' ? `<span class="badge b-green">Payée ${fmtDate(x.paid_on)}</span>` : s === 'late' ? '<span class="badge b-red">En retard</span>' : '<span class="badge b-amber">À payer</span>'}</td>
          <td class="right nowrap">${money(x.amount)}</td>
          <td class="actions">${s !== 'paid' ? '<button class="btn sm" data-paid>Marquer payée</button>' : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">Aucune charge sur la période</td></tr>'}</tbody></table></div>
      <div class="card"><h2>Par catégorie</h2>
        ${byCat.map(([c, v]) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between" class="small">
          <span>${esc(EXPENSE_CATS[c])}</span><b>${money(v)}</b></div>
          <div style="height:6px;background:#eef3f2;border-radius:4px;margin-top:4px"><div style="height:100%;width:${(v / max) * 100}%;background:var(--teal);border-radius:4px"></div></div></div>`).join('')
          || '<p class="empty">—</p>'}
      </div>
    </div>`;

  el.querySelectorAll('[data-f]').forEach(i => i.onchange = () => { filters[i.dataset.f] = i.value; rerender(); });
  el.querySelector('[data-new]').onclick = () => openExpense({}, rerender);
  el.querySelectorAll('tr[data-id]').forEach(tr => tr.onclick = async e => {
    const x = rows.find(r => r.id === tr.dataset.id);
    if (e.target.closest('[data-paid]')) {
      await q(sb.from('expenses').update({ paid_on: isoDate() }).eq('id', x.id));
      toast('Marquée comme payée'); rerender();
    } else openExpense(x, rerender);
  });
  el.querySelector('[data-csv]').onclick = () => downloadCsv(`charges-${filters.from}-${filters.to}.csv`, [
    ['Catégorie', 'Libellé', 'Fournisseur', 'Mois', 'Échéance', 'Payée le', 'Référence', 'Montant'],
    ...rows.map(x => [EXPENSE_CATS[x.category], x.label, x.supplier, x.period?.slice(0, 7), x.due_date, x.paid_on,
                      x.reference, String(x.amount).replace('.', ',')])
  ]);
}
