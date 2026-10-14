# IS-Connect

A web app that helps pre-IS students find classmates to study with, ask for help, and feel like they belong in the Information Systems program.

**Team:** Reece Bunnage · Josh Graham · Abby Cook · Jeremiah Gallardo

## App Summary

Many pre-IS students want to join the Information Systems program but feel less technical than their peers. They are busy and nervous to ask strangers for help, so they end up studying alone and some give up on applying. IS-Connect gives these students a low-pressure way to find someone in a similar situation. A student creates a short profile: Pre-IS, IS Core, IS Minor or TA, every IS class they're taking, the topics they need help with, and their strengths (Python, SQL, Excel, etc.). **Find Friends** ranks other students by how well they match (shared classes, strengths that cover your needs, overlapping free time) and explains why. If nobody fits, **Can't find anyone?** puts students who ask for the same class or topic into a study group together. Students can also add friends, send messages (first messages from strangers arrive as requests), join a study group for each of their classes, schedule study sessions, share and save study guides, get in-app notifications, choose who can contact them, and block or report someone. Everything a logged-in student does is saved to a real Postgres database. The screens follow our Module 4 design sprint specs and the IS Together mockup.

## ERD

GitHub draws this diagram from [docs/erd.mmd](docs/erd.mmd). [docs/erd.dbml](docs/erd.dbml) has the same model for [dbdiagram.io](https://dbdiagram.io).

```mermaid
erDiagram
    app_users ||--o| students : "1-to-0..1: owns profile"
    app_users ||--o{ app_sessions : "1-to-many: logged-in browsers"
    students ||--o{ student_skills : "M:N with skills: strong in"
    skills ||--o{ student_skills : "M:N with students"
    students ||--o{ student_needs : "M:N with skills: needs help with"
    skills ||--o{ student_needs : "M:N with students"
    students ||--o{ student_courses : "M:N with courses: takes"
    courses ||--o{ student_courses : "M:N with students"
    students ||--o{ availability_slots : "1-to-many: is free during"
    students ||--o{ study_resources : "1-to-many: shares"
    students ||--o{ saved_resources : "M:N with study_resources: saves"
    study_resources ||--o{ saved_resources : "M:N with students"
    students ||--o{ friendships : "1-to-many: sends / receives (2 FKs)"
    students ||--o{ messages : "1-to-many: sends / receives (2 FKs)"
    students ||--o{ message_requests : "1-to-many: sends / receives (2 FKs)"
    students ||--o{ meetups : "1-to-many: requests / is partner (2 FKs)"
    students ||--o{ user_blocks : "1-to-many: blocks / is blocked (2 FKs)"
    students ||--o{ reports : "1-to-many: reports / is reported"
    study_resources ||--o{ reports : "1-to-many: is reported"
    students ||--o{ notifications : "1-to-many: receives"
    courses ||--o{ study_groups : "1-to-many: has a course group"
    skills ||--o{ study_groups : "1-to-many: topic of match groups"
    study_groups ||--o{ group_members : "M:N with students"
    students ||--o{ group_members : "M:N with study_groups: belongs to"
    study_groups ||--o{ group_messages : "1-to-many: contains"
    students ||--o{ group_messages : "1-to-many: posts"
    students ||--o{ study_queue : "1-to-many: waits for a match"
    courses ||--o{ study_queue : "1-to-many: match on class"
    skills ||--o{ study_queue : "1-to-many: match on topic"
    study_groups ||--o{ study_queue : "1-to-many: matched into"

    app_users {
        uuid id PK
        text username UK
        text password_hash "bcrypt"
        text recovery_hash "bcrypt, one-time code"
        boolean is_admin
        timestamptz created_at
    }
    app_sessions {
        uuid token PK
        uuid user_id FK
        timestamptz created_at
    }
    students {
        uuid id PK
        uuid user_id FK,UK "null for demo students"
        text full_name
        text avatar_color
        text program_status "pre_is, is_core, is_minor, ta"
        int graduation_year
        text looking_for_help_with "optional note"
        text ask_me_about "icebreaker"
        text bio
        text contact_setting "anyone, courses, friends"
        timestamptz availability_updated_at
        timestamptz last_active_at
        timestamptz created_at
    }
    skills {
        bigint id PK
        text name UK "Python, SQL, Excel..."
    }
    courses {
        bigint id PK
        text code UK "IS 201"
        text name
    }
    student_skills {
        uuid student_id PK,FK
        bigint skill_id PK,FK
    }
    student_needs {
        uuid student_id PK,FK
        bigint skill_id PK,FK
    }
    student_courses {
        uuid student_id PK,FK
        bigint course_id PK,FK
    }
    availability_slots {
        bigint id PK
        uuid student_id FK
        text day_of_week "Mon..Sun"
        time start_time
        int duration_minutes
    }
    study_resources {
        bigint id PK
        uuid uploader_id FK
        text title
        text course "a courses.code"
        text resource_url
        timestamptz uploaded_at
    }
    saved_resources {
        uuid student_id PK,FK
        bigint resource_id PK,FK
    }
    friendships {
        bigint id PK
        uuid requester_id FK
        uuid addressee_id FK
        text status "pending or accepted"
        timestamptz created_at
    }
    messages {
        bigint id PK
        uuid sender_id FK
        uuid recipient_id FK
        text body
        timestamptz sent_at
        timestamptz read_at
    }
    message_requests {
        uuid sender_id PK,FK
        uuid recipient_id PK,FK
        text status "pending, accepted, declined"
        timestamptz created_at
    }
    meetups {
        bigint id PK
        uuid requester_id FK
        uuid partner_id FK
        timestamptz scheduled_at
        int duration_minutes
        text topic
        text location
        text status "requested, confirmed, completed, cancelled"
        text requester_feedback
        text partner_feedback
        timestamptz created_at
    }
    user_blocks {
        bigint id PK
        uuid blocker_id FK
        uuid blocked_id FK
        boolean is_report
        text reason
        timestamptz created_at
    }
    reports {
        bigint id PK
        uuid reporter_id FK
        uuid student_id FK "or"
        bigint resource_id FK "or"
        text reason
        timestamptz created_at
        timestamptz resolved_at
    }
    notifications {
        bigint id PK
        uuid student_id FK
        text kind
        text body
        text screen
        jsonb params
        timestamptz created_at
        timestamptz read_at
    }
    study_groups {
        bigint id PK
        text kind "course or match"
        bigint course_id FK
        bigint skill_id FK
        text name
        timestamptz created_at
    }
    group_members {
        bigint group_id PK,FK
        uuid student_id PK,FK
        timestamptz joined_at
        timestamptz last_read_at
    }
    group_messages {
        bigint id PK
        bigint group_id FK
        uuid sender_id FK
        text body
        timestamptz sent_at
    }
    study_queue {
        bigint id PK
        uuid student_id FK
        bigint course_id FK "or"
        bigint skill_id FK "or"
        bigint matched_group_id FK
        timestamptz created_at
    }
```

| Entity | What it stores |
|---|---|
| `app_users`, `app_sessions` | Logins (username, bcrypt-hashed password and recovery code, admin flag) and logged-in browsers |
| `students` | A profile: name, avatar color, program, graduation year, bio, "ask me about", who can contact them, last active |
| `skills`, `courses` | The lists of IS topics and IS classes |
| `student_skills`, `student_needs`, `student_courses` | Join tables: a student's strengths, the topics they need help with, and their classes |
| `availability_slots` | A weekly time a student is free to study |
| `friendships` | A friend request between two students, and whether it was accepted |
| `messages`, `message_requests` | One-on-one messages (with read time), and first messages from non-friends waiting to be accepted |
| `meetups` | A study session: when, how long, topic, where, status, and each side's "how did it go?" |
| `study_groups`, `group_members`, `group_messages` | One group per class plus groups made by matching, their members and chat |
| `study_queue` | Students waiting in "Can't find anyone?" for a class or topic |
| `notifications` | Things that happened involving a student (requests, accepted, matched...) |
| `study_resources`, `saved_resources` | Shared study-guide links, and the ones each student saved |
| `user_blocks`, `reports` | Blocks between students, and reports of students or study guides for admins |

**Key relationships**
- `students` **many-to-many** `courses` (through `student_courses`) and `skills` (twice: `student_skills` for strengths, `student_needs` for needs). Matching compares these.
- `students` **many-to-many** `study_groups` through `group_members`. Every class has exactly one course group (`one_group_per_course` unique index).
- `students` **many-to-many** `students` through `friendships`, `messages`, `message_requests`, `meetups` and `user_blocks`: each has two foreign keys to `students`.
- `app_users` **one-to-zero-or-one** `students`: a login has at most one profile. Demo students have no login.

**Privacy:** only profiles, classes, topics, free times and study guides are publicly readable. Everything else (messages, friendships, meetups, groups, notifications, blocks, reports) has no public access at all and is read through functions that check the user's login.

## Tech Stack

| Layer | What we used |
|---|---|
| Frontend | React 19 + Vite (HTML/CSS/JavaScript) |
| Backend / API | [Supabase](https://supabase.com), backend as a service. It generates a REST API from our tables, and we call it with the `@supabase/supabase-js` client. |
| Database | PostgreSQL, hosted by Supabase, with Row Level Security policies |
| Secrets | The Supabase URL and publishable key live in `.env.local`, which is listed in `.gitignore` |

**Why this fits our team:** Supabase's free tier gives us a real PostgreSQL database without running or hosting our own server. Every teammate can see the tables and rows in the Supabase dashboard, and we can still write the schema ourselves in SQL ([supabase/schema.sql](supabase/schema.sql)). The whole team shares one project, so our setups can't drift apart. React + Vite is a small, fast setup that works well on phones, which matters because our persona would mostly use IS-Connect on their phone.

## How to Get It Running

**Just want to use it?** The live site is at https://reece-bunnage.github.io/IS-Connect/. No install needed.

To run it on your own computer, you need [Node.js](https://nodejs.org) 22 or newer and [Git](https://git-scm.com).

1. **Get the code**
   ```bash
   git clone https://github.com/Reece-Bunnage/IS-Connect.git
   cd IS-Connect
   npm install
   ```
2. **Add your keys**
   1. In Supabase, click **Connect** (or go to **Project Settings → API**) and copy the **Project URL** and the **publishable / anon** key. Never use the `service_role` / secret key.
   2. Copy `.env.example` to a new file named `.env.local` and paste in the two values:
      ```
      VITE_SUPABASE_URL=https://your-project-ref.supabase.co
      VITE_SUPABASE_ANON_KEY=sb_publishable_...
      ```
   `.env.local` stays on your computer (it's in `.gitignore`). Never put real values in `.env.example`, because that file is public on GitHub.
3. **Set up the database** (skip if you are using the team's existing Supabase project, which is already set up)
   1. Create a free project at [supabase.com](https://supabase.com) and note its **database password**. If you've lost it, use **Project Settings → Database → Reset database password**, and pick one with only letters and numbers.
   2. In Supabase, click **Connect → Session pooler** and copy the connection string. Add it to `.env.local` as one more line, with your password in place of `[YOUR-PASSWORD]` (remove the brackets too):
      ```
      SUPABASE_DB_URL=postgresql://postgres.your-project-ref:yourpassword@aws-1-us-west-2.pooler.supabase.com:5432/postgres
      ```
      Copy the string from **Connect** rather than typing it, because the project ID and server address (`aws-0`/`aws-1`, region) differ per project.
   3. Run the command that matches your database:

      | Your database | Command | What happens to existing data |
      |---|---|---|
      | Brand new, no tables yet | `npm run db:setup` | Nothing to lose. Creates all tables, functions and sample data. |
      | Already set up, but [supabase/functions.sql](supabase/functions.sql) changed | `npm run db:functions` | **Keeps all data.** Only updates the database functions. |
      | Set up before the October 2026 social features (no `courses` table) | `npm run db:upgrade` | **Keeps all data.** Adds the new tables and columns, moves each old "current course" into the classes list, and locks private tables. |
      | Has tables you want to keep profiles from (e.g. made by hand in the Table Editor) | `node --env-file=.env.local scripts/rebuild-keep-profiles.js` | Keeps every row in `students`, rebuilds everything else. If anything fails, nothing changes. |
      | Start completely over | `npm run db:setup -- --reset` | **Deletes all data**, including logins, then rebuilds with sample data. |

   (No terminal? Paste [supabase/schema.sql](supabase/schema.sql), [supabase/functions.sql](supabase/functions.sql), [supabase/reference.sql](supabase/reference.sql), then [supabase/seed.sql](supabase/seed.sql) into **SQL Editor → New query** and click **Run** for each. `schema.sql` deletes existing data; the others are safe to re-run.)

   Not sure what's in your database? Look at **Table Editor** in Supabase. A complete setup has the 22 tables listed in the ERD above. The course list lives in [supabase/reference.sql](supabase/reference.sql); edit the names to match the catalog and re-run it.
4. **Make yourself an admin** (optional): sign up in the app, then run `npm run make-admin -- yourusername`. Admins see a **Reports** screen with reports of students and study guides. `--remove` takes it away.
5. **Start the app**
   ```bash
   npm run dev
   ```
   Open the `http://localhost:5173` link that it prints.

### Deploying

Every push to `main` rebuilds the live site through [.github/workflows/deploy.yml](.github/workflows/deploy.yml). One-time setup on GitHub:

1. **Settings → Secrets and variables → Actions → New repository secret**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (same values as `.env.local`).
2. **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
3. **Actions → Deploy to GitHub Pages → Run workflow** (or just push to `main`).

## Verifying the Vertical Slice

**How saving works:** users log in with a username and password. Logins are stored in `app_users`, with passwords hashed using bcrypt. The website's public key can only **read** public profile data; every save, and every read of private data like messages, goes through a function in [supabase/functions.sql](supabase/functions.sql) (`save_profile`, `send_message`, `my_inbox`, `join_study_queue`, ...). Each function checks the user's login token, so people can only see and change their own data.

**Demo students** (Emma, Daniel, Sofia, Alex, Maya, Jordan) are marked **Demo** and have no login. So one tester can try every feature alone, they accept friend requests and meetups automatically and reply once to a first message. Maya is waiting for an IS 201 match and Emma for a SQL match.

Try this walkthrough on the live site:

1. **Sign up.** Click **New here? Sign up**, pick a username and password, and save the **recovery code** it shows you.
2. **Set up your profile.** The 3 steps ask about you (avatar color, program, graduation year, bio), your classes (pick **IS 201** and one more), and your strengths and needs (need **SQL**). Home shows your **Profile strength** and what's missing.
3. **Set your free times.** In **Availability**, pick **Mon** and tap **4:00 PM**, then **Save & find a partner →**.
4. **Find a partner.** **Find Friends** sorts by **Best match** and explains each one, e.g. "In IS 201 with you · Strong in SQL, which you need · Free together Mon 4:00 PM". Try the search box and filters.
5. **Get matched.** At the bottom, under **Can't find anyone?**, choose **IS 201** and click **Match me**. Maya is already waiting, so you land in a new study group together.
6. **Study groups.** **Study Groups** also lists the **IS 201 study group** you joined by adding the class. Post a message there.
7. **Message someone.** Message Emma. Her reply appears a moment later and the **Messages** badge counts it.
8. **Message requests and privacy.** With a second account in a different browser, message your first account: it arrives under **Requests**, not Chats. In **Safety & Privacy**, try **Friends only**, and the second account gets "only accepts messages from friends".
9. **Schedule a meetup.** From the chat, click **Schedule a meetup →**, pick the shared time, a length, a topic and a place, then **Send request**. In **My Meetups**, try **Suggest new time**.
10. **Notifications.** Actions involving you (friend requests, accepted requests, matches, meetup invites) show on the bell 🔔. A confirmed meetup in the next 24 hours shows as a reminder.
11. **Study guides.** Share one for IS 201, **☆ Save** someone else's, and filter by **Saved** or **My classes**. **Report** sends it to the admins.
12. **Block someone.** In **Safety & Privacy**, block Emma, confirm, then **Undo** from the message at the bottom of the screen.
13. **Refresh, log out, log back in.** Everything is still there. **Forgot password?** on the login screen works with your recovery code.
