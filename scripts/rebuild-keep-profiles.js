// One-off: rebuild the database from schema.sql + seed.sql while keeping the
// profiles already in `students`. Runs as one transaction, so if anything
// fails nothing changes.
// Usage: node --env-file=.env.local scripts/rebuild-keep-profiles.js

import { readFile } from 'node:fs/promises'
import pg from 'pg'

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query('begin')
  const { rows: keep } = await client.query(
    'select full_name, avatar_url, program_status, current_course, looking_for_help_with, bio, created_at from students order by created_at',
  )
  console.log(`Saved ${keep.length} existing profiles`)

  await client.query(await readFile('supabase/schema.sql', 'utf8'))
  await client.query(await readFile('supabase/seed.sql', 'utf8'))

  for (const r of keep) {
    await client.query(
      `insert into students (full_name, avatar_url, program_status, current_course, looking_for_help_with, bio, created_at)
       values ($1, $2, $3, $4, $5, $6, coalesce($7, now()))`,
      [
        r.full_name,
        r.avatar_url,
        ['pre_is', 'is_core'].includes(r.program_status) ? r.program_status : 'pre_is',
        r.current_course,
        r.looking_for_help_with,
        r.bio,
        r.created_at,
      ],
    )
  }

  await client.query('commit')
  await client.query("notify pgrst, 'reload schema'")
  const { rows } = await client.query('select (select count(*) from students) as students, (select count(*) from skills) as skills')
  console.log(`Done: ${rows[0].students} students (6 samples + your ${keep.length}), ${rows[0].skills} skills.`)
} catch (err) {
  await client.query('rollback')
  console.error(`Rolled back, nothing changed: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
