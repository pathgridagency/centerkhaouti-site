import { sb, q, esc, field, toast, modal, confirmBox, rerender, money, fmtDate, getSettings, getServices } from '../lib.js';

const DAYS = [[1, 'Lundi'], [2, 'Mardi'], [3, 'Mercredi'], [4, 'Jeudi'], [5, 'Vendredi'], [6, 'Samedi'], [0, 'Dimanche']];
const rangesToText = r => (r || []).map(([a, b]) => `${a}-${b}`).join(', ');
function textToRanges(txt, dayName) {
  const out = [];
  for (const part of txt.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) throw new Error(`${dayName} : « ${part} » n'est pas au format 08:00-12:00`);
    const a = `${m[1].padStart(2, '0')}:${m[2]}`, b = `${m[3].padStart(2, '0')}:${m[4]}`;
    if (a >= b) throw new Error(`${dayName} : l'heure de fin doit être après le début`);
    out.push([a, b]);
  }
  return out;
}

function openService(s = {}) {
  modal({
    title: s.id ? 'Prestation' : 'Nouvelle prestation',
    extra: s.id ? '<button type="button" class="btn danger" data-del>Supprimer</button>' : '',
    body: `${field('Nom *', `<input name="name" required value="${esc(s.name || '')}">`)}
      <div class="form-grid">
        ${field('Prix (DH)', `<input name="price" type="number" min="0" step="0.01" value="${esc(s.price ?? 0)}">`)}
        ${field('Durée (minutes)', `<input name="duration_min" type="number" min="5" max="480" step="5" value="${esc(s.duration_min ?? 30)}">`)}
        ${field('Ordre d’affichage', `<input name="sort" type="number" value="${esc(s.sort ?? 0)}">`)}
      </div>
      <label class="field check"><input type="checkbox" name="online"${s.online !== false ? ' checked' : ''}> Réservable en ligne</label>
      <label class="field check"><input type="checkbox" name="active"${s.active !== false ? ' checked' : ''}> Active</label>`,
    onSubmit: async d => {
      d.price = +d.price || 0; d.duration_min = +d.duration_min || 30; d.sort = +d.sort || 0;
      if (s.id) await q(sb.from('services').update(d).eq('id', s.id));
      else await q(sb.from('services').insert(d));
      await getServices(true);
      toast('Prestation enregistrée'); rerender();
    },
    onOpen: (f, close) => f.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmBox(`Supprimer « ${s.name} » ? (Les devis et RDV existants sont conservés.) Vous pouvez aussi simplement la désactiver.`, 'Supprimer'))) return;
      await q(sb.from('services').delete().eq('id', s.id));
      await getServices(true);
      toast('Prestation supprimée'); close(); rerender();
    })
  });
}

export default async function settings(el) {
  const [s, services, closures, staff] = await Promise.all([
    getSettings(true), getServices(true),
    q(sb.from('closures').select('*').gte('day', new Date().toISOString().slice(0, 10)).order('day')),
    q(sb.from('staff').select('*').order('created_at'))
  ]);
  const v = k => esc(s[k] ?? '');

  el.innerHTML = `
    <div class="page-head"><h1>Paramètres</h1><button class="btn primary" data-save>Enregistrer</button></div>
    <form data-form class="grid g2" novalidate>
      <div class="card"><h2>Centre (en-tête des devis)</h2><div class="form-grid">
        ${field('Nom', `<input name="clinic_name" required value="${v('clinic_name')}">`)}
        ${field('Sous-titre', `<input name="clinic_subtitle" value="${v('clinic_subtitle')}">`)}
        ${field('Adresse', `<input name="address" required value="${v('address')}">`, 'full')}
        ${field('Téléphone', `<input name="phone" value="${v('phone')}">`)}
        ${field('Email', `<input name="email" value="${v('email')}">`)}
        ${field('Émetteur des devis', `<input name="issuer_name" required value="${v('issuer_name')}">`, 'full')}
        ${field('ICE', `<input name="ice" value="${v('ice')}">`)}
        ${field('Identifiant fiscal (IF)', `<input name="if_number" value="${v('if_number')}">`)}
        ${field('RC', `<input name="rc" value="${v('rc')}">`)}
        ${field('Taxe professionnelle (ITP)', `<input name="patente" value="${v('patente')}">`)}
        ${field('INPE', `<input name="inpe" value="${v('inpe')}">`)}
      </div></div>
      <div class="card"><h2>Devis</h2><div class="form-grid">
        ${field('TVA par défaut (%)', `<input name="tva_rate" type="number" min="0" step="0.01" value="${v('tva_rate')}">`)}
        ${field('Validité (jours)', `<input name="devis_validity_days" type="number" min="1" value="${v('devis_validity_days')}">`)}
        ${field('Mention en bas du devis', `<textarea name="devis_footer">${v('devis_footer')}</textarea>`, 'full')}
      </div>
      <h2 style="margin-top:20px">Réservation en ligne</h2><div class="form-grid">
        ${field('Pas des créneaux (min)', `<input name="slot_minutes" type="number" min="10" max="240" step="5" value="${v('slot_minutes')}">`)}
        ${field('Patients en parallèle', `<input name="slot_capacity" type="number" min="1" max="20" value="${v('slot_capacity')}">`)}
        ${field('Délai minimum (heures)', `<input name="min_notice_hours" type="number" min="0" value="${v('min_notice_hours')}">`)}
        ${field('Réservable jusqu’à (jours)', `<input name="max_days_ahead" type="number" min="1" max="365" value="${v('max_days_ahead')}">`)}
      </div></div>
      <div class="card"><h2>Horaires d’ouverture</h2>
        <p class="small muted" style="margin-bottom:10px">Format : <code>08:00-12:00, 14:00-19:00</code> — vide = fermé.</p>
        <div class="form-grid">${DAYS.map(([d, name]) =>
          field(name, `<input data-day="${d}" data-name="${name}" value="${esc(rangesToText(s.opening_hours?.[d]))}" placeholder="Fermé">`)).join('')}</div>
      </div>
      <div class="card"><h2>Fermetures exceptionnelles</h2>
        <div class="toolbar"><input type="date" data-cl-day><input data-cl-reason placeholder="Motif (Aïd, congés…)"><button type="button" class="btn sm" data-cl-add>Ajouter</button></div>
        <div class="list">${closures.map(c => `<div class="list-item"><b>${fmtDate(c.day)}</b><span class="grow">${esc(c.reason || '')}</span>
          <button type="button" class="icon-btn" data-cl-del="${c.day}">✕</button></div>`).join('') || '<p class="empty">Aucune fermeture prévue</p>'}</div>
      </div>
    </form>

    <div class="page-head" style="margin-top:28px"><h1 style="font-size:19px">Prestations & tarifs</h1><button class="btn" data-svc-new>+ Prestation</button></div>
    <div class="table-wrap"><table class="t">
      <thead><tr><th>Nom</th><th class="right">Prix</th><th>Durée</th><th>En ligne</th><th>Active</th></tr></thead>
      <tbody>${services.map(x => `<tr class="click" data-svc="${x.id}"><td>${esc(x.name)}</td><td class="right">${money(x.price)}</td>
        <td>${x.duration_min} min</td><td>${x.online ? '✓' : '—'}</td><td>${x.active ? '✓' : '—'}</td></tr>`).join('')}</tbody></table></div>

    <div class="card" style="margin-top:24px"><h2>Comptes ayant accès</h2>
      <div class="list">${staff.map(x => `<div class="list-item"><b>${esc(x.full_name)}</b><span class="grow small muted">depuis ${fmtDate(x.created_at)}</span></div>`).join('')}</div>
      <p class="small muted" style="margin-top:10px">Pour ajouter une personne : créez son compte dans Supabase (Authentication → Add user), puis ajoutez-la à la table <code>staff</code> (voir SETUP.md).</p>
    </div>`;

  const form = el.querySelector('[data-form]');
  el.querySelector('[data-save]').onclick = async () => {
    try {
      const d = {};
      for (const i of form.querySelectorAll('[name]')) d[i.name] = i.value.trim() === '' ? null : i.value.trim();
      for (const k of ['tva_rate', 'devis_validity_days', 'slot_minutes', 'slot_capacity', 'min_notice_hours', 'max_days_ahead']) d[k] = +d[k] || 0;
      d.opening_hours = {};
      form.querySelectorAll('[data-day]').forEach(i => d.opening_hours[i.dataset.day] = textToRanges(i.value, i.dataset.name));
      d.updated_at = new Date().toISOString();
      await q(sb.from('settings').update(d).eq('id', 1));
      await getSettings(true);
      toast('Paramètres enregistrés');
    } catch (e) { if (!e.code) toast(e.message, 'err'); }
  };
  el.querySelector('[data-cl-add]').onclick = async () => {
    const day = el.querySelector('[data-cl-day]').value;
    if (!day) { toast('Choisissez une date', 'err'); return; }
    await q(sb.from('closures').upsert({ day, reason: el.querySelector('[data-cl-reason]').value.trim() || null }));
    toast('Fermeture ajoutée'); rerender();
  };
  el.querySelectorAll('[data-cl-del]').forEach(b => b.onclick = async () => {
    await q(sb.from('closures').delete().eq('day', b.dataset.clDel)); rerender();
  });
  el.querySelector('[data-svc-new]').onclick = () => openService();
  el.querySelectorAll('[data-svc]').forEach(tr => tr.onclick = () => openService(services.find(x => x.id === tr.dataset.svc)));
}
