-- IS-Connect sample data. Run after schema.sql.

insert into skills (id, name) values
  (1, 'Python'), (2, 'SQL'), (3, 'Excel'), (4, 'Hardware'),
  (5, 'Networking'), (6, 'Web Dev (HTML/CSS/JS)'), (7, 'Data Analytics'), (8, 'AWS / Cloud');
select setval(pg_get_serial_sequence('skills', 'id'), 8);

insert into students (id, full_name, program_status, current_course, looking_for_help_with, bio, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'Emma Wilson',    'pre_is',  'IS 201', 'SQL joins',                'Still figuring things out, too! Looking for someone to practice SQL with.', now() - interval '6 days'),
  ('00000000-0000-0000-0000-000000000002', 'Daniel Kim',     'is_core', 'IS 303', 'Networking subnetting',    'Core student happy to help with Python and Excel.',                         now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000000003', 'Sofia Martinez', 'pre_is',  'IS 201', 'Python loops',             'Learning one day at a time. Let''s build something small together.',         now() - interval '4 days'),
  ('00000000-0000-0000-0000-000000000004', 'Alex Chen',      'is_core', 'IS 402', 'Cloud deployments',        'Former IS 201 TA. Ask me about databases.',                                 now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000005', 'Maya Thompson',  'pre_is',  'IS 110', 'Excel pivot tables',       'Nervous about applying to the program, would love a study buddy.',          now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000006', 'Jordan Reyes',   'is_core', 'IS 303', 'Hardware troubleshooting', 'Sigue adelante! Happy to meet in the library.',                             now() - interval '1 day');

insert into student_skills (student_id, skill_id) values
  ('00000000-0000-0000-0000-000000000001', 3),
  ('00000000-0000-0000-0000-000000000002', 1), ('00000000-0000-0000-0000-000000000002', 3), ('00000000-0000-0000-0000-000000000002', 7),
  ('00000000-0000-0000-0000-000000000003', 6),
  ('00000000-0000-0000-0000-000000000004', 2), ('00000000-0000-0000-0000-000000000004', 8), ('00000000-0000-0000-0000-000000000004', 1),
  ('00000000-0000-0000-0000-000000000005', 7),
  ('00000000-0000-0000-0000-000000000006', 4), ('00000000-0000-0000-0000-000000000006', 5);

insert into friendships (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'accepted'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'accepted'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'pending'),
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000003', 'pending');

insert into messages (sender_id, recipient_id, body, sent_at) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Hi Daniel! Could you help me with SQL joins this week?',      now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sure! Does Wednesday at 3 work?',                             now() - interval '2 days' + interval '10 minutes'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', 'Hey Alex, what did you use to study for the IS 201 exam?',   now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'Practice problems! I uploaded my guide to Study Resources.', now() - interval '20 hours');

insert into availability_slots (student_id, day_of_week, start_time, duration_minutes) values
  ('00000000-0000-0000-0000-000000000001', 'Mon', '16:00', 60),
  ('00000000-0000-0000-0000-000000000001', 'Wed', '15:00', 60),
  ('00000000-0000-0000-0000-000000000002', 'Wed', '15:00', 90),
  ('00000000-0000-0000-0000-000000000003', 'Tue', '10:00', 60),
  ('00000000-0000-0000-0000-000000000004', 'Fri', '14:00', 60);

insert into meetups (requester_id, partner_id, scheduled_at, location, status) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', now() + interval '2 days', 'Library, 2nd floor study room', 'confirmed'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004', now() + interval '4 days', 'Business building commons',    'requested'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000006', now() - interval '3 days', 'Student center',                'completed');

insert into study_resources (uploader_id, title, course, resource_url) values
  ('00000000-0000-0000-0000-000000000004', 'IS 201 Exam 1 Study Guide',    'IS 201', 'https://example.com/is201-exam1-guide.pdf'),
  ('00000000-0000-0000-0000-000000000002', 'Excel Shortcuts Cheat Sheet',  'IS 110', 'https://example.com/excel-shortcuts.pdf'),
  ('00000000-0000-0000-0000-000000000006', 'Subnetting Practice Problems', 'IS 303', 'https://example.com/subnetting-practice.pdf');

insert into user_blocks (blocker_id, blocked_id, is_report, reason) values
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004', false, 'Not a good study fit'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000006', true,  'Sent spam links');
