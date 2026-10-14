// Let a user see the Reports screen: npm run make-admin -- <username>
// Add --remove to take it away again.
import pg from 'pg'

const username = process.argv[2]?.toLowerCase()
const remove = process.argv.includes('--remove')
if (!username || username.startsWith('--')) {
  console.error('Usage: npm run make-admin -- <username> [--remove]')
  process.exit(1)
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const { rowCount } = await client.query('update app_users set is_admin = $2 where username = $1', [username, !remove])
console.log(rowCount ? `@${username} is ${remove ? 'no longer' : 'now'} an admin.` : `No user named @${username}.`)
await client.end()
