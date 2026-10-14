-- IS-Connect database functions: every write the app makes goes through one
-- of these. They run as the table owner (security definer), check the
-- caller's login token, and only touch the caller's own rows.
-- Safe to re-run at any time (no data is lost): `npm run db:functions`.

-- ---------------------------------------------------------------------------
-- Login

create or replace function _session_user(p_token uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from app_sessions where token = p_token
$$;

create or replace function sign_up(p_username text, p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_username text := lower(trim(p_username));
  v_user_id  uuid;
  v_token    uuid;
begin
  if v_username !~ '^[a-z0-9_.]{3,30}$' then
    raise exception 'Username must be 3-30 letters, numbers, dots or underscores.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  if exists (select 1 from app_users where username = v_username) then
    raise exception 'That username is taken.';
  end if;
  insert into app_users (username, password_hash)
    values (v_username, crypt(p_password, gen_salt('bf'))) returning id into v_user_id;
  insert into app_sessions (user_id) values (v_user_id) returning token into v_token;
  return json_build_object('token', v_token, 'user_id', v_user_id, 'username', v_username);
end $$;

create or replace function log_in(p_username text, p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user  app_users;
  v_token uuid;
begin
  select * into v_user from app_users where username = lower(trim(p_username));
  if v_user.id is null or v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    raise exception 'Wrong username or password.';
  end if;
  insert into app_sessions (user_id) values (v_user.id) returning token into v_token;
  return json_build_object('token', v_token, 'user_id', v_user.id, 'username', v_user.username);
end $$;

-- Who is logged in with this token? (null if the token is unknown)
create or replace function get_session(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('token', s.token, 'user_id', u.id, 'username', u.username)
  from app_sessions s join app_users u on u.id = s.user_id
  where s.token = p_token
$$;

create or replace function log_out(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from app_sessions where token = p_token
$$;

-- Create or update your own profile and replace your strengths.
create or replace function save_profile(
  p_token uuid, p_full_name text, p_program_status text,
  p_current_course text, p_looking_for_help_with text, p_skill_ids bigint[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id    uuid := _session_user(p_token);
  v_student_id uuid;
begin
  if v_user_id is null then
    raise exception 'Your login has expired. Please log in again.';
  end if;
  insert into students (user_id, full_name, program_status, current_course, looking_for_help_with)
    values (v_user_id, p_full_name, p_program_status, p_current_course, p_looking_for_help_with)
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    program_status = excluded.program_status,
    current_course = excluded.current_course,
    looking_for_help_with = excluded.looking_for_help_with
  returning id into v_student_id;

  delete from student_skills where student_id = v_student_id;
  insert into student_skills (student_id, skill_id)
    select v_student_id, unnest(coalesce(p_skill_ids, '{}'));
  return v_student_id;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers (internal, not callable from the website)

-- The caller's own students.id, or an error if not logged in / no profile yet.
create or replace function _session_student(p_token uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_user_id    uuid := _session_user(p_token);
  v_student_id uuid;
begin
  if v_user_id is null then
    raise exception 'Your login has expired. Please log in again.';
  end if;
  select id into v_student_id from students where user_id = v_user_id;
  if v_student_id is null then
    raise exception 'Create your profile first.';
  end if;
  return v_student_id;
end $$;

-- Has either student blocked the other?
create or replace function _is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks
                 where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

-- The other student, checked: exists, isn't you, and isn't blocked.
create or replace function _other_student(p_me uuid, p_other uuid) returns students
language plpgsql stable security definer set search_path = public as $$
declare
  v_other students;
begin
  select * into v_other from students where id = p_other;
  if v_other.id is null then
    raise exception 'That student no longer exists.';
  end if;
  if v_other.id = p_me then
    raise exception 'That''s you!';
  end if;
  if _is_blocked(p_me, p_other) then
    raise exception 'You can''t contact this student.';
  end if;
  return v_other;
end $$;

revoke execute on function _session_user(uuid), _session_student(uuid), _is_blocked(uuid, uuid),
  _other_student(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Messages

-- Send a message. Sample students (no login) send one friendly reply so a
-- solo tester can see a conversation working.
create or replace function send_message(p_token uuid, p_recipient_id uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := _session_student(p_token);
  v_other students := _other_student(v_me, p_recipient_id);
  v_body  text := trim(p_body);
  v_id    bigint;
begin
  if coalesce(v_body, '') = '' then
    raise exception 'Type a message first.';
  end if;
  insert into messages (sender_id, recipient_id, body) values (v_me, v_other.id, v_body) returning id into v_id;

  if v_other.user_id is null
     and not exists (select 1 from messages where sender_id = v_other.id and recipient_id = v_me) then
    insert into messages (sender_id, recipient_id, body, sent_at)
      values (v_other.id, v_me,
              'Hi! Thanks for reaching out 😊 I''d love to study together. Want to set up a time?',
              now() + interval '1 second');
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Friends

-- Send a friend request (or accept theirs if they already asked you).
-- Sample students accept straight away. Returns the friendship status.
create or replace function add_friend(p_token uuid, p_other_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := _session_student(p_token);
  v_other  students := _other_student(v_me, p_other_id);
  v_status text;
begin
  update friendships set status = 'accepted'
    where requester_id = v_other.id and addressee_id = v_me and status = 'pending';
  if found then
    return 'accepted';
  end if;
  select status into v_status from friendships
    where (requester_id = v_me and addressee_id = v_other.id) or (requester_id = v_other.id and addressee_id = v_me);
  if v_status is not null then
    return v_status;
  end if;
  v_status := case when v_other.user_id is null then 'accepted' else 'pending' end;
  insert into friendships (requester_id, addressee_id, status) values (v_me, v_other.id, v_status);
  return v_status;
end $$;

-- Accept or decline a friend request sent to you.
create or replace function respond_friend(p_token uuid, p_friendship_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  if p_accept then
    update friendships set status = 'accepted'
      where id = p_friendship_id and addressee_id = v_me and status = 'pending';
  else
    delete from friendships where id = p_friendship_id and addressee_id = v_me and status = 'pending';
  end if;
  if not found then
    raise exception 'Friend request not found.';
  end if;
end $$;

create or replace function remove_friend(p_token uuid, p_other_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  delete from friendships
    where (requester_id = v_me and addressee_id = p_other_id) or (requester_id = p_other_id and addressee_id = v_me);
end $$;

-- ---------------------------------------------------------------------------
-- Availability (Calendar)

-- Replace your weekly free times.
-- p_slots: [{"day": "Mon", "start_time": "16:00", "duration_minutes": 60}, ...]
create or replace function set_availability(p_token uuid, p_slots jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := _session_student(p_token);
  v_count integer;
begin
  delete from availability_slots where student_id = v_me;
  insert into availability_slots (student_id, day_of_week, start_time, duration_minutes)
    select v_me, x.day, x.start_time, coalesce(x.duration_minutes, 60)
    from jsonb_to_recordset(coalesce(p_slots, '[]')) as x(day text, start_time time, duration_minutes int);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Meetups

-- Ask another student to meet. Sample students confirm straight away.
create or replace function request_meetup(p_token uuid, p_partner_id uuid, p_scheduled_at timestamptz, p_location text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := _session_student(p_token);
  v_other students := _other_student(v_me, p_partner_id);
  v_id    bigint;
begin
  if p_scheduled_at is null or p_scheduled_at < now() then
    raise exception 'Pick a time in the future.';
  end if;
  if coalesce(trim(p_location), '') = '' then
    raise exception 'Pick a place to meet.';
  end if;
  insert into meetups (requester_id, partner_id, scheduled_at, location, status)
    values (v_me, v_other.id, p_scheduled_at, trim(p_location),
            case when v_other.user_id is null then 'confirmed' else 'requested' end)
    returning id into v_id;
  return v_id;
end $$;

-- Partner confirms; either side cancels; either side marks a past meetup completed.
create or replace function set_meetup_status(p_token uuid, p_meetup_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
  v_m  meetups;
begin
  select * into v_m from meetups where id = p_meetup_id and v_me in (requester_id, partner_id);
  if v_m.id is null then
    raise exception 'Meetup not found.';
  end if;
  if not (
       (p_status = 'confirmed' and v_m.status = 'requested' and v_me = v_m.partner_id)
    or (p_status = 'cancelled' and v_m.status in ('requested', 'confirmed'))
    or (p_status = 'completed' and v_m.status = 'confirmed' and v_m.scheduled_at <= now())
  ) then
    raise exception 'You can''t change this meetup to "%".', p_status;
  end if;
  update meetups set status = p_status where id = v_m.id;
end $$;

-- ---------------------------------------------------------------------------
-- Study resources

create or replace function add_resource(p_token uuid, p_title text, p_course text, p_url text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
  v_id bigint;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Give your study guide a title.';
  end if;
  if trim(coalesce(p_url, '')) !~* '^https?://' then
    raise exception 'Links must start with http:// or https://';
  end if;
  insert into study_resources (uploader_id, title, course, resource_url)
    values (v_me, trim(p_title), nullif(trim(p_course), ''), trim(p_url))
    returning id into v_id;
  return v_id;
end $$;

create or replace function delete_resource(p_token uuid, p_resource_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  delete from study_resources where id = p_resource_id and uploader_id = v_me;
  if not found then
    raise exception 'You can only delete study guides you shared.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Block / report

-- Block (and optionally report) a student: removes the friendship and cancels
-- upcoming meetups, so no contact can happen.
create or replace function block_user(p_token uuid, p_other_id uuid, p_is_report boolean, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  if p_other_id = v_me then
    raise exception 'That''s you!';
  end if;
  if not exists (select 1 from students where id = p_other_id) then
    raise exception 'That student no longer exists.';
  end if;
  insert into user_blocks (blocker_id, blocked_id, is_report, reason)
    values (v_me, p_other_id, coalesce(p_is_report, false), nullif(trim(p_reason), ''))
  on conflict (blocker_id, blocked_id) do update set
    is_report = user_blocks.is_report or excluded.is_report,
    reason    = coalesce(excluded.reason, user_blocks.reason);
  delete from friendships
    where (requester_id = v_me and addressee_id = p_other_id) or (requester_id = p_other_id and addressee_id = v_me);
  update meetups set status = 'cancelled'
    where status in ('requested', 'confirmed') and scheduled_at > now()
      and ((requester_id = v_me and partner_id = p_other_id) or (requester_id = p_other_id and partner_id = v_me));
end $$;

create or replace function unblock_user(p_token uuid, p_other_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  delete from user_blocks where blocker_id = v_me and blocked_id = p_other_id;
end $$;

-- ---------------------------------------------------------------------------

grant execute on function
  sign_up(text, text), log_in(text, text), get_session(uuid), log_out(uuid),
  save_profile(uuid, text, text, text, text, bigint[]),
  send_message(uuid, uuid, text),
  add_friend(uuid, uuid), respond_friend(uuid, bigint, boolean), remove_friend(uuid, uuid),
  set_availability(uuid, jsonb),
  request_meetup(uuid, uuid, timestamptz, text), set_meetup_status(uuid, bigint, text),
  add_resource(uuid, text, text, text), delete_resource(uuid, bigint),
  block_user(uuid, uuid, boolean, text), unblock_user(uuid, uuid)
to anon, authenticated;
