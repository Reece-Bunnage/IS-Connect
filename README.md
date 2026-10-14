# IS-Connect

A web app that helps pre-IS students find classmates to study with, ask for help, and feel like they belong in the Information Systems program.

**Team:** Reece Bunnage · Josh Graham · Abby Cook · Jeremiah Gallardo

## App Summary

Many pre-IS students want to join the Information Systems program but feel less technical than their peers. They are busy and nervous to ask strangers for help, so they end up studying alone and some give up on applying. IS-Connect gives these students a low-pressure way to find someone in a similar situation. A student creates a short profile that says whether they are Pre-IS or in the IS Core, which course they are taking, what they need help with, and what their strengths are (Python, SQL, Excel, etc.). Other students can browse and filter those profiles in **Find Friends** to find a study partner who can help with exactly what they are stuck on. Students can also add friends, chat one-on-one, set their weekly free times, schedule a study session at a time they're both free, share study-guide links, see a daily IS tip, and block or report someone. Everything a logged-in student does is saved to a real Postgres database. The screens follow our Module 4 design sprint specs and the IS Together mockup.

## ERD

![IS-Connect ERD](docs/erd.png)

Source files: [docs/erd.mmd](docs/erd.mmd) (Mermaid) and [docs/erd.dbml](docs/erd.dbml) (paste into [dbdiagram.io](https://dbdiagram.io) to edit).

| Entity | What it stores |
|---|---|
| `students` | A person using the app: name, Pre-IS or IS Core, current course, what they need help with |
| `skills` | An IS strength a student can list, such as Python or SQL |
| `student_skills` | Join table linking students to their strengths |
| `friendships` | A friend request between two students, and whether it was accepted |
| `messages` | A one-on-one chat message from one student to another |
| `availability_slots` | A weekly time a student is free to study |
| `meetups` | A study session between two students: when, where, and its status |
| `study_resources` | A study guide or file a student shared |
| `user_blocks` | A block or report of one student by another |

**Relationships**
- `students` **one-to-many** `availability_slots`: a student can list many free times.
- `students` **one-to-many** `study_resources`: a student can upload many study guides.
- `students` **many-to-many** `skills`, through `student_skills`: a student has many strengths, and a strength belongs to many students.
- `students` **many-to-many** `students`, through `friendships`, `messages`, `meetups`, and `user_blocks`: each of these tables has two foreign keys to `students` (for example, sender and recipient). From the `students` side, each link is one-to-many.

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
      | Has tables you want to keep profiles from (e.g. made by hand in the Table Editor) | `node --env-file=.env.local scripts/rebuild-keep-profiles.js` | Keeps every row in `students`, rebuilds everything else. If anything fails, nothing changes. |
      | Start completely over | `npm run db:setup -- --reset` | **Deletes all data**, including logins, then rebuilds with sample data. |

   (No terminal? Paste [supabase/schema.sql](supabase/schema.sql), then [supabase/functions.sql](supabase/functions.sql), then [supabase/seed.sql](supabase/seed.sql) into **SQL Editor → New query** and click **Run** for each. `schema.sql` deletes existing data; `functions.sql` alone is safe to re-run.)

   Not sure what's in your database? Look at **Table Editor** in Supabase. A complete setup has `app_users`, `app_sessions`, `students`, `skills`, `student_skills`, `friendships`, `messages`, `availability_slots`, `meetups`, `study_resources` and `user_blocks`.
4. **Start the app**
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

**How saving works:** users log in with a username and password. Logins are stored in `app_users`, with passwords hashed using bcrypt. The website's public key can **read** the app tables but can't write to them. Every save goes through a function in [supabase/functions.sql](supabase/functions.sql) (`save_profile`, `send_message`, `request_meetup`, …). Each function checks the user's login token, so people can only change their own data.

**Sample students** (Emma, Daniel, Sofia, Alex, Maya, Jordan) have no login. So one tester can try every feature alone, they accept friend requests and meetups automatically and reply once to a first message.

Try this walkthrough on the live site:

1. **Sign up.** Click **New here? Sign up** and pick a username and password. Your `@username` shows at the top.
2. **Make your profile.** Click **Create your profile →**, choose Pre-IS or IS Core, enter `IS 201`, pick strengths, and save. **My Profile** shows the row read back from the database.
3. **Set your free times.** In **Availability**, pick **Mon** and tap **4:00 PM**, then click **Save & find a partner →**.
4. **Find a partner.** **Find Friends** opens with **Free when I'm free** on, showing Daniel and Sofia with "Free together: Mon 4:00 PM". Try the course filter (`IS 201`) and the program filter too.
5. **Add a friend.** Click **+ Add friend** on Emma. It changes to **✓ Friends**, and she shows under **My friends**.
6. **Message someone.** Click **Message** on Emma, send "Hi!", and her reply appears a moment later.
7. **Schedule a meetup.** Click **Schedule a meetup →**, pick the shared time and a place, then **Review & confirm →** and **Send request**. **My Meetups** lists it as *Confirmed*.
8. **Share a study guide.** In **Study Resources**, click **+ Share a study guide**, add a title, `IS 201` and any `https://` link. Filter by IS 201 to find it, then delete it.
9. **Block someone.** In **Safety & Privacy**, block Emma. She disappears from Find Friends and Messages, and you can't message her. Unblock her from the **Blocked** list.
10. **Refresh at any point.** You stay logged in on the same screen, and everything you did is still there, loaded from the database.
11. **Log out and back in.** Everything is still there.

Two real users can also try it together: one sends a friend or meetup request, and the other sees it on **Home** and accepts or confirms it.
