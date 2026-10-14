-- IS-Connect database functions. Every write the app makes, and every read of
-- private data (messages, friends, meetups, groups...), goes through one of
-- these. They run as the table owner (security definer), check the caller's
-- login token, and only touch the caller's own rows.
-- Safe to re-run at any time (no data is lost): `npm run db:functions`.

-- Older versions with different arguments (re-creating can't change arguments).
drop function if exists save_profile(uuid, text, text, text, text, bigint[]);
drop function if exists request_meetup(uuid, uuid, timestamptz, text);

-- ===========================================================================
-- Helpers (internal, not callable from the website)

create or replace function _session_user(p_token uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from app_sessions where token = p_token
$$;

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

create or replace function _is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks
                 where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function _are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted'
                 and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a)))
$$;

create or replace function _share_course(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from student_courses x join student_courses y on y.course_id = x.course_id
                 where x.student_id = a and y.student_id = b)
$$;

create or replace function _first_name(p_student uuid) returns text
language sql stable security definer set search_path = public as $$
  select split_part(full_name, ' ', 1) from students where id = p_student
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

-- Already talking: friends, an accepted message request, or they messaged you first.
create or replace function _in_contact(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select _are_friends(a, b)
      or exists (select 1 from message_requests where status = 'accepted'
                 and ((sender_id = a and recipient_id = b) or (sender_id = b and recipient_id = a)))
      or exists (select 1 from messages where sender_id = b and recipient_id = a)
$$;

-- Why you can't start contact with this student (null = you can).
create or replace function _contact_block_reason(p_me uuid, p_other students) returns text
language sql stable security definer set search_path = public as $$
  select case
    when _in_contact(p_me, p_other.id) then null
    when p_other.contact_setting = 'anyone' then null
    when p_other.contact_setting = 'courses' and _share_course(p_me, p_other.id) then null
    when p_other.contact_setting = 'courses' then
      split_part(p_other.full_name, ' ', 1) || ' only accepts messages from classmates and friends. Send a friend request first.'
    else
      split_part(p_other.full_name, ' ', 1) || ' only accepts messages from friends. Send a friend request first.'
  end
$$;

-- Something happened involving a student. Sample students (no login) are skipped.
create or replace function _notify(p_student uuid, p_kind text, p_body text, p_screen text, p_params jsonb)
returns void
language sql security definer set search_path = public as $$
  insert into notifications (student_id, kind, body, screen, params)
  select p_student, p_kind, p_body, p_screen, coalesce(p_params, '{}')
  where exists (select 1 from students where id = p_student and user_id is not null)
$$;

-- The study group for a course (created the first time it's needed).
create or replace function _course_group(p_course_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  select id into v_id from study_groups where kind = 'course' and course_id = p_course_id;
  if v_id is null then
    insert into study_groups (kind, course_id, name)
      select 'course', id, code || ' study group' from courses where id = p_course_id
      returning id into v_id;
  end if;
  return v_id;
end $$;

-- Keep a student's course-group memberships in step with their courses.
create or replace function _sync_course_groups(p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, student_id)
    select _course_group(sc.course_id), p_student from student_courses sc where sc.student_id = p_student
  on conflict do nothing;
  delete from group_members gm using study_groups g
    where gm.group_id = g.id and gm.student_id = p_student and g.kind = 'course'
      and g.course_id not in (select course_id from student_courses where student_id = p_student);
end $$;

-- A fresh recovery code like 'K7Q2-M9XD-P4TA'.
create or replace function _new_recovery_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code  text := '';
begin
  for i in 1..12 loop
    v_code := v_code || substr(v_chars, 1 + (get_byte(gen_random_bytes(1), 0) % length(v_chars)), 1);
    if i in (4, 8) then v_code := v_code || '-'; end if;
  end loop;
  return v_code;
end $$;

create or replace function _require_admin(p_token uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from app_users where id = _session_user(p_token) and is_admin) then
    raise exception 'Only admins can do that.';
  end if;
end $$;

revoke execute on function _session_user(uuid), _session_student(uuid), _is_blocked(uuid, uuid),
  _are_friends(uuid, uuid), _share_course(uuid, uuid), _first_name(uuid), _other_student(uuid, uuid),
  _in_contact(uuid, uuid), _contact_block_reason(uuid, students),
  _notify(uuid, text, text, text, jsonb), _course_group(bigint), _sync_course_groups(uuid),
  _new_recovery_code(), _require_admin(uuid)
  from public, anon, authenticated;

-- ===========================================================================
-- Login and account

create or replace function sign_up(p_username text, p_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_username text := lower(trim(p_username));
  v_code     text := _new_recovery_code();
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
  insert into app_users (username, password_hash, recovery_hash)
    values (v_username, crypt(p_password, gen_salt('bf')), crypt(v_code, gen_salt('bf')))
    returning id into v_user_id;
  insert into app_sessions (user_id) values (v_user_id) returning token into v_token;
  return json_build_object('token', v_token, 'user_id', v_user_id, 'username', v_username,
                           'is_admin', false, 'recovery_code', v_code);
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
  return json_build_object('token', v_token, 'user_id', v_user.id, 'username', v_user.username,
                           'is_admin', v_user.is_admin);
end $$;

-- Who is logged in with this token? (null if the token is unknown)
create or replace function get_session(p_token uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('token', s.token, 'user_id', u.id, 'username', u.username, 'is_admin', u.is_admin)
  from app_sessions s join app_users u on u.id = s.user_id
  where s.token = p_token
$$;

create or replace function log_out(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from app_sessions where token = p_token
$$;

-- "Forgot password?": the recovery code sets a new password, logs out every
-- other browser, and is replaced by a new code (it works once).
create or replace function reset_password(p_username text, p_recovery_code text, p_new_password text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user  app_users;
  v_code  text := _new_recovery_code();
  v_clean text := upper(regexp_replace(coalesce(p_recovery_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_typed text := substr(v_clean, 1, 4) || '-' || substr(v_clean, 5, 4) || '-' || substr(v_clean, 9, 4);
  v_token uuid;
begin
  select * into v_user from app_users where username = lower(trim(p_username));
  if v_user.id is null or v_user.recovery_hash is null
     or v_user.recovery_hash <> crypt(v_typed, v_user.recovery_hash) then
    raise exception 'That username and recovery code don''t match.';
  end if;
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'Password must be at least 6 characters.';
  end if;
  update app_users set password_hash = crypt(p_new_password, gen_salt('bf')),
                       recovery_hash = crypt(v_code, gen_salt('bf'))
    where id = v_user.id;
  delete from app_sessions where user_id = v_user.id;
  insert into app_sessions (user_id) values (v_user.id) returning token into v_token;
  return json_build_object('token', v_token, 'user_id', v_user.id, 'username', v_user.username,
                           'is_admin', v_user.is_admin, 'recovery_code', v_code);
end $$;

-- Replace your recovery code (the old one stops working).
create or replace function new_recovery_code(p_token uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user_id uuid := _session_user(p_token);
  v_code    text := _new_recovery_code();
begin
  if v_user_id is null then
    raise exception 'Your login has expired. Please log in again.';
  end if;
  update app_users set recovery_hash = crypt(v_code, gen_salt('bf')) where id = v_user_id;
  return v_code;
end $$;

-- Delete your login, profile, messages and everything else you made.
create or replace function delete_account(p_token uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_user app_users;
begin
  select * into v_user from app_users where id = _session_user(p_token);
  if v_user.id is null then
    raise exception 'Your login has expired. Please log in again.';
  end if;
  if v_user.password_hash <> crypt(p_password, v_user.password_hash) then
    raise exception 'That password is wrong.';
  end if;
  delete from students where user_id = v_user.id;
  delete from app_users where id = v_user.id;
end $$;

-- ===========================================================================
-- Profile

-- Create or update your own profile. p_profile:
-- { full_name, program_status, graduation_year, avatar_color, bio, ask_me_about,
--   looking_for_help_with, course_ids: [..], skill_ids: [..], need_ids: [..] }
create or replace function save_profile(p_token uuid, p_profile jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id    uuid := _session_user(p_token);
  v_student_id uuid;
  v_name       text := trim(p_profile->>'full_name');
begin
  if v_user_id is null then
    raise exception 'Your login has expired. Please log in again.';
  end if;
  if coalesce(v_name, '') = '' then
    raise exception 'Please enter your name.';
  end if;
  insert into students (user_id, full_name, program_status, graduation_year, avatar_color, bio,
                        ask_me_about, looking_for_help_with)
    values (v_user_id, v_name, coalesce(p_profile->>'program_status', 'pre_is'),
            nullif(p_profile->>'graduation_year', '')::int,
            coalesce(nullif(p_profile->>'avatar_color', ''), '#24543f'),
            nullif(trim(p_profile->>'bio'), ''), nullif(trim(p_profile->>'ask_me_about'), ''),
            nullif(trim(p_profile->>'looking_for_help_with'), ''))
  on conflict (user_id) do update set
    full_name = excluded.full_name, program_status = excluded.program_status,
    graduation_year = excluded.graduation_year, avatar_color = excluded.avatar_color,
    bio = excluded.bio, ask_me_about = excluded.ask_me_about,
    looking_for_help_with = excluded.looking_for_help_with
  returning id into v_student_id;

  delete from student_skills where student_id = v_student_id;
  insert into student_skills (student_id, skill_id)
    select distinct v_student_id, x::bigint from jsonb_array_elements_text(coalesce(p_profile->'skill_ids', '[]')) x;
  delete from student_needs where student_id = v_student_id;
  insert into student_needs (student_id, skill_id)
    select distinct v_student_id, x::bigint from jsonb_array_elements_text(coalesce(p_profile->'need_ids', '[]')) x;
  delete from student_courses where student_id = v_student_id;
  insert into student_courses (student_id, course_id)
    select distinct v_student_id, x::bigint from jsonb_array_elements_text(coalesce(p_profile->'course_ids', '[]')) x;
  perform _sync_course_groups(v_student_id);
  return v_student_id;
end $$;

-- Who can message you or invite you to meet: 'anyone', 'courses' or 'friends'.
create or replace function set_contact_setting(p_token uuid, p_setting text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  if p_setting not in ('anyone', 'courses', 'friends') then
    raise exception 'Unknown setting.';
  end if;
  update students set contact_setting = p_setting where id = v_me;
end $$;

-- ===========================================================================
-- Badges and notifications

-- Counts for the badges, and "active today". The app calls this every ~30 s.
create or replace function my_state(p_token uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  update students set last_active_at = now() where id = v_me;
  return json_build_object(
    'unread_messages', (select count(*) from messages m
                        where m.recipient_id = v_me and m.read_at is null and not _is_blocked(v_me, m.sender_id)
                          and not exists (select 1 from message_requests r where r.sender_id = m.sender_id
                                          and r.recipient_id = v_me and r.status <> 'accepted')),
    'message_requests', (select count(*) from message_requests r
                         where r.recipient_id = v_me and r.status = 'pending' and not _is_blocked(v_me, r.sender_id)),
    'friend_requests', (select count(*) from friendships where addressee_id = v_me and status = 'pending'),
    'meetup_requests', (select count(*) from meetups where partner_id = v_me and status = 'requested'
                        and scheduled_at > now()),
    'groups_unread', (select count(*) from group_messages gm join group_members mem
                        on mem.group_id = gm.group_id and mem.student_id = v_me
                      where gm.sent_at > mem.last_read_at and gm.sender_id <> v_me),
    'notifications', (select count(*) from notifications where student_id = v_me and read_at is null)
                     + (select count(*) from meetups where status = 'confirmed' and v_me in (requester_id, partner_id)
                        and scheduled_at between now() and now() + interval '24 hours')
  );
end $$;

-- Your notifications, newest first, plus reminders for meetups in the next 24 hours.
create or replace function my_notifications(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(n order by n.pinned desc, n.created_at desc) from (
    select 'reminder-' || m.id as id, 'meetup_reminder' as kind,
           'Coming up: study session with ' || _first_name(case when m.requester_id = v_me then m.partner_id else m.requester_id end)
             || ' at ' || m.location as body,
           'meetups' as screen, '{}'::jsonb as params, now() as created_at, null::timestamptz as read_at,
           true as pinned, m.scheduled_at as at
    from meetups m
    where m.status = 'confirmed' and v_me in (m.requester_id, m.partner_id)
      and m.scheduled_at between now() and now() + interval '24 hours'
    union all
    (select id::text, kind, body, screen, params, created_at, read_at, false, null
     from notifications where student_id = v_me order by created_at desc limit 50)
  ) n), '[]'::json);
end $$;

create or replace function mark_notifications_read(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  update notifications set read_at = now() where student_id = v_me and read_at is null;
end $$;

-- ===========================================================================
-- Messages (with message requests)

-- Students hidden from you because either of you blocked the other.
create or replace function my_hidden_ids(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(case when blocker_id = v_me then blocked_id else blocker_id end)
                   from user_blocks where v_me in (blocker_id, blocked_id)), '[]'::json);
end $$;

-- One row per conversation: the other student, last message, unread count and
-- whether it's a normal chat or a message request.
create or replace function my_inbox(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(c order by c.last_at desc) from (
    select o.other_id, s.full_name as name, s.avatar_color as color, s.last_active_at,
           last.body as last_body, last.sent_at as last_at, last.sender_id = v_me as last_from_me,
           (select count(*) from messages u where u.sender_id = o.other_id and u.recipient_id = v_me and u.read_at is null) as unread,
           case
             when exists (select 1 from message_requests r where r.sender_id = o.other_id and r.recipient_id = v_me and r.status = 'pending') then 'request_in'
             when exists (select 1 from message_requests r where r.sender_id = o.other_id and r.recipient_id = v_me and r.status = 'declined') then 'declined_in'
             when exists (select 1 from message_requests r where r.sender_id = v_me and r.recipient_id = o.other_id and r.status = 'pending') then 'request_out'
             else 'chat'
           end as state
    from (select distinct case when sender_id = v_me then recipient_id else sender_id end as other_id
          from messages where v_me in (sender_id, recipient_id)) o
    join students s on s.id = o.other_id
    cross join lateral (select body, sent_at, sender_id from messages
                        where (sender_id = v_me and recipient_id = o.other_id) or (sender_id = o.other_id and recipient_id = v_me)
                        order by sent_at desc limit 1) last
    where not _is_blocked(v_me, o.other_id)
  ) c where c.state <> 'declined_in'), '[]'::json);
end $$;

-- One conversation. Marks their messages to you as read.
create or replace function my_chat(p_token uuid, p_other_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := _session_student(p_token);
  v_other  students;
  v_state  text;
  v_reason text;
begin
  select * into v_other from students where id = p_other_id;
  if v_other.id is null then
    raise exception 'That student no longer exists.';
  end if;
  -- Mark their messages read, except a request you haven't accepted (no "Seen" until you do).
  update messages set read_at = now()
    where sender_id = p_other_id and recipient_id = v_me and read_at is null
      and not exists (select 1 from message_requests where sender_id = p_other_id and recipient_id = v_me and status = 'pending');

  v_state := case
    when _is_blocked(v_me, p_other_id) then 'blocked'
    when exists (select 1 from message_requests where sender_id = p_other_id and recipient_id = v_me and status = 'pending') then 'request_in'
    when exists (select 1 from message_requests where sender_id = v_me and recipient_id = p_other_id and status = 'declined') then 'declined'
    when exists (select 1 from message_requests where sender_id = v_me and recipient_id = p_other_id and status = 'pending') then 'request_out'
    else 'chat'
  end;
  v_reason := case
    when v_state = 'blocked' then 'You can''t message this student.'
    when v_state = 'declined' then split_part(v_other.full_name, ' ', 1) || ' isn''t accepting messages from you.'
    when v_state in ('request_in', 'request_out') then null
    else _contact_block_reason(v_me, v_other)
  end;

  return json_build_object(
    'state', v_state,
    'can_send', v_reason is null,
    'reason', v_reason,
    'other', json_build_object('id', v_other.id, 'name', v_other.full_name, 'color', v_other.avatar_color,
                               'last_active_at', v_other.last_active_at, 'is_sample', v_other.user_id is null),
    'messages', coalesce((select json_agg(json_build_object('id', id, 'body', body, 'sent_at', sent_at,
                                                            'mine', sender_id = v_me, 'read_at', read_at) order by sent_at)
                          from messages
                          where not _is_blocked(v_me, p_other_id)
                            and ((sender_id = v_me and recipient_id = p_other_id) or (sender_id = p_other_id and recipient_id = v_me))),
                         '[]'::json));
end $$;

-- Send a message. To someone you're not in contact with yet, it becomes a
-- message request they accept or decline (if their privacy setting allows it).
-- Replying to a request accepts it. Sample students accept and reply once.
create or replace function send_message(p_token uuid, p_recipient_id uuid, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := _session_student(p_token);
  v_other  students := _other_student(v_me, p_recipient_id);
  v_body   text := trim(p_body);
  v_reason text;
  v_id     bigint;
begin
  if coalesce(v_body, '') = '' then
    raise exception 'Type a message first.';
  end if;
  if exists (select 1 from message_requests where sender_id = v_me and recipient_id = v_other.id and status = 'declined') then
    raise exception '% isn''t accepting messages from you.', split_part(v_other.full_name, ' ', 1);
  end if;

  -- Replying to their request accepts it.
  update message_requests set status = 'accepted'
    where sender_id = v_other.id and recipient_id = v_me and status = 'pending';

  if not _in_contact(v_me, v_other.id)
     and not exists (select 1 from message_requests where sender_id = v_me and recipient_id = v_other.id) then
    v_reason := _contact_block_reason(v_me, v_other);
    if v_reason is not null then
      raise exception '%', v_reason;
    end if;
    insert into message_requests (sender_id, recipient_id, status)
      values (v_me, v_other.id, case when v_other.user_id is null then 'accepted' else 'pending' end);
    perform _notify(v_other.id, 'message_request', _first_name(v_me) || ' sent you a message request.',
                    'messages', json_build_object('studentId', v_me)::jsonb);
  end if;

  insert into messages (sender_id, recipient_id, body) values (v_me, v_other.id, v_body) returning id into v_id;

  if v_other.user_id is null
     and not exists (select 1 from messages where sender_id = v_other.id and recipient_id = v_me) then
    insert into messages (sender_id, recipient_id, body, sent_at)
      values (v_other.id, v_me,
              'Hi! Thanks for reaching out. I''d love to study together. Want to set up a time?',
              now() + interval '1 second');
  end if;
  return v_id;
end $$;

-- Accept or decline a message request sent to you.
create or replace function respond_message_request(p_token uuid, p_other_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  update message_requests set status = case when p_accept then 'accepted' else 'declined' end
    where sender_id = p_other_id and recipient_id = v_me and status = 'pending';
  if not found then
    raise exception 'Message request not found.';
  end if;
  if p_accept then
    perform _notify(p_other_id, 'message_accepted', _first_name(v_me) || ' accepted your message request.',
                    'messages', json_build_object('studentId', v_me)::jsonb);
  end if;
end $$;

-- ===========================================================================
-- Friends

create or replace function my_friendships(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(json_build_object(
            'id', id, 'status', status, 'incoming', addressee_id = v_me,
            'other_id', case when requester_id = v_me then addressee_id else requester_id end))
          from friendships where v_me in (requester_id, addressee_id)), '[]'::json);
end $$;

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
    perform _notify(v_other.id, 'friend_accepted', _first_name(v_me) || ' accepted your friend request.', 'findFriends', '{"show":"friends"}');
    return 'accepted';
  end if;
  select status into v_status from friendships
    where (requester_id = v_me and addressee_id = v_other.id) or (requester_id = v_other.id and addressee_id = v_me);
  if v_status is not null then
    return v_status;
  end if;
  v_status := case when v_other.user_id is null then 'accepted' else 'pending' end;
  insert into friendships (requester_id, addressee_id, status) values (v_me, v_other.id, v_status);
  perform _notify(v_other.id, 'friend_request', _first_name(v_me) || ' sent you a friend request.', 'findFriends', '{"show":"requests"}');
  return v_status;
end $$;

-- Accept or decline a friend request sent to you.
create or replace function respond_friend(p_token uuid, p_friendship_id bigint, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me        uuid := _session_student(p_token);
  v_requester uuid;
begin
  select requester_id into v_requester from friendships
    where id = p_friendship_id and addressee_id = v_me and status = 'pending';
  if v_requester is null then
    raise exception 'Friend request not found.';
  end if;
  if p_accept then
    update friendships set status = 'accepted' where id = p_friendship_id;
    perform _notify(v_requester, 'friend_accepted', _first_name(v_me) || ' accepted your friend request.', 'findFriends', '{"show":"friends"}');
  else
    delete from friendships where id = p_friendship_id;
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

-- ===========================================================================
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
  update students set availability_updated_at = now() where id = v_me;
  return v_count;
end $$;

-- ===========================================================================
-- Meetups

create or replace function my_meetups(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(json_build_object(
            'id', m.id, 'scheduled_at', m.scheduled_at, 'duration_minutes', m.duration_minutes,
            'topic', m.topic, 'location', m.location, 'i_asked', m.requester_id = v_me,
            'status', case when m.status = 'requested' and m.scheduled_at < now() then 'expired' else m.status end,
            'my_feedback', case when m.requester_id = v_me then m.requester_feedback else m.partner_feedback end,
            'other_id', s.id, 'other_name', s.full_name, 'other_color', s.avatar_color)
          order by m.scheduled_at)
          from meetups m join students s on s.id = case when m.requester_id = v_me then m.partner_id else m.requester_id end
          where v_me in (m.requester_id, m.partner_id)), '[]'::json);
end $$;

-- Ask another student to meet (if their privacy setting allows it).
-- Sample students confirm straight away.
create or replace function request_meetup(p_token uuid, p_partner_id uuid, p_scheduled_at timestamptz,
                                          p_duration_minutes int, p_topic text, p_location text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := _session_student(p_token);
  v_other  students := _other_student(v_me, p_partner_id);
  v_reason text := _contact_block_reason(v_me, v_other);
  v_id     bigint;
begin
  if v_reason is not null then
    raise exception '%', replace(v_reason, 'messages', 'meetup invites');
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() then
    raise exception 'Pick a time in the future.';
  end if;
  if coalesce(trim(p_location), '') = '' then
    raise exception 'Pick a place to meet.';
  end if;
  insert into meetups (requester_id, partner_id, scheduled_at, duration_minutes, topic, location, status)
    values (v_me, v_other.id, p_scheduled_at, coalesce(p_duration_minutes, 60), nullif(trim(p_topic), ''), trim(p_location),
            case when v_other.user_id is null then 'confirmed' else 'requested' end)
    returning id into v_id;
  perform _notify(v_other.id, 'meetup_requested', _first_name(v_me) || ' wants to meet'
                  || coalesce(' about ' || nullif(trim(p_topic), ''), '') || '.', 'meetups', '{}');
  return v_id;
end $$;

-- Partner confirms; either side cancels.
create or replace function set_meetup_status(p_token uuid, p_meetup_id bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := _session_student(p_token);
  v_m     meetups;
  v_other uuid;
begin
  select * into v_m from meetups where id = p_meetup_id and v_me in (requester_id, partner_id);
  if v_m.id is null then
    raise exception 'Meetup not found.';
  end if;
  v_other := case when v_m.requester_id = v_me then v_m.partner_id else v_m.requester_id end;
  if not (
       (p_status = 'confirmed' and v_m.status = 'requested' and v_me = v_m.partner_id and v_m.scheduled_at > now())
    or (p_status = 'cancelled' and v_m.status in ('requested', 'confirmed'))
  ) then
    raise exception 'You can''t change this meetup to "%".', p_status;
  end if;
  update meetups set status = p_status where id = v_m.id;
  perform _notify(v_other, 'meetup_' || p_status,
                  _first_name(v_me) || case when p_status = 'confirmed' then ' confirmed your study session.'
                                            when v_m.status = 'requested' and v_me = v_m.partner_id then ' can''t make that time.'
                                            else ' cancelled your study session.' end,
                  'meetups', '{}');
end $$;

-- Suggest a different time. The other person then confirms it.
create or replace function propose_new_time(p_token uuid, p_meetup_id bigint, p_scheduled_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := _session_student(p_token);
  v_m     meetups;
  v_other uuid;
begin
  select * into v_m from meetups where id = p_meetup_id and v_me in (requester_id, partner_id);
  if v_m.id is null then
    raise exception 'Meetup not found.';
  end if;
  if v_m.status not in ('requested', 'confirmed') then
    raise exception 'This meetup can''t be changed anymore.';
  end if;
  if p_scheduled_at is null or p_scheduled_at < now() then
    raise exception 'Pick a time in the future.';
  end if;
  v_other := case when v_m.requester_id = v_me then v_m.partner_id else v_m.requester_id end;
  update meetups set scheduled_at = p_scheduled_at, requester_id = v_me, partner_id = v_other,
         status = case when (select user_id from students where id = v_other) is null then 'confirmed' else 'requested' end
    where id = v_m.id;
  perform _notify(v_other, 'meetup_new_time', _first_name(v_me) || ' suggested a new time for your study session.', 'meetups', '{}');
end $$;

-- After a meetup: "How did it go?" ('great', 'okay' or 'no_show'). Marks it completed.
create or replace function meetup_feedback(p_token uuid, p_meetup_id bigint, p_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
  v_m  meetups;
begin
  select * into v_m from meetups where id = p_meetup_id and v_me in (requester_id, partner_id);
  if v_m.id is null then
    raise exception 'Meetup not found.';
  end if;
  if v_m.status not in ('confirmed', 'completed') or v_m.scheduled_at > now() then
    raise exception 'You can only rate a meetup after it happens.';
  end if;
  if p_feedback not in ('great', 'okay', 'no_show') then
    raise exception 'Unknown answer.';
  end if;
  update meetups set status = 'completed',
    requester_feedback = case when requester_id = v_me then p_feedback else requester_feedback end,
    partner_feedback   = case when partner_id = v_me then p_feedback else partner_feedback end
    where id = v_m.id;
end $$;

-- ===========================================================================
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

-- Save or un-save a study guide. Returns true if it's now saved.
create or replace function toggle_saved_resource(p_token uuid, p_resource_id bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  delete from saved_resources where student_id = v_me and resource_id = p_resource_id;
  if found then
    return false;
  end if;
  insert into saved_resources (student_id, resource_id) values (v_me, p_resource_id);
  return true;
end $$;

create or replace function my_saved_resource_ids(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(resource_id) from saved_resources where student_id = v_me), '[]'::json);
end $$;

create or replace function report_resource(p_token uuid, p_resource_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Tell us what''s wrong with it.';
  end if;
  if not exists (select 1 from study_resources where id = p_resource_id) then
    raise exception 'That study guide no longer exists.';
  end if;
  insert into reports (reporter_id, resource_id, reason) values (v_me, p_resource_id, trim(p_reason));
end $$;

-- ===========================================================================
-- Block / report

-- Everyone you've messaged, met with or friended (for the Safety screen).
create or replace function my_contacts(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(distinct x.id) from (
    select case when sender_id = v_me then recipient_id else sender_id end as id from messages where v_me in (sender_id, recipient_id)
    union select case when requester_id = v_me then partner_id else requester_id end from meetups where v_me in (requester_id, partner_id)
    union select case when requester_id = v_me then addressee_id else requester_id end from friendships where v_me in (requester_id, addressee_id)
  ) x), '[]'::json);
end $$;

create or replace function my_blocks(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(json_build_object('blocked_id', b.blocked_id, 'name', s.full_name, 'color', s.avatar_color,
                                                     'is_report', b.is_report, 'reason', b.reason, 'created_at', b.created_at)
                                   order by b.created_at desc)
                   from user_blocks b join students s on s.id = b.blocked_id where b.blocker_id = v_me), '[]'::json);
end $$;

-- Block (and optionally report) a student: removes the friendship and cancels
-- upcoming meetups, so no contact can happen. A report goes to the admins.
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
  if p_is_report then
    insert into reports (reporter_id, student_id, reason) values (v_me, p_other_id, coalesce(nullif(trim(p_reason), ''), '(no reason given)'));
  end if;
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

-- ===========================================================================
-- Study groups (one per course, plus groups made by matching)

create or replace function my_groups(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(x order by x.kind, x.last_at desc nulls last, x.name) from (
    select g.id, g.kind, g.name,
           (select count(*) from group_members where group_id = g.id) as member_count,
           last.body as last_body, last.sent_at as last_at, last.sender_name,
           (select count(*) from group_messages gm where gm.group_id = g.id and gm.sent_at > mem.last_read_at
              and gm.sender_id <> v_me) as unread
    from group_members mem
    join study_groups g on g.id = mem.group_id
    left join lateral (select gm.body, gm.sent_at, split_part(s.full_name, ' ', 1) as sender_name
                       from group_messages gm join students s on s.id = gm.sender_id
                       where gm.group_id = g.id order by gm.sent_at desc limit 1) last on true
    where mem.student_id = v_me
  ) x), '[]'::json);
end $$;

-- A group's members and messages. Marks it read.
create or replace function group_detail(p_token uuid, p_group_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := _session_student(p_token);
  v_group study_groups;
begin
  select g.* into v_group from study_groups g
    join group_members m on m.group_id = g.id and m.student_id = v_me where g.id = p_group_id;
  if v_group.id is null then
    raise exception 'You''re not in that group.';
  end if;
  update group_members set last_read_at = now() where group_id = p_group_id and student_id = v_me;
  return json_build_object(
    'id', v_group.id, 'kind', v_group.kind, 'name', v_group.name,
    'members', (select json_agg(json_build_object('id', s.id, 'name', s.full_name, 'color', s.avatar_color,
                                                  'is_sample', s.user_id is null, 'last_active_at', s.last_active_at)
                                order by s.full_name)
                from group_members m join students s on s.id = m.student_id
                where m.group_id = p_group_id and not _is_blocked(v_me, s.id)),
    'messages', coalesce((select json_agg(json_build_object('id', gm.id, 'body', gm.body, 'sent_at', gm.sent_at,
                                                            'mine', gm.sender_id = v_me, 'sender_id', gm.sender_id,
                                                            'name', s.full_name, 'color', s.avatar_color) order by gm.sent_at)
                          from group_messages gm join students s on s.id = gm.sender_id
                          where gm.group_id = p_group_id and not _is_blocked(v_me, gm.sender_id)), '[]'::json));
end $$;

create or replace function send_group_message(p_token uuid, p_group_id bigint, p_body text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
  v_id bigint;
begin
  if not exists (select 1 from group_members where group_id = p_group_id and student_id = v_me) then
    raise exception 'You''re not in that group.';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Type a message first.';
  end if;
  insert into group_messages (group_id, sender_id, body) values (p_group_id, v_me, trim(p_body)) returning id into v_id;
  update group_members set last_read_at = now() where group_id = p_group_id and student_id = v_me;
  return v_id;
end $$;

-- Leave a match group. (Course groups follow the classes on your profile.)
create or replace function leave_group(p_token uuid, p_group_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  if exists (select 1 from study_groups where id = p_group_id and kind = 'course') then
    raise exception 'Course groups follow your classes. Remove the class from your profile to leave.';
  end if;
  delete from group_members where group_id = p_group_id and student_id = v_me;
end $$;

-- ===========================================================================
-- "Can't find anyone?" matching

-- Join the queue for a course or a topic. If anyone else is already waiting
-- for the same thing, everyone waiting is put into a new study group together.
-- Returns {"status": "waiting"} or {"status": "matched", "group_id": ...}.
create or replace function join_study_queue(p_token uuid, p_course_id bigint, p_skill_id bigint) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_me     uuid := _session_student(p_token);
  v_label  text;
  v_group  bigint;
  v_others uuid[];
  v_other  uuid;
begin
  if (p_course_id is null) = (p_skill_id is null) then
    raise exception 'Pick one class or one topic.';
  end if;
  v_label := coalesce((select code from courses where id = p_course_id), (select name from skills where id = p_skill_id));
  if v_label is null then
    raise exception 'Unknown class or topic.';
  end if;
  if exists (select 1 from study_queue where student_id = v_me and matched_group_id is null
             and created_at > now() - interval '7 days'
             and course_id is not distinct from p_course_id and skill_id is not distinct from p_skill_id) then
    return json_build_object('status', 'waiting');
  end if;

  select array_agg(student_id) into v_others from (
    select distinct on (q.student_id) q.student_id
    from study_queue q
    where q.matched_group_id is null and q.created_at > now() - interval '7 days'
      and q.student_id <> v_me and not _is_blocked(v_me, q.student_id)
      and q.course_id is not distinct from p_course_id and q.skill_id is not distinct from p_skill_id
    order by q.student_id, q.created_at
    limit 5
  ) w;

  if v_others is null then
    insert into study_queue (student_id, course_id, skill_id) values (v_me, p_course_id, p_skill_id);
    return json_build_object('status', 'waiting');
  end if;

  insert into study_groups (kind, course_id, skill_id, name)
    values ('match', p_course_id, p_skill_id, v_label || ' study match') returning id into v_group;
  insert into group_members (group_id, student_id)
    select v_group, x from unnest(v_others || v_me) x;
  update study_queue set matched_group_id = v_group
    where matched_group_id is null and student_id = any(v_others)
      and course_id is not distinct from p_course_id and skill_id is not distinct from p_skill_id;
  insert into study_queue (student_id, course_id, skill_id, matched_group_id) values (v_me, p_course_id, p_skill_id, v_group);
  foreach v_other in array v_others loop
    perform _notify(v_other, 'match_found', 'You were matched with others studying ' || v_label || '!',
                    'groups', json_build_object('groupId', v_group)::jsonb);
  end loop;
  return json_build_object('status', 'matched', 'group_id', v_group);
end $$;

create or replace function my_queue(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  return coalesce((select json_agg(json_build_object('id', q.id, 'label', coalesce(c.code, k.name), 'created_at', q.created_at)
                                   order by q.created_at)
                   from study_queue q left join courses c on c.id = q.course_id left join skills k on k.id = q.skill_id
                   where q.student_id = v_me and q.matched_group_id is null and q.created_at > now() - interval '7 days'),
                  '[]'::json);
end $$;

create or replace function leave_study_queue(p_token uuid, p_entry_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := _session_student(p_token);
begin
  delete from study_queue where id = p_entry_id and student_id = v_me and matched_group_id is null;
end $$;

-- ===========================================================================
-- Admin: reports

create or replace function admin_reports(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  perform _require_admin(p_token);
  return coalesce((select json_agg(json_build_object(
            'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'resolved_at', r.resolved_at,
            'reporter', rep.full_name,
            'student_name', s.full_name, 'resource_id', res.id, 'resource_title', res.title, 'resource_url', res.resource_url)
          order by r.resolved_at nulls first, r.created_at desc)
          from reports r
          join students rep on rep.id = r.reporter_id
          left join students s on s.id = r.student_id
          left join study_resources res on res.id = r.resource_id), '[]'::json);
end $$;

create or replace function resolve_report(p_token uuid, p_report_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin(p_token);
  update reports set resolved_at = now() where id = p_report_id;
end $$;

-- Remove a reported study guide (its reports are resolved with it).
create or replace function admin_delete_resource(p_token uuid, p_resource_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin(p_token);
  delete from study_resources where id = p_resource_id;
end $$;
