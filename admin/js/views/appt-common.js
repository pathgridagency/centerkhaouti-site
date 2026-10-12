import { sb, q, esc, modal, field, options, toast, confirmBox, patientPicker, bindPatientPicker,
         getServices, getSettings, isoDate, isoTime, fmtDateLong, fmtTime, waLink, STATUS } from '../lib.js';

export const APPT_SELECT = '*, patient:patients(id,full_name,phone), service:services(id,name)';

export const apptName = a => a.patient?.full_name || a.req_name || 'Sans nom';
export const apptPhone = a => a.patient?.phone || a.req_phone || '';

export async function waConfirmLink(a) {
  const s = await getSettings();
  return waLink(apptPhone(a), `Bonjour ${apptName(a)}, votre rendez-vous au ${s.clinic_name} est confirmé pour le `
    + `${fmtDateLong(a.starts_at)} à ${fmtTime(a.starts_at)}. Adresse : ${s.address}. À bientôt !`);
}
export async function waReminderLink(a) {
  const s = await getSettings();
  return waLink(apptPhone(a), `Bonjour ${apptName(a)}, petit rappel de votre rendez-vous au ${s.clinic_name} le `
    + `${fmtDateLong(a.starts_at)} à ${fmtTime(a.starts_at)}. En cas d'empêchement, merci de nous prévenir au ${s.phone}.`);
}

/** Confirme une demande en ligne : crée la fiche patient si besoin, puis propose WhatsApp */
export async function confirmAppointment(a) {
  let patientId = a.patient_id;
  if (!patientId) {
    const [p] = await q(sb.from('patients').insert({
      full_name: a.req_name || 'Patient', phone: a.req_phone, email: a.req_email
    }).select('id,full_name,phone'));
    patientId = p.id;
    a.patient = p;
  }
  await q(sb.from('appointments').update({ status: 'confirmed', patient_id: patientId }).eq('id', a.id));
  a.status = 'confirmed';
  if (apptPhone(a)) {
    const link = await waConfirmLink(a);
    modal({
      title: 'Rendez-vous confirmé',
      body: `<p>Le rendez-vous de <b>${esc(apptName(a))}</b> est confirmé.</p>
             <p>Prévenir le patient :</p>
             <p><a class="btn wa" href="${esc(link)}" target="_blank" rel="noopener">Envoyer la confirmation WhatsApp</a>
                <a class="btn" href="tel:${esc(apptPhone(a))}">Appeler ${esc(apptPhone(a))}</a></p>`
    });
  } else toast('Rendez-vous confirmé');
}

async function overlapCount(startIso, endIso, excludeId) {
  let query = sb.from('appointments').select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'confirmed', 'done']).lt('starts_at', endIso).gt('ends_at', startIso);
  if (excludeId) query = query.neq('id', excludeId);
  const { count } = await query;
  return count || 0;
}

/**
 * Création / modification d'un rendez-vous.
 * @param {object} o  { appt?, start?: Date, end?: Date, patient?, onSaved }
 */
export async function openAppointment({ appt, start, end, patient, onSaved }) {
  const [services, settings] = await Promise.all([getServices(), getSettings()]);
  const a = appt || {};
  const st = a.starts_at ? new Date(a.starts_at) : (start || new Date());
  const dur = a.starts_at ? Math.round((new Date(a.ends_at) - st) / 60000)
            : end ? Math.round((end - st) / 60000) : settings.slot_minutes;
  const svcOpts = services.filter(s => s.active || s.id === a.service_id)
    .map(s => `<option value="${s.id}" data-dur="${s.duration_min}"${s.id === a.service_id ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const statusOpts = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.label]));
  const pat = a.patient || patient;

  const request = a.source === 'online' ? `
    <div class="card" style="background:#fdf8ec;border-color:#f3dfb0">
      <b>Demande en ligne</b> — ${esc(a.req_name || '')} · <a href="tel:${esc(a.req_phone || '')}">${esc(a.req_phone || '')}</a>
      ${a.req_email ? ` · ${esc(a.req_email)}` : ''}
      ${a.req_message ? `<p class="small" style="margin-top:6px">« ${esc(a.req_message)} »</p>` : ''}
      ${!a.patient_id ? '<p class="small muted" style="margin-top:6px">Aucune fiche patient liée : elle sera créée à la confirmation (ou choisissez un patient existant ci-dessous).</p>' : ''}
    </div>` : '';

  const extra = a.id ? `
    <button type="button" class="btn danger" data-del>Supprimer</button>
    ${apptPhone(a) ? `<a class="btn wa sm" target="_blank" rel="noopener" data-wa>Rappel WhatsApp</a>` : ''}` : '';

  const { form } = modal({
    title: a.id ? 'Rendez-vous' : 'Nouveau rendez-vous',
    extra,
    body: `${request}
      ${field('Patient', patientPicker(pat))}
      <div class="form-grid">
        ${field('Prestation', `<select name="service_id"><option value="">—</option>${svcOpts}</select>`)}
        ${field('Statut', `<select name="status">${options(statusOpts, a.status || 'confirmed')}</select>`)}
        ${field('Date', `<input type="date" name="date" required value="${isoDate(st)}">`)}
        ${field('Heure', `<input type="time" name="time" required step="300" value="${isoTime(st)}">`)}
        ${field('Durée (minutes)', `<input type="number" name="duration" min="5" max="480" step="5" required value="${dur}">`)}
      </div>
      ${field('Notes de séance', `<textarea name="notes" placeholder="Évolution, exercices, douleur (EVA)…">${esc(a.notes || '')}</textarea>`)}`,
    onSubmit: async (d) => {
      if (!d.patient_id && a.source !== 'online') { toast('Choisissez ou créez un patient', 'err'); return false; }
      const s = new Date(`${d.date}T${d.time}`), e = new Date(s.getTime() + (+d.duration) * 60000);
      const busy = await overlapCount(s.toISOString(), e.toISOString(), a.id);
      if (busy >= settings.slot_capacity && !['cancelled', 'no_show'].includes(d.status)
          && !(await confirmBox(`Ce créneau a déjà ${busy} rendez-vous (capacité ${settings.slot_capacity}). Enregistrer quand même ?`, 'Enregistrer'))) return false;
      const row = { patient_id: d.patient_id, service_id: d.service_id, starts_at: s.toISOString(), ends_at: e.toISOString(),
                    status: d.status, notes: d.notes };
      if (a.source === 'online' && !d.patient_id) delete row.patient_id;
      if (a.id) await q(sb.from('appointments').update(row).eq('id', a.id));
      else await q(sb.from('appointments').insert(row));
      if (a.source === 'online' && a.status === 'pending' && d.status === 'confirmed' && !d.patient_id) {
        await confirmAppointment({ ...a, ...row, patient_id: null });
      } else toast('Rendez-vous enregistré');
      onSaved?.();
    },
    onOpen: async (f, close) => {
      bindPatientPicker(f);
      f.service_id.addEventListener('change', () => {
        const o = f.service_id.selectedOptions[0];
        if (o?.dataset.dur) f.duration.value = o.dataset.dur;
      });
      const wa = f.querySelector('[data-wa]');
      if (wa) wa.href = await waReminderLink(a);
      f.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmBox('Supprimer définitivement ce rendez-vous ?', 'Supprimer'))) return;
        await q(sb.from('appointments').delete().eq('id', a.id));
        toast('Rendez-vous supprimé');
        close();
        onSaved?.();
      });
    }
  });
  return form;
}
