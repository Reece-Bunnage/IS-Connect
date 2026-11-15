// Deploys the AI opener Edge Function (supabase/functions/ai-openers) to
// Supabase and gives it the Gemini key.
// Usage: npm run deploy:ai
// Needs in .env.local: VITE_SUPABASE_URL and SUPABASE_ACCESS_TOKEN (same as
// deploy:calendar), plus GEMINI_API_KEY from Google AI Studio. GEMINI_MODEL
// is optional (see DEFAULT_MODEL in supabase/functions/ai-openers/openers.ts).
// The key goes to Supabase's secret store, never into the website.

import { spawnSync } from 'node:child_process'

const ref = process.env.VITE_SUPABASE_URL?.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]
if (!ref) {
  console.error('Missing VITE_SUPABASE_URL in .env.local.')
  process.exit(1)
}
for (const name of ['SUPABASE_ACCESS_TOKEN', 'GEMINI_API_KEY']) {
  if (!process.env[name]) {
    console.error(`Missing ${name} in .env.local.`)
    process.exit(1)
  }
}

const supabase = (...args) =>
  spawnSync('npx', ['--yes', 'supabase@2.121.0', ...args, '--project-ref', ref], { stdio: 'inherit', shell: process.platform === 'win32' })

// 1. Save the key (and model, if set) as Edge Function secrets.
const secrets = [`GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`]
if (process.env.GEMINI_MODEL) secrets.push(`GEMINI_MODEL=${process.env.GEMINI_MODEL}`)
if (supabase('secrets', 'set', ...secrets).status !== 0) {
  console.warn(
    '\nCould not save the Gemini key with your access token. Add it by hand instead:\n' +
      'Supabase dashboard -> Edge Functions -> Secrets -> add GEMINI_API_KEY. Deploying the function anyway.\n',
  )
}

// 2. Deploy. The function checks the IS-Connect login token itself, so
// Supabase's own JWT check is off (as for the calendar function).
const result = supabase('functions', 'deploy', 'ai-openers', '--no-verify-jwt', '--use-api')
if (result.status === 0) console.log('AI openers are live. Open an empty chat and tap "Write 3 openers with AI".')
process.exit(result.status ?? 1)
