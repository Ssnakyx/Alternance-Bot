-- À exécuter une fois dans Supabase : SQL Editor > New query > coller > Run.

create table if not exists profile (
  id smallint primary key default 1 check (id = 1), -- une seule ligne : c'est ton profil
  full_name text not null default '',
  email text not null default '',
  phone text not null default '',
  signature text not null default '',
  cv_filename text,
  cv_pdf_base64 text,
  cv_summary jsonb,
  search jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists offers (
  id text primary key, -- "<source>:<id dans la source>"
  source text not null,
  kind text not null default 'offer' check (kind in ('offer', 'spontaneous')),
  title text not null,
  company text not null default '',
  location text not null default '',
  remote boolean not null default false,
  description text not null default '',
  url text,
  apply_email text,
  apply_email_source text,      -- page où l'IA a trouvé l'email de recrutement
  email_searched_at timestamptz, -- dernière recherche d'email par l'IA
  published_at timestamptz,
  score smallint,
  strengths jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  scored_at timestamptz,
  status text not null default 'new' check (status in
    ('new', 'draft', 'sent', 'followed_up', 'interview', 'accepted', 'rejected', 'ignored')),
  letter_subject text, -- email d'accompagnement : objet
  letter text,         -- email d'accompagnement : message
  cover_letter_title text, -- lettre de motivation (jointe en PDF)
  cover_letter text,
  short_message text,  -- pour les formulaires en ligne ou LinkedIn
  tailored_cv jsonb,   -- CV adapté à l'offre par l'IA
  sent_at timestamptz,
  followed_up_at timestamptz,
  responded_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Pour une base créée avant l'ajout du dossier de candidature.
alter table offers add column if not exists cover_letter_title text;
alter table offers add column if not exists cover_letter text;
alter table offers add column if not exists short_message text;
alter table offers add column if not exists tailored_cv jsonb;
alter table offers add column if not exists apply_email_source text;
alter table offers add column if not exists email_searched_at timestamptz;

create index if not exists offers_status_score_idx on offers (status, score desc);

-- Historique de chaque candidature (changements de statut, emails envoyés et reçus).
create table if not exists offer_events (
  id bigint generated always as identity primary key,
  offer_id text not null references offers (id) on delete cascade,
  type text not null check (type in
    ('status', 'letter_generated', 'email_sent', 'followup_sent', 'email_received')),
  status text,
  summary text not null default '',
  email_message_id text unique, -- évite de traiter deux fois la même réponse reçue
  created_at timestamptz not null default now()
);

create index if not exists offer_events_offer_idx on offer_events (offer_id, created_at desc);
create index if not exists offer_events_created_idx on offer_events (created_at desc);

-- Aucune règle d'accès public : seule l'appli (clé service_role, côté serveur) lit et écrit.
alter table profile enable row level security;
alter table offers enable row level security;
alter table offer_events enable row level security;
