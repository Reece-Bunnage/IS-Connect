// Give someone a temporary password from the command line, e.g. when the
// only admin is locked out: npm run reset-password -- <username>
// Same as "Set temporary password" on the Reports screen: it works for 48
// hours, they choose a new password when they log in with it, and they're
// logged out everywhere now. Needs SUPABASE_DB_URL in .env.local.
import pg from 'pg'

const username = process.argv[2]?.toLowerCase()
if (!username || username.startsWith('--')) {
  console.error('Usage: npm run reset-password -- <username>')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await client.query('begin')
  await client.query('set local search_path = public, extensions')
  const { rows } = await client.query(
    `with t as (select _new_temp_password() as temp)
     update app_users set password_hash = crypt(t.temp, gen_salt('bf')), must_change_password = true,
                          temp_password_expires_at = now() + interval '48 hours'
     from t where username = $1
     returning app_users.id, t.temp`,
    [username],
  )
  if (!rows.length) {
    await client.query('rollback')
    console.log(`No user named @${username}.`)
  } else {
    await client.query('delete from app_sessions where user_id = $1', [rows[0].id])
    await client.query(
      `update password_reset_requests set handled_at = now(), outcome = 'temporary_password'
       where user_id = $1 and handled_at is null`,
      [rows[0].id],
    )
    await client.query('commit')
    console.log(`Temporary password for @${username}: ${rows[0].temp}`)
    console.log('It works for 48 hours. They choose a new password when they log in with it.')
  }
} catch (err) {
  await client.query('rollback').catch(() => {})
  console.error(err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
