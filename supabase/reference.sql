-- Reference lists: IS classes and topics (strengths / needs).
-- Safe to re-run; it only adds what's missing. Edit the course names to match the catalog.

insert into courses (code, name) values
  ('IS 110', 'Spreadsheet Skills'),
  ('IS 201', 'Introduction to Information Systems'),
  ('IS 303', 'Business Programming'),
  ('IS 401', 'Systems Analysis & Design'),
  ('IS 402', 'Database Systems'),
  ('IS 403', 'Web Development'),
  ('IS 404', 'Data Analytics'),
  ('IS 405', 'Cloud & Infrastructure'),
  ('IS 413', 'Enterprise Application Development'),
  ('IS 414', 'Information Security'),
  ('IS 415', 'Data Mining'),
  ('IS 455', 'Machine Learning')
on conflict (code) do update set name = excluded.name where courses.name = courses.code;

insert into skills (name) values
  ('Python'), ('SQL'), ('Excel'), ('Hardware'), ('Networking'), ('Web Dev (HTML/CSS/JS)'),
  ('Data Analytics'), ('AWS / Cloud'), ('Databases & ERDs'), ('Statistics'), ('Systems Analysis'),
  ('Cybersecurity'), ('C# / Java'), ('Career prep (resumes, interviews)')
on conflict (name) do nothing;
