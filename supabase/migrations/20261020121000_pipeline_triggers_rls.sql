-- Beo OS sales pipeline — triggers, grants, RLS.
-- Run after 20261020120000_pipeline_schema.sql.
-- Idempotent. Does not rewrite existing lead or deal rows.

-- ── updated_at ───────────────────────────────────────────────────────────────
create or replace function public.beo_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'deal_payments', 'recurring_charges']
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = t || '_touch_updated_at'
        and tgrelid = format('public.%I', t)::regclass
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.beo_touch_updated_at()',
        t || '_touch_updated_at',
        t
      );
    end if;
  end loop;
end $$;

-- ── keep amount_total and agreed_amount together ────────────────────────────
create or replace function public.beo_sync_deal_amounts()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.amount_total is null then
      new.amount_total := new.agreed_amount;
    elsif new.agreed_amount is null then
      new.agreed_amount := new.amount_total;
    end if;
    return new;
  end if;

  if new.amount_total is distinct from old.amount_total and new.amount_total is not null
     and new.agreed_amount is not distinct from old.agreed_amount then
    new.agreed_amount := new.amount_total;
  elsif new.agreed_amount is distinct from old.agreed_amount and new.agreed_amount is not null
     and new.amount_total is not distinct from old.amount_total then
    new.amount_total := new.agreed_amount;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_sync_amounts on public.deals;
create trigger deals_sync_amounts
  before insert or update on public.deals
  for each row execute function public.beo_sync_deal_amounts();

-- ── lead stage side effects + history for interactive users ──────────────────
-- Service-role writes (the bot API) insert history themselves, with the actor id.
-- auth.uid() is null for service_role, so this trigger skips that case.
create or replace function public.beo_lead_stage_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'replied' and new.replied_at is null then
    new.replied_at := now();
  end if;

  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and auth.uid() is not null then
    insert into public.lead_stage_history (lead_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  elsif tg_op = 'INSERT' and auth.uid() is not null then
    insert into public.lead_stage_history (lead_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists leads_stage_side_effects on public.leads;
create trigger leads_stage_side_effects
  before insert or update of status, replied_at on public.leads
  for each row execute function public.beo_lead_stage_side_effects();

-- ── deal stage ↔ commission status, dates, history ───────────────────────────
create or replace function public.beo_deal_stage_side_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is not null and (tg_op = 'INSERT' or new.stage is distinct from old.stage) then
    if new.stage = 'paid_in_full' then
      new.status := 'completed';
      if new.paid_in_full_at is null then
        new.paid_in_full_at := current_date;
      end if;
    elsif new.stage = 'cancelled' then
      new.status := 'cancelled';
    elsif new.stage in ('signed', 'deposit_paid', 'in_progress', 'delivered') then
      new.status := 'active';
    end if;

    if new.stage = 'deposit_paid' and new.deposit_paid_at is null then
      new.deposit_paid_at := current_date;
    end if;
    if new.stage = 'delivered' and new.delivered_at is null then
      new.delivered_at := now();
    end if;

    if tg_op = 'UPDATE' and auth.uid() is not null and new.stage is distinct from old.stage then
      insert into public.deal_stage_history (deal_id, from_stage, to_stage, changed_by)
      values (new.id, old.stage, new.stage, auth.uid());
    elsif tg_op = 'INSERT' and auth.uid() is not null then
      insert into public.deal_stage_history (deal_id, from_stage, to_stage, changed_by)
      values (new.id, null, new.stage, auth.uid());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists deals_stage_side_effects on public.deals;
create trigger deals_stage_side_effects
  before insert or update of stage, status, deposit_paid_at, delivered_at, paid_in_full_at
  on public.deals
  for each row execute function public.beo_deal_stage_side_effects();

-- ── quotes past valid_until ──────────────────────────────────────────────────
create or replace function public.expire_stale_quotes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.quotes
  set status = 'expired'
  where status in ('draft', 'sent', 'viewed')
    and valid_until is not null
    and valid_until < current_date;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.expire_stale_quotes() from public;
grant execute on function public.expire_stale_quotes() to service_role;

-- ── grants ───────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.quotes to authenticated, service_role;
grant select, insert, update, delete on public.deal_payments to authenticated, service_role;
grant select, insert, update, delete on public.recurring_charges to authenticated, service_role;
grant select, insert, update, delete on public.lead_stage_history to authenticated, service_role;
grant select, insert, update, delete on public.deal_stage_history to authenticated, service_role;
grant select, insert, update on public.quote_number_counters to service_role;

-- ── RLS: copy whatever staff policies already exist on leads/deals ───────────
-- If those tables have no policies, fall back to "any signed-in profile".
create or replace function public.beo_clone_table_policies(source_table regclass, target_table regclass)
returns integer
language plpgsql
as $$
declare
  r record;
  copied integer := 0;
  cmd text;
  roles text;
  using_sql text;
  check_sql text;
  stmt text;
begin
  execute format('alter table %s enable row level security', target_table);

  for r in
    select
      pol.polname,
      pol.polcmd,
      pol.polpermissive,
      pg_get_expr(pol.polqual, pol.polrelid) as using_sql,
      pg_get_expr(pol.polwithcheck, pol.polrelid) as check_sql,
      pol.polroles
    from pg_policy pol
    where pol.polrelid = source_table
  loop
    if exists (
      select 1 from pg_policy
      where polrelid = target_table and polname = r.polname
    ) then
      continue;
    end if;

    cmd := case r.polcmd
      when 'r' then 'select'
      when 'a' then 'insert'
      when 'w' then 'update'
      when 'd' then 'delete'
      else 'all'
    end;

    select coalesce(string_agg(quote_ident(rolname), ', '), 'public')
      into roles
    from pg_roles
    where oid = any (r.polroles);

    if r.polroles = '{0}'::oid[] then
      roles := 'public';
    end if;

    using_sql := r.using_sql;
    check_sql := r.check_sql;

    stmt := format(
      'create policy %I on %s as %s for %s to %s',
      r.polname,
      target_table,
      case when r.polpermissive then 'permissive' else 'restrictive' end,
      cmd,
      roles
    );
    if using_sql is not null then
      stmt := stmt || format(' using (%s)', using_sql);
    end if;
    if check_sql is not null then
      stmt := stmt || format(' with check (%s)', check_sql);
    end if;
    execute stmt;
    copied := copied + 1;
  end loop;

  return copied;
end;
$$;

do $$
declare
  target regclass;
  copied integer := 0;
  source regclass;
  relname text;
begin
  foreach target in array array[
    'public.quotes'::regclass,
    'public.deal_payments'::regclass,
    'public.recurring_charges'::regclass,
    'public.lead_stage_history'::regclass,
    'public.deal_stage_history'::regclass
  ]
  loop
    relname := target::text;
    source := case
      when relname in ('quotes', 'public.quotes', 'lead_stage_history', 'public.lead_stage_history')
        then 'public.leads'::regclass
      else 'public.deals'::regclass
    end;

    begin
      copied := public.beo_clone_table_policies(source, target);
    exception
      when others then
        -- Source policies can mention columns the new table does not have.
        copied := 0;
        raise notice 'beo pipeline: could not clone policies onto % (%)', relname, sqlerrm;
    end;

    if not exists (select 1 from pg_policy where polrelid = target) then
      execute format('alter table %s enable row level security', target);
      execute format(
        'create policy %I on %s for all to authenticated using (
           exists (select 1 from public.profiles p where p.id = auth.uid())
         ) with check (
           exists (select 1 from public.profiles p where p.id = auth.uid())
         )',
        'staff_all',
        target
      );
    end if;
  end loop;
end $$;

-- Realtime for the pipeline screen. Missing publication is ignored.
do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'deal_payments', 'recurring_charges', 'deals', 'leads']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
