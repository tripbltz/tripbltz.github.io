-- The War for Christopia / migration 001.
-- Run in the Supabase SQL editor as postgres. Names are isolated with christopia_.
-- Authenticated clients may read only campaigns they belong to. All writes pass
-- through the authenticated campaign-command Edge Function and atomic RPC below.
begin;
create table public.christopia_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now()
);
create table public.christopia_campaigns (
  id uuid primary key,
  name text not null check (length(name) between 1 and 160),
  turn integer not null default 1 check (turn > 0),
  status text not null default 'active' check (status in ('active','completed','archived')),
  started_at timestamptz not null default now(),
  winner_id uuid,
  ended_at timestamptz,
  revision integer not null default 0 check (revision >= 0),
  created_by uuid not null references public.christopia_profiles(id),
  updated_at timestamptz not null default now()
);

create table public.christopia_campaign_players (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  name text not null default '',
  color text not null default '#76b3cf',
  role text not null default 'player',
  profile_id uuid,
  resources integer not null default 0,
  unique (campaign_id, id),
  unique (campaign_id, profile_id),
  foreign key (profile_id) references public.christopia_profiles(id),
  check (role in ('admin','player')),
  check (resources >= 0),
  check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public.christopia_factions (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  name text not null default '',
  player_id uuid,
  color text not null default '#76b3cf',
  description text not null default '',
  image_url text not null default '',
  unique (campaign_id, id),
  foreign key (campaign_id, player_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred
);

create table public.christopia_territories (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  scenario_id uuid,
  name text not null default '',
  description text not null default '',
  x numeric not null default 50,
  y numeric not null default 50,
  type text not null default 'Wasteland',
  strategic_value integer not null default 1,
  owner_id uuid,
  previous_owner_id uuid,
  contested boolean not null default false,
  bonus_key text not null default 'none',
  capture_count integer not null default 0,
  fortified boolean not null default false,
  headquarters_for uuid,
  image_url text not null default '',
  unique (campaign_id, id),
  foreign key (campaign_id, owner_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, previous_owner_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, headquarters_for) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  check (x between 0 and 100),
  check (y between 0 and 100),
  check (strategic_value between 1 and 10),
  check (capture_count >= 0),
  check (bonus_key in ('none','resource','spaceport','defence','domination'))
);

create table public.christopia_territory_connections (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  territory_a uuid,
  territory_b uuid,
  primary key (campaign_id, territory_a, territory_b),
  foreign key (campaign_id, territory_a) references public.christopia_territories(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, territory_b) references public.christopia_territories(campaign_id, id) deferrable initially deferred,
  check (territory_a <> territory_b)
);

create table public.christopia_battles (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  territory_id uuid,
  attacker_id uuid,
  defender_id uuid,
  attacker_faction_id uuid,
  defender_faction_id uuid,
  name text not null default '',
  mission text not null default '',
  deployment text not null default '',
  modifier text not null default '',
  notes text not null default '',
  attacker_objective text not null default '',
  defender_objective text not null default '',
  custom_objective text not null default '',
  campaign_objective text not null default '',
  mvp text not null default '',
  moment text not null default '',
  casualties text not null default '',
  points integer not null default 1000,
  asset_side text check (asset_side in ('attacker','defender')),
  attacker_points integer not null default 1000,
  defender_points integer not null default 1000,
  date date,
  status text not null default 'planned',
  turn integer not null default 1,
  is_final_assault boolean not null default false,
  winner_id uuid,
  result text,
  attacker_score integer,
  defender_score integer,
  rounds integer,
  units_destroyed integer not null default 0,
  resources_earned integer not null default 0,
  completed_at timestamptz,
  unique (campaign_id, id),
  foreign key (campaign_id, territory_id) references public.christopia_territories(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, attacker_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, defender_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, winner_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, attacker_faction_id) references public.christopia_factions(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, defender_faction_id) references public.christopia_factions(campaign_id, id) deferrable initially deferred,
  check (status in ('planned','active','completed')),
  check (result is null or result in ('attacker','defender','draw')),
  check (points > 0),
  check (turn > 0),
  check (attacker_id <> defender_id),
  check ((status = 'completed') = (result is not null)),
  check (attacker_score is null or attacker_score >= 0),
  check (defender_score is null or defender_score >= 0)
);

create table public.christopia_battle_photos (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  battle_id uuid,
  storage_path text not null default '',
  caption text not null default '',
  created_at timestamptz not null default now(),
  unique (campaign_id, id),
  unique (storage_path),
  foreign key (campaign_id, battle_id) references public.christopia_battles(campaign_id, id) deferrable initially deferred
);

create table public.christopia_chronicle_entries (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  battle_id uuid,
  title text not null default '',
  narrative text not null default '',
  date timestamptz not null default now(),
  unique (campaign_id, id),
  foreign key (campaign_id, battle_id) references public.christopia_battles(campaign_id, id) deferrable initially deferred
);

create table public.christopia_territory_history (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  territory_id uuid,
  battle_id uuid,
  from_owner_id uuid,
  to_owner_id uuid,
  title text not null default '',
  description text not null default '',
  date timestamptz not null default now(),
  unique (campaign_id, id),
  foreign key (campaign_id, territory_id) references public.christopia_territories(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, battle_id) references public.christopia_battles(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, from_owner_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, to_owner_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred
);

create table public.christopia_units (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  name text not null default '',
  nickname text not null default '',
  faction_id uuid,
  battles integer not null default 0,
  victories integer not null default 0,
  kills integer not null default 0,
  times_destroyed integer not null default 0,
  honours text not null default '',
  notes text not null default '',
  unique (campaign_id, id),
  foreign key (campaign_id, faction_id) references public.christopia_factions(campaign_id, id) deferrable initially deferred,
  check (battles >= 0),
  check (victories >= 0),
  check (kills >= 0),
  check (times_destroyed >= 0)
);

create table public.christopia_campaign_events (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  title text not null default '',
  description text not null default '',
  effect text not null default '',
  duration integer not null default 1,
  remaining_turns integer not null default 0,
  active boolean not null default false,
  unique (campaign_id, id),
  check (duration > 0),
  check (remaining_turns >= 0)
);

create table public.christopia_scenarios (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  title text not null default '',
  mission text not null default '',
  deployment text not null default '',
  condition text not null default '',
  narrative text not null default '',
  attacker_objective text not null default '',
  defender_objective text not null default '',
  unique (campaign_id, id)
);

create table public.christopia_campaign_actions (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  key text not null default '',
  name text not null default '',
  description text not null default '',
  cost integer not null default 1,
  unique (campaign_id, id),
  check (cost >= 0),
  check (key in ('recon','fortify','redeploy','counter'))
);

create table public.christopia_campaign_resource_transactions (
  campaign_id uuid not null references public.christopia_campaigns(id) on delete cascade,
  id uuid primary key,
  player_id uuid,
  amount integer not null default 0,
  reason text not null default '',
  date timestamptz not null default now(),
  action_key text,
  turn integer,
  territory_id uuid,
  consumed boolean not null default false,
  scenario_options jsonb not null default '[]'::jsonb,
  unique (campaign_id, id),
  foreign key (campaign_id, player_id) references public.christopia_campaign_players(campaign_id, id) deferrable initially deferred,
  foreign key (campaign_id, territory_id) references public.christopia_territories(campaign_id, id) deferrable initially deferred
);

create table public.christopia_campaign_settings (
  campaign_id uuid primary key references public.christopia_campaigns(id) on delete cascade,
  attacks_per_turn integer not null default 2,
  resources_enabled boolean not null default true,
  random_events_enabled boolean not null default true,
  unit_tracking_enabled boolean not null default true,
  gameplay_modifiers_enabled boolean not null default false,
  domination_threshold numeric not null default 70,
  final_assault_enabled boolean not null default true,
  final_assault_penalty integer not null default 3,
  check (attacks_per_turn between 1 and 20),
  check (domination_threshold between 1 and 100),
  check (final_assault_penalty between 0 and 100)
);

alter table public.christopia_territories add constraint christopia_territory_scenario_fk foreign key (campaign_id,scenario_id) references public.christopia_scenarios(campaign_id,id) deferrable initially deferred;

alter table public.christopia_campaigns add constraint christopia_winner_campaign_fk foreign key (id, winner_id) references public.christopia_campaign_players(campaign_id,id) deferrable initially deferred;

create index on public.christopia_campaign_players(campaign_id);
create index on public.christopia_factions(campaign_id);
create index on public.christopia_territories(campaign_id);
create index on public.christopia_battles(campaign_id);
create index on public.christopia_battle_photos(campaign_id);
create index on public.christopia_chronicle_entries(campaign_id);
create index on public.christopia_territory_history(campaign_id);
create index on public.christopia_units(campaign_id);
create index on public.christopia_campaign_events(campaign_id);
create index on public.christopia_scenarios(campaign_id);
create index on public.christopia_campaign_actions(campaign_id);
create index on public.christopia_campaign_resource_transactions(campaign_id);
create index on public.christopia_campaign_players(profile_id);
create index on public.christopia_battles(campaign_id,status,date);
create index on public.christopia_battle_photos(battle_id);
create index on public.christopia_territory_history(territory_id);
create index on public.christopia_chronicle_entries(campaign_id,date);

create or replace function public.christopia_is_member(p_campaign uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.christopia_campaign_players where campaign_id = p_campaign and profile_id = (select auth.uid()));
$$;
revoke all on function public.christopia_is_member(uuid) from public, anon;
grant execute on function public.christopia_is_member(uuid) to authenticated;

alter table public.christopia_profiles enable row level security;
create policy christopia_profile_self on public.christopia_profiles for select to authenticated using (id = (select auth.uid()));
alter table public.christopia_campaigns enable row level security;
create policy christopia_campaign_members on public.christopia_campaigns for select to authenticated using (public.christopia_is_member(id));

alter table public.christopia_campaign_players enable row level security;
create policy christopia_member_read on public.christopia_campaign_players for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_factions enable row level security;
create policy christopia_member_read on public.christopia_factions for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_territories enable row level security;
create policy christopia_member_read on public.christopia_territories for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_territory_connections enable row level security;
create policy christopia_member_read on public.christopia_territory_connections for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_battles enable row level security;
create policy christopia_member_read on public.christopia_battles for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_battle_photos enable row level security;
create policy christopia_member_read on public.christopia_battle_photos for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_chronicle_entries enable row level security;
create policy christopia_member_read on public.christopia_chronicle_entries for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_territory_history enable row level security;
create policy christopia_member_read on public.christopia_territory_history for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_units enable row level security;
create policy christopia_member_read on public.christopia_units for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_campaign_events enable row level security;
create policy christopia_member_read on public.christopia_campaign_events for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_scenarios enable row level security;
create policy christopia_member_read on public.christopia_scenarios for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_campaign_actions enable row level security;
create policy christopia_member_read on public.christopia_campaign_actions for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_campaign_resource_transactions enable row level security;
create policy christopia_member_read on public.christopia_campaign_resource_transactions for select to authenticated using (public.christopia_is_member(campaign_id));
alter table public.christopia_campaign_settings enable row level security;
create policy christopia_member_read on public.christopia_campaign_settings for select to authenticated using (public.christopia_is_member(campaign_id));
revoke all on public.christopia_profiles from anon, authenticated;
grant select on public.christopia_profiles to authenticated;
grant all on public.christopia_profiles to service_role;
revoke all on public.christopia_campaigns from anon, authenticated;
grant select on public.christopia_campaigns to authenticated;
grant all on public.christopia_campaigns to service_role;
revoke all on public.christopia_campaign_players from anon, authenticated;
grant select on public.christopia_campaign_players to authenticated;
grant all on public.christopia_campaign_players to service_role;
revoke all on public.christopia_factions from anon, authenticated;
grant select on public.christopia_factions to authenticated;
grant all on public.christopia_factions to service_role;
revoke all on public.christopia_territories from anon, authenticated;
grant select on public.christopia_territories to authenticated;
grant all on public.christopia_territories to service_role;
revoke all on public.christopia_territory_connections from anon, authenticated;
grant select on public.christopia_territory_connections to authenticated;
grant all on public.christopia_territory_connections to service_role;
revoke all on public.christopia_battles from anon, authenticated;
grant select on public.christopia_battles to authenticated;
grant all on public.christopia_battles to service_role;
revoke all on public.christopia_battle_photos from anon, authenticated;
grant select on public.christopia_battle_photos to authenticated;
grant all on public.christopia_battle_photos to service_role;
revoke all on public.christopia_chronicle_entries from anon, authenticated;
grant select on public.christopia_chronicle_entries to authenticated;
grant all on public.christopia_chronicle_entries to service_role;
revoke all on public.christopia_territory_history from anon, authenticated;
grant select on public.christopia_territory_history to authenticated;
grant all on public.christopia_territory_history to service_role;
revoke all on public.christopia_units from anon, authenticated;
grant select on public.christopia_units to authenticated;
grant all on public.christopia_units to service_role;
revoke all on public.christopia_campaign_events from anon, authenticated;
grant select on public.christopia_campaign_events to authenticated;
grant all on public.christopia_campaign_events to service_role;
revoke all on public.christopia_scenarios from anon, authenticated;
grant select on public.christopia_scenarios to authenticated;
grant all on public.christopia_scenarios to service_role;
revoke all on public.christopia_campaign_actions from anon, authenticated;
grant select on public.christopia_campaign_actions to authenticated;
grant all on public.christopia_campaign_actions to service_role;
revoke all on public.christopia_campaign_resource_transactions from anon, authenticated;
grant select on public.christopia_campaign_resource_transactions to authenticated;
grant all on public.christopia_campaign_resource_transactions to service_role;
revoke all on public.christopia_campaign_settings from anon, authenticated;
grant select on public.christopia_campaign_settings to authenticated;
grant all on public.christopia_campaign_settings to service_role;

-- Profiles are kept private; email matching for adding an existing account happens
-- only inside the admin-authorized Edge Function.
create or replace function public.christopia_sync_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.christopia_profiles(id,email,display_name)
  values (new.id,lower(new.email),coalesce(new.raw_user_meta_data->>'name',''))
  on conflict (id) do update set email=excluded.email;
  return new;
end; $$;
revoke all on function public.christopia_sync_profile() from public, anon, authenticated;
create trigger christopia_auth_profile after insert or update of email on auth.users for each row execute function public.christopia_sync_profile();
insert into public.christopia_profiles(id,email) select id,lower(email) from auth.users where email is not null on conflict(id) do nothing;

-- Preserve domain ordering explicitly; PostgreSQL row order is never implicit.
alter table public.christopia_campaign_players add column campaign_order integer not null default 0;
alter table public.christopia_factions add column campaign_order integer not null default 0;
alter table public.christopia_territories add column campaign_order integer not null default 0;
alter table public.christopia_territory_connections add column campaign_order integer not null default 0;
alter table public.christopia_battles add column campaign_order integer not null default 0;
alter table public.christopia_battle_photos add column campaign_order integer not null default 0;
alter table public.christopia_chronicle_entries add column campaign_order integer not null default 0;
alter table public.christopia_territory_history add column campaign_order integer not null default 0;
alter table public.christopia_units add column campaign_order integer not null default 0;
alter table public.christopia_campaign_events add column campaign_order integer not null default 0;
alter table public.christopia_scenarios add column campaign_order integer not null default 0;
alter table public.christopia_campaign_actions add column campaign_order integer not null default 0;
alter table public.christopia_campaign_resource_transactions add column campaign_order integer not null default 0;

-- This single SQL statement reads a consistent campaign snapshot. Ordinary callers
-- cannot override their identity; the optional actor is used only by the server.
create or replace function public.christopia_load_campaign(p_campaign uuid, p_actor uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid; v_result jsonb;
begin
  v_actor := case when auth.role() = 'service_role' then p_actor else auth.uid() end;
  if v_actor is null or not exists(select 1 from public.christopia_campaign_players where campaign_id=p_campaign and profile_id=v_actor) then
    raise exception 'You do not have access to this campaign.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'campaign', to_jsonb(c) - 'created_by' - 'updated_at',
    'settings', (select to_jsonb(s) - 'campaign_id' from public.christopia_campaign_settings s where s.campaign_id=c.id),

    'players', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_campaign_players r where r.campaign_id=c.id),'[]'::jsonb),
    'factions', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_factions r where r.campaign_id=c.id),'[]'::jsonb),
    'territories', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_territories r where r.campaign_id=c.id),'[]'::jsonb),
    'connections', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_territory_connections r where r.campaign_id=c.id),'[]'::jsonb),
    'battles', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_battles r where r.campaign_id=c.id),'[]'::jsonb),
    'photos', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_battle_photos r where r.campaign_id=c.id),'[]'::jsonb),
    'chronicle', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_chronicle_entries r where r.campaign_id=c.id),'[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_territory_history r where r.campaign_id=c.id),'[]'::jsonb),
    'units', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_units r where r.campaign_id=c.id),'[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_campaign_events r where r.campaign_id=c.id),'[]'::jsonb),
    'scenarios', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_scenarios r where r.campaign_id=c.id),'[]'::jsonb),
    'actions', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_campaign_actions r where r.campaign_id=c.id),'[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(r)-'campaign_id'-'campaign_order' order by r.campaign_order) from public.christopia_campaign_resource_transactions r where r.campaign_id=c.id),'[]'::jsonb)
  ) into v_result from public.christopia_campaigns c where c.id=p_campaign;
  return v_result;
end; $$;
revoke all on function public.christopia_load_campaign(uuid,uuid) from public, anon;
grant execute on function public.christopia_load_campaign(uuid,uuid) to authenticated,service_role;

-- SERVICE-ONLY. The Edge Function validates the verified user's command with the
-- shared campaign engine. Revision locking makes every multi-table update atomic
-- and prevents lost updates, duplicate resource awards, or double captures.
create or replace function public.christopia_persist_state(p_state jsonb,p_actor uuid,p_expected_revision integer,p_create boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_id uuid := (p_state->'campaign'->>'id')::uuid; v_revision integer; v_first jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Server access required.' using errcode='42501'; end if;
  if p_actor is null then raise exception 'A verified account is required.'; end if;
  if p_create then
    v_first := p_state->'players'->0;
    if v_first->>'profile_id' is distinct from p_actor::text or v_first->>'role' is distinct from 'admin' then raise exception 'The campaign creator must be its administrator.'; end if;
    insert into public.christopia_campaigns(id,name,created_by) values(v_id,p_state->'campaign'->>'name',p_actor);
  else
    select revision into v_revision from public.christopia_campaigns where id=v_id for update;
    if not found then raise exception 'Campaign not found.'; end if;
    if not exists(select 1 from public.christopia_campaign_players where campaign_id=v_id and profile_id=p_actor) then raise exception 'Campaign membership required.' using errcode='42501'; end if;
    if v_revision <> p_expected_revision then raise exception 'Another commander changed the campaign. Refresh before saving your changes.' using errcode='40001'; end if;
    if (p_state->'campaign'->>'revision')::integer <> v_revision + 1 then raise exception 'Invalid campaign revision.'; end if;
  end if;
  if not exists(select 1 from jsonb_array_elements(p_state->'players') p where p->>'role'='admin' and p->>'profile_id' is not null) then raise exception 'Keep at least one administrator account.'; end if;

  -- Replace the campaign's normalized rows in this transaction. Foreign keys are
  -- deferred until commit; all ids and historical relationships are retained.

  delete from public.christopia_campaign_resource_transactions where campaign_id=v_id;
  delete from public.christopia_campaign_actions where campaign_id=v_id;
  delete from public.christopia_scenarios where campaign_id=v_id;
  delete from public.christopia_campaign_events where campaign_id=v_id;
  delete from public.christopia_units where campaign_id=v_id;
  delete from public.christopia_territory_history where campaign_id=v_id;
  delete from public.christopia_chronicle_entries where campaign_id=v_id;
  delete from public.christopia_battle_photos where campaign_id=v_id;
  delete from public.christopia_battles where campaign_id=v_id;
  delete from public.christopia_territory_connections where campaign_id=v_id;
  delete from public.christopia_territories where campaign_id=v_id;
  delete from public.christopia_factions where campaign_id=v_id;
  delete from public.christopia_campaign_players where campaign_id=v_id;
  delete from public.christopia_campaign_settings where campaign_id=v_id;
  insert into public.christopia_campaign_players(campaign_id,id, name, color, role, profile_id, resources)
  select v_id,r.id, coalesce(r.name,''), coalesce(r.color,'#76b3cf'), coalesce(r.role,'player'), r.profile_id, coalesce(r.resources,0) from jsonb_populate_recordset(null::public.christopia_campaign_players,p_state->'players') r;
  insert into public.christopia_factions(campaign_id,id, name, player_id, color, description, image_url)
  select v_id,r.id, coalesce(r.name,''), r.player_id, coalesce(r.color,'#76b3cf'), coalesce(r.description,''), coalesce(r.image_url,'') from jsonb_populate_recordset(null::public.christopia_factions,p_state->'factions') r;
  insert into public.christopia_territories(campaign_id,id, scenario_id, name, description, x, y, type, strategic_value, owner_id, previous_owner_id, contested, bonus_key, capture_count, fortified, headquarters_for, image_url)
  select v_id,r.id, r.scenario_id, coalesce(r.name,''), coalesce(r.description,''), coalesce(r.x,50), coalesce(r.y,50), coalesce(r.type,'Wasteland'), coalesce(r.strategic_value,1), r.owner_id, r.previous_owner_id, coalesce(r.contested,false), coalesce(r.bonus_key,'none'), coalesce(r.capture_count,0), coalesce(r.fortified,false), r.headquarters_for, coalesce(r.image_url,'') from jsonb_populate_recordset(null::public.christopia_territories,p_state->'territories') r;
  insert into public.christopia_territory_connections(campaign_id,territory_a, territory_b)
  select v_id,r.territory_a, r.territory_b from jsonb_populate_recordset(null::public.christopia_territory_connections,p_state->'connections') r;
  insert into public.christopia_battles(campaign_id,id, territory_id, attacker_id, defender_id, attacker_faction_id, defender_faction_id, name, mission, deployment, modifier, notes, attacker_objective, defender_objective, custom_objective, campaign_objective, mvp, moment, casualties, points, asset_side, attacker_points, defender_points, date, status, turn, is_final_assault, winner_id, result, attacker_score, defender_score, rounds, units_destroyed, resources_earned, completed_at)
  select v_id,r.id, r.territory_id, r.attacker_id, r.defender_id, r.attacker_faction_id, r.defender_faction_id, coalesce(r.name,''), coalesce(r.mission,''), coalesce(r.deployment,''), coalesce(r.modifier,''), coalesce(r.notes,''), coalesce(r.attacker_objective,''), coalesce(r.defender_objective,''), coalesce(r.custom_objective,''), coalesce(r.campaign_objective,''), coalesce(r.mvp,''), coalesce(r.moment,''), coalesce(r.casualties,''), coalesce(r.points,1000), r.asset_side, coalesce(r.points,1000) * case when r.asset_side='defender' then 2 else 1 end, coalesce(r.points,1000) * case when r.asset_side='attacker' then 2 else 1 end, r.date, coalesce(r.status,'planned'), coalesce(r.turn,1), coalesce(r.is_final_assault,false), r.winner_id, r.result, r.attacker_score, r.defender_score, r.rounds, coalesce(r.units_destroyed,0), coalesce(r.resources_earned,0), r.completed_at from jsonb_populate_recordset(null::public.christopia_battles,p_state->'battles') r;
  insert into public.christopia_battle_photos(campaign_id,id, battle_id, storage_path, caption, created_at)
  select v_id,r.id, r.battle_id, coalesce(r.storage_path,''), coalesce(r.caption,''), coalesce(r.created_at,now()) from jsonb_populate_recordset(null::public.christopia_battle_photos,p_state->'photos') r;
  insert into public.christopia_chronicle_entries(campaign_id,id, battle_id, title, narrative, date)
  select v_id,r.id, r.battle_id, coalesce(r.title,''), coalesce(r.narrative,''), coalesce(r.date,now()) from jsonb_populate_recordset(null::public.christopia_chronicle_entries,p_state->'chronicle') r;
  insert into public.christopia_territory_history(campaign_id,id, territory_id, battle_id, from_owner_id, to_owner_id, title, description, date)
  select v_id,r.id, r.territory_id, r.battle_id, r.from_owner_id, r.to_owner_id, coalesce(r.title,''), coalesce(r.description,''), coalesce(r.date,now()) from jsonb_populate_recordset(null::public.christopia_territory_history,p_state->'history') r;
  insert into public.christopia_units(campaign_id,id, name, nickname, faction_id, battles, victories, kills, times_destroyed, honours, notes)
  select v_id,r.id, coalesce(r.name,''), coalesce(r.nickname,''), r.faction_id, coalesce(r.battles,0), coalesce(r.victories,0), coalesce(r.kills,0), coalesce(r.times_destroyed,0), coalesce(r.honours,''), coalesce(r.notes,'') from jsonb_populate_recordset(null::public.christopia_units,p_state->'units') r;
  insert into public.christopia_campaign_events(campaign_id,id, title, description, effect, duration, remaining_turns, active)
  select v_id,r.id, coalesce(r.title,''), coalesce(r.description,''), coalesce(r.effect,''), coalesce(r.duration,1), coalesce(r.remaining_turns,0), coalesce(r.active,false) from jsonb_populate_recordset(null::public.christopia_campaign_events,p_state->'events') r;
  insert into public.christopia_scenarios(campaign_id,id, title, mission, deployment, condition, narrative, attacker_objective, defender_objective)
  select v_id,r.id, coalesce(r.title,''), coalesce(r.mission,''), coalesce(r.deployment,''), coalesce(r.condition,''), coalesce(r.narrative,''), coalesce(r.attacker_objective,''), coalesce(r.defender_objective,'') from jsonb_populate_recordset(null::public.christopia_scenarios,p_state->'scenarios') r;
  insert into public.christopia_campaign_actions(campaign_id,id, key, name, description, cost)
  select v_id,r.id, coalesce(r.key,''), coalesce(r.name,''), coalesce(r.description,''), coalesce(r.cost,1) from jsonb_populate_recordset(null::public.christopia_campaign_actions,p_state->'actions') r;
  insert into public.christopia_campaign_resource_transactions(campaign_id,id, player_id, amount, reason, date, action_key, turn, territory_id, consumed, scenario_options)
  select v_id,r.id, r.player_id, coalesce(r.amount,0), coalesce(r.reason,''), coalesce(r.date,now()), r.action_key, r.turn, r.territory_id, coalesce(r.consumed,false), coalesce(r.scenario_options,'[]'::jsonb) from jsonb_populate_recordset(null::public.christopia_campaign_resource_transactions,p_state->'transactions') r;
  insert into public.christopia_campaign_settings(campaign_id,attacks_per_turn, resources_enabled, random_events_enabled, unit_tracking_enabled, gameplay_modifiers_enabled, domination_threshold, final_assault_enabled, final_assault_penalty)
  select v_id,coalesce(r.attacks_per_turn,2), coalesce(r.resources_enabled,true), coalesce(r.random_events_enabled,true), coalesce(r.unit_tracking_enabled,true), coalesce(r.gameplay_modifiers_enabled,false), coalesce(r.domination_threshold,70), coalesce(r.final_assault_enabled,true), coalesce(r.final_assault_penalty,3) from jsonb_populate_record(null::public.christopia_campaign_settings,p_state->'settings') r;

  -- Retain insertion order across every normalized snapshot.
  update public.christopia_campaign_players r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'players') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_factions r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'factions') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_territories r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'territories') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_territory_connections r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'connections') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.territory_a=(item.value->>'territory_a')::uuid and r.territory_b=(item.value->>'territory_b')::uuid;
  update public.christopia_battles r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'battles') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_battle_photos r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'photos') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_chronicle_entries r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'chronicle') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_territory_history r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'history') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_units r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'units') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_campaign_events r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'events') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_scenarios r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'scenarios') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_campaign_actions r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'actions') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;
  update public.christopia_campaign_resource_transactions r set campaign_order=item.ordinality::integer from jsonb_array_elements(p_state->'transactions') with ordinality as item(value,ordinality) where r.campaign_id=v_id and r.id=(item.value->>'id')::uuid;

  update public.christopia_campaigns set
    name=p_state->'campaign'->>'name', turn=(p_state->'campaign'->>'turn')::integer,
    status=p_state->'campaign'->>'status', started_at=(p_state->'campaign'->>'started_at')::timestamptz,
    winner_id=(p_state->'campaign'->>'winner_id')::uuid, ended_at=(p_state->'campaign'->>'ended_at')::timestamptz,
    revision=(p_state->'campaign'->>'revision')::integer, updated_at=now()
  where id=v_id;
end; $$;
revoke all on function public.christopia_persist_state(jsonb,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.christopia_persist_state(jsonb,uuid,integer,boolean) to service_role;
commit;
