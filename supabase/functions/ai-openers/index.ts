// Suggests 3 first messages for an empty chat, written by Gemini from what
// the two students share (see openers.ts). The app calls it with
//   POST /functions/v1/ai-openers   { token, otherId }
// The Gemini key lives in Supabase's secret store (GEMINI_API_KEY), never in
// the website. Students tap a suggestion to edit it; nothing is sent for them.
// Deploy: npm run deploy:ai
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { BACKUP_MODEL, DEFAULT_MODEL, STUDENT_FIELDS, buildFacts, writeOpeners, type Student } from './openers.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Supabase provides these to every Edge Function. The publishable key reads
// only what the website itself can read.
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)

// The site (GitHub Pages, or localhost while developing) calls this from the browser.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!apiKey) return reply(503, { error: "AI suggestions aren't set up yet." })

  const { token, otherId } = await req.json().catch(() => ({}))
  if (!UUID.test(token ?? '') || !UUID.test(otherId ?? '')) return reply(400, { error: 'Bad request.' })

  // Same login check as the website: the session token from localStorage.
  const { data: session } = await supabase.rpc('get_session', { p_token: token })
  if (!session?.user_id) return reply(401, { error: 'Please log in again.' })

  const { data: people, error } = await supabase
    .from('students')
    .select(STUDENT_FIELDS)
    .or(`user_id.eq.${session.user_id},id.eq.${otherId}`)
  if (error) {
    console.error(error.message)
    return reply(502, { error: "Couldn't load the profiles. Try again." })
  }
  const students = (people ?? []) as unknown as Student[]
  const me = students.find((p) => p.user_id === session.user_id)
  const other = students.find((p) => p.id === otherId)
  if (!me || !other || me.id === other.id) return reply(404, { error: 'Student not found.' })

  try {
    const models = [...new Set([Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL, BACKUP_MODEL])]
    const openers = await writeOpeners(apiKey, models, buildFacts(me, other))
    return reply(200, { openers })
  } catch (err) {
    console.error(String(err))
    // 429: over the free tier's per-minute or per-day limit. 503: Google's
    // models are overloaded. Either way, trying later usually works.
    const status = (err as { status?: number }).status
    if (status === 429 || status === 503) {
      return reply(503, { error: 'AI suggestions are busy right now. Try again in a minute.' })
    }
    return reply(502, { error: "Couldn't write suggestions right now." })
  }
})
