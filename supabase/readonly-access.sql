do $$
declare
  reader uuid;
  team_owner uuid;
  team_count integer;
begin
  select id into reader
  from auth.users
  where lower(email) = lower('xs_esl@web.de');

  if reader is null then
    raise exception 'Supabase user xs_esl@web.de was not found.';
  end if;

  select count(*) into team_count from public.team_state;
  if team_count <> 1 then
    raise exception 'Expected exactly one team_state row; found %.', team_count;
  end if;

  select owner_id into team_owner from public.team_state;
  insert into public.team_readers(owner_id, reader_id)
  values (team_owner, reader)
  on conflict (owner_id, reader_id) do nothing;
end;
$$;