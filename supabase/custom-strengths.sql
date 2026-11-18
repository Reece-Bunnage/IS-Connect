-- Run once in the existing project's Supabase SQL Editor. No tables are reset.
-- This wrapper keeps the current save_profile behavior and adds real skill links.
begin;
create or replace function public.save_profile_with_strengths(
  p_token uuid, p_profile jsonb, p_custom_strengths text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := _session_user(p_token);
  v_student uuid;
  v_name text;
  v_skill bigint;
begin
  if v_user is null then raise exception 'Your login has expired. Please log in again.'; end if;
  if coalesce(cardinality(p_custom_strengths), 0) > 10 then
    raise exception 'Add up to 10 custom strengths at a time.';
  end if;
  if exists (select 1 from unnest(p_custom_strengths) n
    where n is null or length(trim(regexp_replace(n, '\s+', ' ', 'g'))) not between 1 and 40) then
    raise exception 'Each custom strength must contain 1 to 40 characters.';
  end if;
  -- A single transaction: a failure cannot leave a partly saved profile.
  v_student := save_profile(p_token, p_profile);
  -- Serialize these short catalog additions to avoid case-only duplicates.
  perform pg_advisory_xact_lock(17421, 1);
  foreach v_name in array coalesce(p_custom_strengths, array[]::text[]) loop
    v_name := trim(regexp_replace(v_name, '\s+', ' ', 'g'));
    select id into v_skill from skills where lower(name) = lower(v_name) order by id limit 1;
    if v_skill is null then
      insert into skills(name) values (v_name) on conflict (name) do nothing;
      select id into v_skill from skills where lower(name) = lower(v_name) order by id limit 1;
    end if;
    insert into student_skills(student_id, skill_id) values (v_student, v_skill)
      on conflict (student_id, skill_id) do nothing;
  end loop;
  return v_student;
end $$;
revoke all on function public.save_profile_with_strengths(uuid,jsonb,text[]) from public;
grant execute on function public.save_profile_with_strengths(uuid,jsonb,text[]) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
