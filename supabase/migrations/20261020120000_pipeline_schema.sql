-- Beo OS sales pipeline — schema (additive, idempotent).
-- Run this file first. Do not run against production until Or approves.
-- Existing columns, statuses, and rows are left in place.
-- New lead statuses and deal stages are plain text (no enum swap) so old values keep working.

-- ── leads: intake, value, follow-up ──────────────────────────────────────────
alter table public.leads add column if not exists estimated_value numeric(14, 2);
alter table public.leads add column if not exists lost_reason text;
alter table public.leads add column if not exists lost_reason_note text;
alter table public.leads add column if not exists replied_at timestamptz;
alter table public.leads add column if not exists source_detail text;
alter table public.leads add column if not exists utm_source text;
alter table public.leads add column if not exists utm_medium text;
alter table public.leads add column if not exists utm_campaign text;
alter table public.leads add column if not exists utm_content text;
alter table public.leads add column if not exists utm_term text;
alter table public.leads add column if not exists landing_page text;
alter table public.leads add column if not exists first_message text;
alter table public.leads add column if not exists consent boolean;
alter table public.leads add column if not exists probability numeric(5, 2);
alter table public.leads add column if not exists next_action text;
alter table public.leads add column if not exists next_action_at timestamptz;
alter table public.leads add column if not exists last_contact_at timestamptz;
alter table public.leads add column if not exists meeting_at timestamptz;
alter table public.leads add column if not exists temperature text;
alter table public.leads add column if not exists domain text;

comment on column public.leads.estimated_value is '₪ before VAT. Open-pipeline amount when no live quote exists.';
comment on column public.leads.lost_reason is 'Preferred: price, timing, no_reply, chose_competitor, not_fit, other. Free text still accepted.';
comment on column public.leads.temperature is 'hot, warm, or cold. Null means unset.';
comment on column public.leads.consent is 'True only when the lead opted in. Null means unknown — not a recorded refusal.';
comment on column public.leads.source is 'Preferred: meta_ads, google_ads, organic_seo, whatsapp, cold_email, facebook_groups, referral, phone, manual, other. Existing free-text values stay valid.';

alter table public.leads drop constraint if exists leads_temperature_check;
alter table public.leads
  add constraint leads_temperature_check
  check (temperature is null or temperature in ('hot', 'warm', 'cold'));

alter table public.leads drop constraint if exists leads_probability_check;
alter table public.leads
  add constraint leads_probability_check
  check (probability is null or (probability >= 0 and probability <= 100));

create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_owner_idx on public.leads (owner_id);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_domain_idx on public.leads (lower(domain));
create index if not exists leads_next_action_idx on public.leads (next_action_at);

-- ── quotes ───────────────────────────────────────────────────────────────────
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text,
  slug text,
  url text,
  title text,
  lead_id uuid references public.leads (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  amount_pre_vat numeric(14, 2),
  vat_included boolean not null default false,
  period text not null default 'one_time',
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  decided_at timestamptz,
  status text not null default 'draft',
  notes text,
  source text default 'beo-offer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- slug is unique when present; several drafts may have no slug
create unique index if not exists quotes_slug_unique on public.quotes (slug) where slug is not null;
create index if not exists quotes_lead_idx on public.quotes (lead_id);
create index if not exists quotes_deal_idx on public.quotes (deal_id);
create index if not exists quotes_client_idx on public.quotes (client_id);
create index if not exists quotes_status_idx on public.quotes (status);

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes
  add constraint quotes_status_check
  check (status in ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired'));

alter table public.quotes drop constraint if exists quotes_period_check;
alter table public.quotes
  add constraint quotes_period_check
  check (period in ('one_time', 'monthly', 'yearly'));

comment on table public.quotes is 'One row per quote version. Several quotes may point at the same lead.';
comment on column public.quotes.amount_pre_vat is '₪ before VAT.';
comment on column public.quotes.number is 'BEO-YYYY-NNN when allocated by next_quote_number().';

-- ── deals: delivery stage and money dates ────────────────────────────────────
alter table public.deals add column if not exists stage text;
alter table public.deals add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.deals add column if not exists quote_id uuid references public.quotes (id) on delete set null;
alter table public.deals add column if not exists amount_total numeric(14, 2);
alter table public.deals add column if not exists deposit_amount numeric(14, 2);
alter table public.deals add column if not exists deposit_paid_at date;
alter table public.deals add column if not exists delivered_at timestamptz;
alter table public.deals add column if not exists paid_in_full_at date;
alter table public.deals add column if not exists updated_at timestamptz default now();

-- New inserts default to signed. Existing rows stay null until someone sets a stage
-- (the app treats null as signed for display, without rewriting history).
alter table public.deals alter column stage set default 'signed';

alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals
  add constraint deals_stage_check
  check (
    stage is null
    or stage in ('signed', 'deposit_paid', 'in_progress', 'delivered', 'paid_in_full', 'cancelled')
  );

create index if not exists deals_stage_idx on public.deals (stage);
create index if not exists deals_lead_idx on public.deals (lead_id);
create index if not exists deals_project_idx on public.deals (project_id);
create index if not exists deals_quote_idx on public.deals (quote_id);

comment on column public.deals.stage is 'Delivery stage. deals.status stays the commission status (active/completed/cancelled).';
comment on column public.deals.amount_total is '₪ agreed total. Kept in sync with agreed_amount when either is written.';

-- ── projects ↔ deal / lead ───────────────────────────────────────────────────
alter table public.projects add column if not exists deal_id uuid references public.deals (id) on delete set null;
alter table public.projects add column if not exists lead_id uuid references public.leads (id) on delete set null;
create index if not exists projects_deal_idx on public.projects (deal_id);
create index if not exists projects_lead_idx on public.projects (lead_id);

-- ── tasks can point at the lead they were opened for ────────────────────────
alter table public.tasks add column if not exists lead_id uuid references public.leads (id) on delete set null;
create index if not exists tasks_lead_idx on public.tasks (lead_id);

-- ── payments and retainers ───────────────────────────────────────────────────
create table if not exists public.deal_payments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  due_date date,
  amount numeric(14, 2) not null,
  kind text not null default 'installment',
  status text not null default 'scheduled',
  paid_at timestamptz,
  invoice_id uuid references public.invoices (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deal_payments drop constraint if exists deal_payments_kind_check;
alter table public.deal_payments
  add constraint deal_payments_kind_check
  check (kind in ('deposit', 'milestone', 'installment', 'retainer', 'hosting'));

alter table public.deal_payments drop constraint if exists deal_payments_status_check;
alter table public.deal_payments
  add constraint deal_payments_status_check
  check (status in ('scheduled', 'invoiced', 'paid', 'overdue'));

create index if not exists deal_payments_deal_idx on public.deal_payments (deal_id);
create index if not exists deal_payments_due_idx on public.deal_payments (due_date);
create index if not exists deal_payments_status_idx on public.deal_payments (status);

comment on table public.deal_payments is 'Installments, deposits, milestones. Recurring income lives in recurring_charges.';

create table if not exists public.recurring_charges (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  title text,
  amount numeric(14, 2) not null,
  interval text not null default 'monthly',
  start_date date not null,
  end_date date,
  next_due date,
  active boolean not null default true,
  kind text not null default 'retainer',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_charges drop constraint if exists recurring_charges_interval_check;
alter table public.recurring_charges
  add constraint recurring_charges_interval_check
  check (interval in ('monthly', 'yearly'));

alter table public.recurring_charges drop constraint if exists recurring_charges_kind_check;
alter table public.recurring_charges
  add constraint recurring_charges_kind_check
  check (kind in ('retainer', 'hosting'));

create index if not exists recurring_charges_deal_idx on public.recurring_charges (deal_id);
create index if not exists recurring_charges_next_due_idx on public.recurring_charges (next_due);
create index if not exists recurring_charges_active_idx on public.recurring_charges (active);

-- ── stage history ────────────────────────────────────────────────────────────
create table if not exists public.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  note text
);

create index if not exists lead_stage_history_lead_idx on public.lead_stage_history (lead_id, changed_at desc);

create table if not exists public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  note text
);

create index if not exists deal_stage_history_deal_idx on public.deal_stage_history (deal_id, changed_at desc);

-- ── quote numbers BEO-YYYY-NNN ───────────────────────────────────────────────
create table if not exists public.quote_number_counters (
  year integer primary key,
  last_n integer not null default 0
);

create or replace function public.next_quote_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y integer := extract(year from now())::integer;
  n integer;
begin
  insert into public.quote_number_counters as c (year, last_n)
  values (y, 1)
  on conflict (year) do update set last_n = c.last_n + 1
  returning last_n into n;
  return 'BEO-' || y::text || '-' || lpad(n::text, 3, '0');
end;
$$;

comment on function public.next_quote_number() is 'Allocates BEO-YYYY-NNN. Safe under concurrent inserts.';

revoke all on function public.next_quote_number() from public;
grant execute on function public.next_quote_number() to authenticated, service_role;
