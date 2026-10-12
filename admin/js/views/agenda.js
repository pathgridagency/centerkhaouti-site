import { sb, q, getSettings, toast } from '../lib.js';
import { APPT_SELECT, apptName, openAppointment } from './appt-common.js';

export default async function agenda(el) {
  const settings = await getSettings();
  el.innerHTML = `
    <div class="page-head"><h1>Agenda</h1>
      <button class="btn primary" data-new>+ Rendez-vous</button></div>
    <div class="legend">
      <span><i style="background:#fdf1d8;border:1px dashed #c98a12"></i>En attente</span>
      <span><i style="background:#0fa99b"></i>Confirmé</span>
      <span><i style="background:#2f9e5b"></i>Effectué</span>
      <span><i style="background:#d64545"></i>Absent</span>
      <span class="muted">Cliquez sur une plage vide pour ajouter · glissez un RDV pour le déplacer</span>
    </div>
    <div class="cal-wrap"><div data-cal></div></div>`;

  const hours = settings.opening_hours || {};
  const businessHours = Object.entries(hours).flatMap(([dow, ranges]) =>
    ranges.map(([startTime, endTime]) => ({ daysOfWeek: [+dow], startTime, endTime })));
  const allTimes = Object.values(hours).flat();
  const minT = allTimes.length ? allTimes.map(r => r[0]).sort()[0] : '08:00';
  const maxT = allTimes.length ? allTimes.map(r => r[1]).sort().at(-1) : '20:00';

  const cal = new FullCalendar.Calendar(el.querySelector('[data-cal]'), {
    locale: 'fr',
    initialView: window.innerWidth < 700 ? 'timeGridDay' : 'timeGridWeek',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek' },
    height: 'auto',
    slotMinTime: shift(minT, -60), slotMaxTime: shift(maxT, 60),
    slotDuration: `00:${String(Math.min(settings.slot_minutes, 30)).padStart(2, '0')}:00`,
    allDaySlot: false, nowIndicator: true, selectable: true, editable: true, businessHours,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit' },
    events: async (info, success, failure) => {
      try {
        const [rows, closures] = await Promise.all([
          q(sb.from('appointments').select(APPT_SELECT).neq('status', 'cancelled')
            .gte('starts_at', info.startStr).lt('starts_at', info.endStr)),
          q(sb.from('closures').select('*').gte('day', info.startStr.slice(0, 10)).lt('day', info.endStr.slice(0, 10)))
        ]);
        success([
          ...rows.map(a => ({
            id: a.id, title: apptName(a) + (a.service ? ' · ' + a.service.name : ''),
            start: a.starts_at, end: a.ends_at, classNames: ['ev-' + a.status], extendedProps: { a }
          })),
          ...closures.map(c => ({ start: c.day, allDay: true, display: 'background', color: '#f6d6cc',
                                   title: 'Fermé' + (c.reason ? ' — ' + c.reason : '') }))
        ]);
      } catch (e) { failure(e); }
    },
    select: info => { cal.unselect(); openAppointment({ start: info.start, end: info.end, onSaved: () => cal.refetchEvents() }); },
    eventClick: info => info.event.extendedProps.a &&
      openAppointment({ appt: info.event.extendedProps.a, onSaved: () => cal.refetchEvents() }),
    eventChange: async info => {
      const { error } = await sb.from('appointments')
        .update({ starts_at: info.event.start.toISOString(), ends_at: info.event.end.toISOString() })
        .eq('id', info.event.id);
      if (error) { info.revert(); toast(error.message, 'err'); }
      else toast(`${info.event.title} déplacé`);
    }
  });
  el.querySelector('[data-new]').onclick = () => openAppointment({ onSaved: () => cal.refetchEvents() });
  // le calendrier doit être dans le DOM pour se dimensionner
  requestAnimationFrame(() => cal.render());
}

function shift(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = Math.min(Math.max(h * 60 + m + mins, 0), 24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}:00`;
}
