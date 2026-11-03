// Serves one student's meetups as a calendar that Google Calendar, Apple Calendar
// or Outlook can subscribe to:
//   https://<project>.supabase.co/functions/v1/calendar/<token>.ics
// Calendar apps can't log in, so the token in the link is the key (see
// calendar_feed_events in supabase/functions.sql). Deploy: npm run deploy:calendar
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { buildCalendar } from './ics.ts'

const APP_URL = Deno.env.get('APP_URL') ?? 'https://reece-bunnage.github.io/IS-Connect/'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Supabase provides these to every Edge Function.
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)

function reply(status: number, body: string) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

Deno.serve(async (req) => {
  const token = new URL(req.url).pathname.split('/').pop()?.replace(/\.ics$/, '') ?? ''
  if (!UUID.test(token)) return reply(404, 'Calendar link not found.')

  const { data, error } = await supabase.rpc('calendar_feed_events', { p_feed_token: token })
  if (error) {
    console.error(error.message)
    return reply(502, 'Could not load the calendar. Try again later.')
  }
  if (data === null) return reply(404, 'This calendar link was reset or turned off in IS-Connect.')

  return new Response(buildCalendar(data, APP_URL), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
