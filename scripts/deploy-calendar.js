// Deploys the calendar link Edge Function (supabase/functions/calendar) to Supabase.
// Usage: npm run deploy:calendar
// Needs SUPABASE_ACCESS_TOKEN in .env.local (Supabase -> Account -> Access Tokens),
// limited to this project with only Edge Functions access (see README, Deploying).
// Keep it on your own computer, not in GitHub.

import { spawnSync } from 'node:child_process'

const ref = process.env.VITE_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!ref) {
  console.error('Missing VITE_SUPABASE_URL in .env.local.')
  process.exit(1)
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN in .env.local (Supabase -> Account -> Access Tokens).')
  process.exit(1)
}

// --use-api bundles the function on Supabase's side, so Docker isn't needed.
const result = spawnSync(
  'npx',
  ['--yes', 'supabase@2.121.0', 'functions', 'deploy', 'calendar', '--project-ref', ref, '--no-verify-jwt', '--use-api'],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
if (result.status === 0) {
  console.log(`Calendar links are served from https://${ref}.supabase.co/functions/v1/calendar/<token>.ics`)
}
process.exit(result.status ?? 1)
