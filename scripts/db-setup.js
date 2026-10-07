// Creates the IS-Connect tables in Supabase and loads the sample data.
// Usage: npm run db:setup            (first-time setup)
//        npm run db:setup -- --reset (wipe and rebuild an existing database)
// Needs SUPABASE_DB_URL in .env.local (Supabase -> Connect -> Session pooler).

import { readFile } from 'node:fs/promises'
import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Missing SUPABASE_DB_URL in .env.local (Supabase -> Connect -> Session pooler).')
  process.exit(1)
}

const reset = process.argv.includes('--reset')
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()

  // schema.sql drops every table, so don't silently wipe real user data.
  const { rows } = await client.query("select to_regclass('public.students') is not null as exists")
  if (rows[0].exists && !reset) {
    console.error('Tables already exist. Use scripts/rebuild-keep-profiles.js to keep profiles, or --reset to wipe ALL data.')
    process.exit(1)
  }

  for (const file of ['supabase/schema.sql', 'supabase/seed.sql']) {
    await client.query(await readFile(file, 'utf8'))
    console.log(`Ran ${file}`)
  }

  // Make PostgREST pick up the new tables immediately.
  await client.query("notify pgrst, 'reload schema'")

  const { rows: counts } = await client.query(
    'select (select count(*) from students) as students, (select count(*) from skills) as skills',
  )
  console.log(`Done: ${counts[0].students} students, ${counts[0].skills} skills.`)
} catch (err) {
  console.error(`Database setup failed: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
