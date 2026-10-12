/* Réservation en ligne — appelle les fonctions publiques Supabase (aucune table exposée) */
(() => {
  const root = document.getElementById('booking');
  if (!root) return;
  const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: KEY } = window.CK_CONFIG || {};
  const $ = s => root.querySelector(s);
  const form = $('form'), svcSel = $('[name=service]'), dateIn = $('[name=date]'),
        slotsBox = $('.bk-slots'), timeIn = $('[name=time]'), msg = $('.bk-msg'), btn = $('button[type=submit]');

  const say = (text, kind = '') => { msg.textContent = text; msg.className = 'bk-msg ' + kind; };

  if (!URL_ || !KEY) {
    form.querySelectorAll('input,select,textarea,button').forEach(el => el.disabled = true);
    say('La réservation en ligne sera bientôt disponible — appelez-nous au +212 537 61 47 65.', 'warn');
    return;
  }

  const rpc = async (fn, args = {}) => {
    const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || 'Erreur réseau');
    return data;
  };

  // Dates : aujourd'hui (heure du Maroc) → +60 jours
  const iso = d => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' });
  const today = new Date();
  dateIn.min = iso(today);
  dateIn.max = iso(new Date(today.getTime() + 60 * 864e5));

  rpc('get_public_services').then(list => {
    svcSel.insertAdjacentHTML('beforeend', list.map(s =>
      `<option value="${s.id}">${s.name.replace(/</g, '&lt;')}</option>`).join(''));
  }).catch(() => {});

  let reqId = 0;
  async function loadSlots() {
    timeIn.value = '';
    if (!dateIn.value) { slotsBox.innerHTML = '<span class="bk-hint">Choisissez une date pour voir les créneaux libres.</span>'; return; }
    const id = ++reqId;
    slotsBox.innerHTML = '<span class="bk-hint">Recherche des créneaux…</span>';
    try {
      const rows = await rpc('get_available_slots', { p_date: dateIn.value, p_service_id: svcSel.value || null });
      if (id !== reqId) return;
      slotsBox.innerHTML = rows.length
        ? rows.map(r => `<button type="button" class="bk-slot" data-t="${r.slot}">${r.slot}</button>`).join('')
        : '<span class="bk-hint">Aucun créneau libre ce jour-là (fermé ou complet). Essayez une autre date.</span>';
    } catch {
      if (id === reqId) slotsBox.innerHTML = '<span class="bk-hint">Impossible de charger les créneaux. Appelez-nous.</span>';
    }
  }
  dateIn.addEventListener('change', loadSlots);
  svcSel.addEventListener('change', () => dateIn.value && loadSlots());
  slotsBox.addEventListener('click', e => {
    const b = e.target.closest('.bk-slot'); if (!b) return;
    slotsBox.querySelectorAll('.bk-slot').forEach(x => x.classList.toggle('on', x === b));
    timeIn.value = b.dataset.t;
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.website.value) return; // piège à robots
    if (!timeIn.value) { say('Choisissez un créneau horaire.', 'err'); return; }
    const f = new FormData(form);
    btn.disabled = true; say('Envoi en cours…');
    try {
      await rpc('book_appointment', {
        p_name: f.get('nom'), p_phone: f.get('telephone'), p_email: f.get('email') || null,
        p_service_id: f.get('service') || null, p_date: f.get('date'), p_time: f.get('time'),
        p_message: f.get('message') || null
      });
      const when = new Date(`${f.get('date')}T12:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      say(`✓ Demande enregistrée pour le ${when} à ${f.get('time')}. Nous vous appelons pour confirmer.`, 'ok');
      form.reset(); slotsBox.innerHTML = '';
    } catch (err) {
      say('✗ ' + err.message, 'err');
      loadSlots();
    } finally { btn.disabled = false; }
  });
})();
