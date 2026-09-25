-- Run after 001_schema.sql. Battle photographs remain private.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('christopia-battle-photos','christopia-battle-photos',false,5242880,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.christopia_photo_access(p_name text,p_write boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.christopia_campaign_players p
    join public.christopia_battles b on b.campaign_id=p.campaign_id
    join public.christopia_campaigns c on c.id=p.campaign_id
    where p.profile_id=(select auth.uid())
      and p.campaign_id::text=split_part(p_name,'/',1)
      and b.id::text=split_part(p_name,'/',2)
      and p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
      and (not p_write or (c.status <> 'archived' and (p.role='admin' or p.id in (b.attacker_id,b.defender_id))))
  );
$$;
revoke all on function public.christopia_photo_access(text,boolean) from public,anon;
grant execute on function public.christopia_photo_access(text,boolean) to authenticated;
create policy christopia_photos_read on storage.objects for select to authenticated
using (bucket_id='christopia-battle-photos' and public.christopia_photo_access(name,false));
create policy christopia_photos_insert on storage.objects for insert to authenticated
with check (bucket_id='christopia-battle-photos' and public.christopia_photo_access(name,true));
create policy christopia_photos_delete on storage.objects for delete to authenticated
using (bucket_id='christopia-battle-photos' and public.christopia_photo_access(name,true));
commit;
