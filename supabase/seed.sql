-- IS-Connect sample data. Run after schema.sql, functions.sql and reference.sql.
-- Sample students have no login; they accept requests and reply automatically
-- so one tester can try every feature. The app labels them "Demo".

insert into students (id, full_name, avatar_color, program_status, graduation_year, looking_for_help_with, ask_me_about, bio, availability_updated_at, last_active_at, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'Emma Wilson',    '#2f4fb5', 'pre_is',  2029, 'Mostly JOINs and GROUP BY',  'how I color-code my Excel notes',   'Still figuring things out, too! Looking for someone to practice SQL with.', now(), now() - interval '2 hours', now() - interval '6 days'),
  ('00000000-0000-0000-0000-000000000002', 'Daniel Kim',     '#24543f', 'is_core', 2027, 'Subnetting',                 'building my first Python bot',      'Core student happy to help with Python and Excel.',                         now(), now() - interval '20 minutes', now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000000003', 'Sofia Martinez', '#a8431f', 'pre_is',  2029, 'Loops and functions',        'switching majors into IS',          'Learning one day at a time. Let''s build something small together.',         now(), now() - interval '1 day', now() - interval '4 days'),
  ('00000000-0000-0000-0000-000000000004', 'Alex Chen',      '#4a4f57', 'ta',      2026, 'Cloud deployments',          'surviving the IS core',             'Former IS 201 TA. Ask me about databases.',                                 now(), now() - interval '3 days', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000005', 'Maya Thompson',  '#7a3fa0', 'pre_is',  2029, 'Pivot tables',               'my favorite study spots on campus', 'Nervous about applying to the program, would love a study buddy.',          now(), now() - interval '5 hours', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000006', 'Jordan Reyes',   '#1f6f78', 'is_core', 2027, 'Hardware troubleshooting',   'the AIS club events',               'Sigue adelante! Happy to meet in the library.',                             now(), now() - interval '9 days', now() - interval '1 day');

-- (student number, class)
insert into student_courses (student_id, course_id)
select ('00000000-0000-0000-0000-00000000000' || s.n)::uuid, c.id
from (values (1, 'IS 201'), (1, 'IS 110'), (2, 'IS 303'), (2, 'IS 401'), (3, 'IS 201'),
             (4, 'IS 402'), (4, 'IS 405'), (5, 'IS 110'), (5, 'IS 201'), (6, 'IS 303')) s(n, code)
join courses c on c.code = s.code;

-- (student number, strength)
insert into student_skills (student_id, skill_id)
select ('00000000-0000-0000-0000-00000000000' || s.n)::uuid, k.id
from (values (1, 'Excel'), (2, 'Python'), (2, 'Excel'), (2, 'Data Analytics'), (3, 'Web Dev (HTML/CSS/JS)'),
             (4, 'SQL'), (4, 'AWS / Cloud'), (4, 'Python'), (4, 'Databases & ERDs'), (5, 'Data Analytics'),
             (6, 'Hardware'), (6, 'Networking')) s(n, name)
join skills k on k.name = s.name;

-- (student number, topic they need help with)
insert into student_needs (student_id, skill_id)
select ('00000000-0000-0000-0000-00000000000' || s.n)::uuid, k.id
from (values (1, 'SQL'), (2, 'Networking'), (3, 'Python'), (4, 'AWS / Cloud'), (5, 'Excel'),
             (5, 'SQL'), (6, 'Hardware')) s(n, name)
join skills k on k.name = s.name;

-- Course study groups for everyone's classes.
select _sync_course_groups(id) from students;

insert into group_messages (group_id, sender_id, body, sent_at)
select g.id, m.sender::uuid, m.body, now() - m.ago::interval
from (values ('IS 201', '00000000-0000-0000-0000-000000000001', 'Anyone else stuck on the ERD homework?', '1 day'),
             ('IS 201', '00000000-0000-0000-0000-000000000003', 'Yes! Want to meet in the library Thursday?', '20 hours'),
             ('IS 201', '00000000-0000-0000-0000-000000000005', 'I''m in. Thursday 1 PM works for me.', '18 hours')) m(code, sender, body, ago)
join courses c on c.code = m.code
join study_groups g on g.kind = 'course' and g.course_id = c.id;

-- People waiting in "Can't find anyone?" so pressing it finds a match.
insert into study_queue (student_id, course_id, skill_id)
select '00000000-0000-0000-0000-000000000005'::uuid, id, null from courses where code = 'IS 201'
union all
select '00000000-0000-0000-0000-000000000001'::uuid, null, id from skills where name = 'SQL';

insert into friendships (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'accepted'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'pending'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'pending');

insert into messages (sender_id, recipient_id, body, sent_at, read_at) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Hi Daniel! Could you help me with SQL joins this week?',      now() - interval '2 days', now()),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sure! Does Wednesday at 3 work?',                             now() - interval '2 days' + interval '10 minutes', now()),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'Hey Alex, what did you use to study for the IS 201 exam?',   now() - interval '1 day', now()),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'Practice problems! I uploaded my guide to Study Resources.', now() - interval '20 hours', now());

insert into availability_slots (student_id, day_of_week, start_time, duration_minutes) values
  ('00000000-0000-0000-0000-000000000001', 'Mon', '16:00', 60),
  ('00000000-0000-0000-0000-000000000001', 'Wed', '15:00', 60),
  ('00000000-0000-0000-0000-000000000002', 'Wed', '15:00', 90),
  ('00000000-0000-0000-0000-000000000003', 'Tue', '10:00', 60),
  ('00000000-0000-0000-0000-000000000004', 'Fri', '14:00', 60),
  ('00000000-0000-0000-0000-000000000002', 'Mon', '16:00', 60),
  ('00000000-0000-0000-0000-000000000003', 'Mon', '16:00', 60),
  ('00000000-0000-0000-0000-000000000003', 'Thu', '13:00', 60),
  ('00000000-0000-0000-0000-000000000004', 'Tue', '10:00', 60),
  ('00000000-0000-0000-0000-000000000005', 'Wed', '15:00', 60),
  ('00000000-0000-0000-0000-000000000005', 'Thu', '13:00', 60),
  ('00000000-0000-0000-0000-000000000006', 'Tue', '10:00', 60),
  ('00000000-0000-0000-0000-000000000006', 'Fri', '14:00', 60);

insert into meetups (requester_id, partner_id, scheduled_at, topic, location, status) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', now() + interval '2 days', 'SQL joins', 'Library, 2nd floor study room', 'confirmed'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', now() + interval '4 days', 'IS 201 exam prep', 'Business building commons', 'requested'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', now() - interval '3 days', null, 'Student center', 'completed');

insert into study_resources (uploader_id, title, course, resource_url) values
  ('00000000-0000-0000-0000-000000000004', 'IS 201 Exam 1 Study Guide',    'IS 201', 'https://example.com/is201-exam1-guide.pdf'),
  ('00000000-0000-0000-0000-000000000002', 'Excel Shortcuts Cheat Sheet',  'IS 110', 'https://example.com/excel-shortcuts.pdf'),
  ('00000000-0000-0000-0000-000000000006', 'Subnetting Practice Problems', 'IS 303', 'https://example.com/subnetting-practice.pdf'),
  ('00000000-0000-0000-0000-000000000001', 'SQL JOINs Cheat Sheet',        'IS 201', 'https://example.com/sql-joins-cheat-sheet.pdf'),
  ('00000000-0000-0000-0000-000000000003', 'Python Loops Practice Set',    'IS 201', 'https://example.com/python-loops-practice.pdf');

insert into user_blocks (blocker_id, blocked_id, is_report, reason) values
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', false, 'Not a good study fit'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', true,  'Sent spam links');
