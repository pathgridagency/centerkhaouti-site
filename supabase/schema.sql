-- ══════════════════════════════════════════════════════════════════
--  Centre Khaouti — schéma Supabase
--  À exécuter une seule fois dans Supabase → SQL Editor → Run.
--  Fuseau horaire du centre : Africa/Casablanca
-- ══════════════════════════════════════════════════════════════════

-- ── Personnel autorisé à utiliser l'espace admin ──────────────────
create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.staff where user_id = auth.uid()) $$;

-- ── Téléphone normalisé (06… → 2126…) pour retrouver un patient ───
create or replace function public.normalize_phone(p text) returns text
language plpgsql immutable
as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  if d like '00%' then d := substr(d, 3); end if;
  if d like '0%' and length(d) = 10 then d := '212' || substr(d, 2); end if;
  return nullif(d, '');
end $$;

-- ── Paramètres du centre (une seule ligne) ────────────────────────
create table if not exists public.settings (
  id                 int primary key default 1 check (id = 1),
  clinic_name        text not null default 'Centre Khaouti',
  clinic_subtitle    text not null default 'Kinésithérapie & Physiothérapie',
  address            text not null default '665 Guich Oudayas, Temara (Rez de chaussée) — Près de BMCI',
  phone              text default '+212 537 61 47 65',
  email              text default 'centrekhaouti@gmail.com',
  issuer_name        text not null default 'KHADIJA KHAOUTI',
  ice                text default '004024721000081',
  if_number          text default '73310665',
  rc                 text,
  patente            text default '70100916',   -- ITP (taxe professionnelle)
  inpe               text default '045085883',
  tva_rate           numeric(5,2) not null default 0,
  devis_validity_days int not null default 30,
  devis_footer       text default 'Merci de votre confiance.',
  slot_minutes       int not null default 30 check (slot_minutes between 10 and 240),
  slot_capacity      int not null default 1 check (slot_capacity between 1 and 20),
  min_notice_hours   int not null default 2 check (min_notice_hours >= 0),
  max_days_ahead     int not null default 60 check (max_days_ahead between 1 and 365),
  -- jour (0 = dimanche … 6 = samedi) → liste de plages [début, fin]
  opening_hours      jsonb not null default '{
    "0": [],
    "1": [["08:00","19:00"]],
    "2": [["08:00","19:00"]],
    "3": [["08:00","19:00"]],
    "4": [["08:00","19:00"]],
    "5": [["08:00","18:00"]],
    "6": [["09:00","13:00"]]
  }'::jsonb,
  updated_at         timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ── Prestations ───────────────────────────────────────────────────
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  duration_min int not null default 30 check (duration_min between 5 and 480),
  price        numeric(10,2) not null default 0 check (price >= 0),
  online       boolean not null default true,   -- réservable depuis le site
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);

insert into public.services (name, sort)
select v.name, v.sort from (values
  ('Traumatologie & Rhumatologie', 1), ('Neurologie', 2), ('Traitement du mal du dos', 3),
  ('Kinésithérapie respiratoire', 4), ('Gymnastique médicale', 5), ('Drainage lymphatique', 6),
  ('Acupuncture', 7), ('Ventouses — Hijama', 8), ('Psychomotricité & Orthophonie', 9),
  ('Rééducation périnéale', 10), ('Kinésithérapie pédiatrique', 11), ('Rééducation post-opératoire', 12)
) as v(name, sort)
where not exists (select 1 from public.services);

-- ── Patients ──────────────────────────────────────────────────────
create table if not exists public.patients (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  phone            text,
  email            text,
  birth_date       date,
  gender           text check (gender in ('F', 'M')),
  cin              text,
  address          text,
  insurance        text,          -- CNSS, CNOPS, AMO, mutuelle privée…
  insurance_number text,
  referring_doctor text,
  diagnosis        text,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists patients_name_idx  on public.patients (lower(full_name));
create index if not exists patients_phone_idx on public.patients (public.normalize_phone(phone));

-- ── Rendez-vous ───────────────────────────────────────────────────
create table if not exists public.appointments (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid references public.patients(id) on delete set null,
  service_id  uuid references public.services(id) on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'confirmed'
              check (status in ('pending', 'confirmed', 'done', 'cancelled', 'no_show')),
  source      text not null default 'admin' check (source in ('admin', 'online')),
  req_name    text,               -- coordonnées saisies par le visiteur (réservation en ligne)
  req_phone   text,
  req_email   text,
  req_message text,
  notes       text,               -- notes de séance
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists appointments_starts_idx  on public.appointments (starts_at);
create index if not exists appointments_patient_idx on public.appointments (patient_id);

-- ── Jours de fermeture (congés, jours fériés) ─────────────────────
create table if not exists public.closures (
  day    date primary key,
  reason text
);

-- ── Devis ─────────────────────────────────────────────────────────
create table if not exists public.counters (
  key   text primary key,
  value int  not null
);

create or replace function public.next_devis_number() returns text
language plpgsql security definer set search_path = public
as $$
declare
  y text := to_char(now() at time zone 'Africa/Casablanca', 'YYYY');
  n int;
begin
  if not public.is_staff() then raise exception 'Accès refusé'; end if;
  insert into public.counters (key, value) values ('devis-' || y, 1)
  on conflict (key) do update set value = public.counters.value + 1
  returning value into n;
  return 'DEV-' || y || '-' || lpad(n::text, 4, '0');
end $$;

create table if not exists public.devis (
  id          uuid primary key default gen_random_uuid(),
  number      text not null unique default public.next_devis_number(),
  patient_id  uuid not null references public.patients(id) on delete restrict,
  issue_date  date not null default (now() at time zone 'Africa/Casablanca')::date,
  valid_until date,
  status      text not null default 'draft'
              check (status in ('draft', 'sent', 'accepted', 'cancelled')),
  discount    numeric(10,2) not null default 0 check (discount >= 0),
  tva_rate    numeric(5,2)  not null default 0 check (tva_rate >= 0),
  notes       text,
  issued_by   text not null default 'KHADIJA KHAOUTI',
  created_at  timestamptz not null default now()
);
create index if not exists devis_patient_idx on public.devis (patient_id);

create table if not exists public.devis_items (
  id          uuid primary key default gen_random_uuid(),
  devis_id    uuid not null references public.devis(id) on delete cascade,
  position    int  not null default 0,
  service_id  uuid references public.services(id) on delete set null,
  description text not null,
  quantity    numeric(10,2) not null default 1 check (quantity > 0),
  unit_price  numeric(10,2) not null default 0 check (unit_price >= 0)
);
create index if not exists devis_items_devis_idx on public.devis_items (devis_id);

-- ── Encaissements ─────────────────────────────────────────────────
create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete set null,
  devis_id   uuid references public.devis(id) on delete set null,
  amount     numeric(10,2) not null check (amount > 0),
  method     text not null default 'cash'
             check (method in ('cash', 'card', 'cheque', 'transfer', 'insurance')),
  paid_on    date not null default (now() at time zone 'Africa/Casablanca')::date,
  reference  text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists payments_paid_on_idx on public.payments (paid_on);
create index if not exists payments_devis_idx   on public.payments (devis_id);

-- ── Charges (factures d'électricité, eau, loyer…) ─────────────────
create table if not exists public.expenses (
  id         uuid primary key default gen_random_uuid(),
  category   text not null default 'autre'
             check (category in ('electricite', 'eau', 'internet', 'telephone', 'loyer', 'salaires',
                                 'fournitures', 'materiel', 'entretien', 'impots', 'autre')),
  label      text,
  supplier   text,
  amount     numeric(10,2) not null check (amount >= 0),
  period     date,               -- mois concerné (1er du mois)
  due_date   date,
  paid_on    date,               -- vide = non payée
  reference  text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists expenses_due_idx on public.expenses (due_date);

-- ── Vue : devis avec totaux et montant encaissé ───────────────────
create or replace view public.devis_summary with (security_invoker = true) as
select d.*,
       p.full_name                                                         as patient_name,
       coalesce(i.subtotal, 0)                                             as subtotal,
       round(greatest(coalesce(i.subtotal, 0) - d.discount, 0) * (1 + d.tva_rate / 100), 2) as total,
       coalesce(pay.paid, 0)                                               as paid
from public.devis d
left join public.patients p on p.id = d.patient_id
left join lateral (select sum(quantity * unit_price) as subtotal
                   from public.devis_items where devis_id = d.id) i on true
left join lateral (select sum(amount) as paid
                   from public.payments where devis_id = d.id) pay on true;

-- ══════════════════════════════════════════════════════════════════
--  Sécurité : tout est réservé au personnel (RLS)
-- ══════════════════════════════════════════════════════════════════
do $$
declare t text;
begin
  foreach t in array array['staff','settings','services','patients','appointments','closures',
                           'counters','devis','devis_items','payments','expenses']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format('create policy staff_all on public.%I for all to authenticated
                    using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

-- ══════════════════════════════════════════════════════════════════
--  Fonctions publiques (site web) — aucun accès direct aux tables
-- ══════════════════════════════════════════════════════════════════

-- Prestations réservables en ligne
create or replace function public.get_public_services()
returns table (id uuid, name text, duration_min int)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.duration_min from public.services s
  where s.active and s.online order by s.sort, s.name
$$;

-- Créneaux libres pour une date ("HH:MI", heure du Maroc)
create or replace function public.get_available_slots(p_date date, p_service_id uuid default null)
returns table (slot text)
language plpgsql stable security definer set search_path = public
as $$
declare
  s        public.settings;
  dur      int;
  today    date := (now() at time zone 'Africa/Casablanca')::date;
  r        jsonb;
  t        timestamp;
  t_end    timestamp;
  s_start  timestamptz;
  s_end    timestamptz;
  taken    int;
begin
  select * into s from public.settings where id = 1;
  if p_date is null or p_date < today or p_date > today + s.max_days_ahead then return; end if;
  if exists (select 1 from public.closures where day = p_date) then return; end if;

  select sv.duration_min into dur from public.services sv
  where sv.id = p_service_id and sv.active and sv.online;
  dur := coalesce(dur, s.slot_minutes);

  for r in select * from jsonb_array_elements(coalesce(s.opening_hours -> extract(dow from p_date)::int::text, '[]'))
  loop
    t     := p_date + (r ->> 0)::time;
    t_end := p_date + (r ->> 1)::time;
    while t + make_interval(mins => dur) <= t_end loop
      s_start := t at time zone 'Africa/Casablanca';
      s_end   := s_start + make_interval(mins => dur);
      if s_start >= now() + make_interval(hours => s.min_notice_hours) then
        select count(*) into taken from public.appointments a
        where a.status in ('pending', 'confirmed', 'done')
          and a.starts_at < s_end and a.ends_at > s_start;
        if taken < s.slot_capacity then
          slot := to_char(t, 'HH24:MI');
          return next;
        end if;
      end if;
      t := t + make_interval(mins => s.slot_minutes);
    end loop;
  end loop;
end $$;

-- Demande de rendez-vous depuis le site (statut « en attente »)
create or replace function public.book_appointment(
  p_name text, p_phone text, p_email text, p_service_id uuid,
  p_date date, p_time text, p_message text default null
) returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  s       public.settings;
  dur     int;
  phone_n text := public.normalize_phone(p_phone);
  pid     uuid;
  st      timestamptz;
begin
  p_name := btrim(coalesce(p_name, ''));
  p_email := nullif(btrim(coalesce(p_email, '')), '');
  p_message := nullif(btrim(coalesce(p_message, '')), '');

  if length(p_name) < 2 or length(p_name) > 120 then raise exception 'Nom invalide'; end if;
  if phone_n is null or length(phone_n) < 8 or length(phone_n) > 15 then raise exception 'Numéro de téléphone invalide'; end if;
  if p_email is not null and (length(p_email) > 200 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Adresse email invalide'; end if;
  if length(coalesce(p_message, '')) > 1000 then raise exception 'Message trop long'; end if;

  -- une réservation à la fois (évite les doubles réservations simultanées)
  perform pg_advisory_xact_lock(hashtext('ck_booking'));

  if (select count(*) from public.appointments
      where source = 'online' and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de demandes, merci de nous appeler';
  end if;
  if (select count(*) from public.appointments
      where public.normalize_phone(req_phone) = phone_n and status = 'pending' and starts_at > now()) >= 3 then
    raise exception 'Vous avez déjà des demandes en attente. Nous vous recontactons très vite.';
  end if;
  if not exists (select 1 from public.get_available_slots(p_date, p_service_id) g where g.slot = p_time) then
    raise exception 'Ce créneau n''est plus disponible';
  end if;

  select * into s from public.settings where id = 1;
  select sv.duration_min into dur from public.services sv where sv.id = p_service_id and sv.active and sv.online;
  if not found then p_service_id := null; end if;
  dur := coalesce(dur, s.slot_minutes);
  st := (p_date + p_time::time) at time zone 'Africa/Casablanca';

  select id into pid from public.patients where public.normalize_phone(phone) = phone_n
  order by created_at limit 1;

  insert into public.appointments (patient_id, service_id, starts_at, ends_at, status, source,
                                   req_name, req_phone, req_email, req_message)
  values (pid, p_service_id, st, st + make_interval(mins => dur), 'pending', 'online',
          p_name, p_phone, p_email, p_message);

  return jsonb_build_object('ok', true, 'date', p_date, 'time', p_time);
end $$;

-- Droits d'exécution
revoke all on function public.is_staff()                        from public, anon, authenticated;
revoke all on function public.next_devis_number()               from public, anon, authenticated;
revoke all on function public.get_public_services()             from public, anon, authenticated;
revoke all on function public.get_available_slots(date, uuid)   from public, anon, authenticated;
revoke all on function public.book_appointment(text, text, text, uuid, date, text, text) from public, anon, authenticated;
grant execute on function public.is_staff()                      to authenticated;
grant execute on function public.next_devis_number()             to authenticated;
grant execute on function public.get_public_services()           to anon, authenticated;
grant execute on function public.get_available_slots(date, uuid) to anon, authenticated;
grant execute on function public.book_appointment(text, text, text, uuid, date, text, text) to anon, authenticated;
