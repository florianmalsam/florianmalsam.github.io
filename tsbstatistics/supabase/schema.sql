create table if not exists public.team_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.team_state enable row level security;
revoke all on public.team_state from anon, authenticated;
grant select on public.team_state to authenticated;

drop policy if exists "Read own team" on public.team_state;
create policy "Read own team" on public.team_state
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.save_team_state(new_payload jsonb, expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_owner uuid := auth.uid();
  saved_revision bigint;
begin
  if current_owner is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0
    or new_payload is null
    or jsonb_typeof(new_payload) is distinct from 'object'
    or new_payload->>'version' is distinct from '1'
    or jsonb_typeof(new_payload->'players') is distinct from 'array'
    or jsonb_typeof(new_payload->'matches') is distinct from 'array'
    or jsonb_typeof(new_payload->'entries') is distinct from 'array'
    or jsonb_typeof(new_payload->'rate') is distinct from 'number'
    or octet_length(new_payload::text) > 5000000 then
    raise exception 'Invalid team data' using errcode = '22023';
  end if;
  if (new_payload->>'rate')::numeric < 0 then
    raise exception 'Invalid rate' using errcode = '22023';
  end if;

  if expected_revision = 0 then
    insert into public.team_state(owner_id, payload)
    values (current_owner, new_payload)
    on conflict (owner_id) do nothing
    returning revision into saved_revision;
  else
    update public.team_state
    set payload = new_payload, revision = revision + 1, updated_at = now()
    where owner_id = current_owner and revision = expected_revision
    returning revision into saved_revision;
  end if;

  if saved_revision is null then
    raise exception 'Team data changed on another device' using errcode = 'P0001';
  end if;
  return saved_revision;
end;
$$;

revoke all on function public.save_team_state(jsonb, bigint) from public, anon;
grant execute on function public.save_team_state(jsonb, bigint) to authenticated;