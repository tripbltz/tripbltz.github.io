-- Apply once to an existing installation, or after 001/002 on a new one.
-- Existing battles, photographs, ownership and ids are preserved.
begin;
alter table public.christopia_battles add column if not exists asset_side text check (asset_side in ('attacker','defender'));
alter table public.christopia_battles add column if not exists attacker_points integer not null default 1000;
alter table public.christopia_battles add column if not exists defender_points integer not null default 1000;
update public.christopia_battles set attacker_points=points * case when asset_side='defender' then 2 else 1 end, defender_points=points * case when asset_side='attacker' then 2 else 1 end;

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
  insert into public.christopia_territories(campaign_id,id, name, description, x, y, type, strategic_value, owner_id, previous_owner_id, contested, bonus_key, capture_count, fortified, headquarters_for, image_url)
  select v_id,r.id, coalesce(r.name,''), coalesce(r.description,''), coalesce(r.x,50), coalesce(r.y,50), coalesce(r.type,'Wasteland'), coalesce(r.strategic_value,1), r.owner_id, r.previous_owner_id, coalesce(r.contested,false), coalesce(r.bonus_key,'none'), coalesce(r.capture_count,0), coalesce(r.fortified,false), r.headquarters_for, coalesce(r.image_url,'') from jsonb_populate_recordset(null::public.christopia_territories,p_state->'territories') r;
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

create table if not exists public.christopia_content_migrations (id text primary key, applied_at timestamptz not null default now());
alter table public.christopia_content_migrations enable row level security;
revoke all on public.christopia_content_migrations from public,anon,authenticated;
do $$ begin
if not exists(select 1 from public.christopia_content_migrations where id='destroy-the-asset-v1') then
update public.christopia_territories set name=replace(replace(replace(name,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), description=replace(replace(replace(description,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
update public.christopia_battles set name=replace(replace(replace(name,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), notes=replace(replace(replace(notes,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), mission=replace(replace(replace(mission,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), deployment=replace(replace(replace(deployment,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), modifier=replace(replace(replace(modifier,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), attacker_objective=replace(replace(replace(attacker_objective,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), defender_objective=replace(replace(replace(defender_objective,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), custom_objective=replace(replace(replace(custom_objective,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), campaign_objective=replace(replace(replace(campaign_objective,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), mvp=replace(replace(replace(mvp,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), moment=replace(replace(replace(moment,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
update public.christopia_chronicle_entries set title=replace(replace(replace(title,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), narrative=replace(replace(replace(narrative,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
update public.christopia_territory_history set title=replace(replace(replace(title,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), description=replace(replace(replace(description,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
update public.christopia_units set name=replace(replace(replace(name,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), nickname=replace(replace(replace(nickname,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), honours=replace(replace(replace(honours,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), notes=replace(replace(replace(notes,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
update public.christopia_scenarios set title=replace(replace(replace(title,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), narrative=replace(replace(replace(narrative,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), attacker_objective=replace(replace(replace(attacker_objective,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), defender_objective=replace(replace(replace(defender_objective,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
update public.christopia_campaign_events set title=replace(replace(replace(title,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole'), description=replace(replace(replace(description,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
update public.christopia_campaign_resource_transactions set reason=replace(replace(replace(reason,'Fort Penelope','Fort Rouse'),'Hive Ward','Hive Ashstomp'),'The Hazel Expanse','Sam''s Smelly Hole');
insert into public.christopia_scenarios (campaign_id,id,campaign_order,title,mission,deployment,condition,narrative,attacker_objective,defender_objective)
select c.id,gen_random_uuid(),coalesce((select max(campaign_order)+1 from public.christopia_scenarios s where s.campaign_id=c.id),1),'Destroy the asset','Destroy the asset','Agree deployment; roll the escape zone after both armies deploy','BANEBLADE ESCAPE · ASYMMETRIC FORCES','One commander must escort a Baneblade to safety while the opposing army tries to destroy it. Agree and number the eligible escape zones before play, then roll to designate the escape zone only after both armies have deployed. The Baneblade player’s army allowance includes the Baneblade. The opposing player receives twice that total army allowance. For example: 1,000 points including the Baneblade versus 2,000 points. The Baneblade player wins by reaching the designated escape zone with the Baneblade; the opposing player wins by destroying it before it escapes. Agree any remaining mission details before play.','Destroy the Baneblade before it reaches the designated escape zone. Your army has twice the Baneblade player’s total points allowance.','Escape with the Baneblade to the designated zone, rolled for after both armies deploy. Your total army allowance includes the Baneblade.'
from public.christopia_campaigns c where not exists(select 1 from public.christopia_scenarios s where s.campaign_id=c.id and lower(s.title)='destroy the asset');
update public.christopia_campaigns set revision=revision+1,updated_at=now();
insert into public.christopia_content_migrations(id) values('destroy-the-asset-v1');
end if;
end $$;
commit;
