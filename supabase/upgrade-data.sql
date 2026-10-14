-- Runs last in `npm run db:upgrade` (after functions.sql). Fills in the new
-- profile fields for the six sample students, creates course study groups,
-- and adds a demo "Can't find anyone?" queue. Safe to re-run.

update students s set avatar_color = v.color, ask_me_about = coalesce(s.ask_me_about, v.ask),
       graduation_year = coalesce(s.graduation_year, v.year), last_active_at = coalesce(s.last_active_at, now() - v.active::interval),
       availability_updated_at = coalesce(s.availability_updated_at, now()),
       program_status = case when s.id = '00000000-0000-0000-0000-000000000004' then 'ta' else s.program_status end
from (values ('00000000-0000-0000-0000-000000000001', '#2f4fb5', 'how I color-code my Excel notes',   2029, '2 hours'),
             ('00000000-0000-0000-0000-000000000002', '#24543f', 'building my first Python bot',      2027, '20 minutes'),
             ('00000000-0000-0000-0000-000000000003', '#a8431f', 'switching majors into IS',          2029, '1 day'),
             ('00000000-0000-0000-0000-000000000004', '#4a4f57', 'surviving the IS core',             2026, '3 days'),
             ('00000000-0000-0000-0000-000000000005', '#7a3fa0', 'my favorite study spots on campus', 2029, '5 hours'),
             ('00000000-0000-0000-0000-000000000006', '#1f6f78', 'the AIS club events',               2027, '9 days')) v(id, color, ask, year, active)
where s.id = v.id::uuid and s.user_id is null;

insert into student_courses (student_id, course_id)
select ('00000000-0000-0000-0000-00000000000' || s.n)::uuid, c.id
from (values (1, 'IS 201'), (1, 'IS 110'), (2, 'IS 303'), (2, 'IS 401'), (3, 'IS 201'),
             (4, 'IS 402'), (4, 'IS 405'), (5, 'IS 110'), (5, 'IS 201'), (6, 'IS 303')) s(n, code)
join courses c on c.code = s.code
where exists (select 1 from students where id = ('00000000-0000-0000-0000-00000000000' || s.n)::uuid)
on conflict do nothing;

insert into student_needs (student_id, skill_id)
select ('00000000-0000-0000-0000-00000000000' || s.n)::uuid, k.id
from (values (1, 'SQL'), (2, 'Networking'), (3, 'Python'), (4, 'AWS / Cloud'), (5, 'Excel'),
             (5, 'SQL'), (6, 'Hardware')) s(n, name)
join skills k on k.name = s.name
where exists (select 1 from students where id = ('00000000-0000-0000-0000-00000000000' || s.n)::uuid)
on conflict do nothing;

select _sync_course_groups(id) from students;

insert into group_messages (group_id, sender_id, body, sent_at)
select g.id, m.sender::uuid, m.body, now() - m.ago::interval
from (values ('IS 201', '00000000-0000-0000-0000-000000000001', 'Anyone else stuck on the ERD homework?', '1 day'),
             ('IS 201', '00000000-0000-0000-0000-000000000003', 'Yes! Want to meet in the library Thursday?', '20 hours'),
             ('IS 201', '00000000-0000-0000-0000-000000000005', 'I''m in. Thursday 1 PM works for me.', '18 hours')) m(code, sender, body, ago)
join courses c on c.code = m.code
join study_groups g on g.kind = 'course' and g.course_id = c.id
where not exists (select 1 from group_messages where group_id = g.id)
  and exists (select 1 from group_members gm where gm.group_id = g.id and gm.student_id = m.sender::uuid);

insert into study_queue (student_id, course_id, skill_id)
select '00000000-0000-0000-0000-000000000005'::uuid, id, null from courses
where code = 'IS 201' and exists (select 1 from students where id = '00000000-0000-0000-0000-000000000005')
  and not exists (select 1 from study_queue where student_id = '00000000-0000-0000-0000-000000000005' and matched_group_id is null)
union all
select '00000000-0000-0000-0000-000000000001'::uuid, null, id from skills
where name = 'SQL' and exists (select 1 from students where id = '00000000-0000-0000-0000-000000000001')
  and not exists (select 1 from study_queue where student_id = '00000000-0000-0000-0000-000000000001' and matched_group_id is null);
