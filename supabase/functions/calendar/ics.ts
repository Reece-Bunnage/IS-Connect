// Builds the calendar file (iCalendar, RFC 5545) that calendar apps subscribe to.
// Pending meetups say "Pending:" in the title, so it's clear on the calendar too.

export type Meetup = {
  id: number
  scheduled_at: string
  duration_minutes: number
  topic: string | null
  location: string
  status: 'requested' | 'confirmed' | 'completed'
  i_asked: boolean
  other_name: string
  updated_at: string
  revision: number
}

// 2026-11-05T22:00:00.000Z -> 20261105T220000Z
function stamp(value: Date | string) {
  return new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, '')
}

// Commas, semicolons, backslashes and line breaks have to be escaped in text.
function text(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Lines longer than 75 bytes continue on the next line, starting with a space.
function fold(line: string) {
  const lines = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0
    const size = code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
    if (bytes + size > 75) {
      lines.push(current)
      current = ' '
      bytes = 1
    }
    current += ch
    bytes += size
  }
  lines.push(current)
  return lines.join('\r\n')
}

function event(m: Meetup, appUrl: string, now: Date) {
  const start = new Date(m.scheduled_at)
  const end = new Date(start.getTime() + m.duration_minutes * 60000)
  const first = m.other_name.split(' ')[0]
  const pending = m.status === 'requested'
  const note = !pending
    ? 'Confirmed in IS-Connect.'
    : m.i_asked
      ? `Waiting for ${first} to confirm in IS-Connect.`
      : `${first} asked to meet. Confirm or decline in IS-Connect.`
  const details = [m.topic && `Topic: ${m.topic}`, note, appUrl].filter(Boolean).join('\n\n')
  return [
    'BEGIN:VEVENT',
    `UID:meetup-${m.id}@is-connect`,
    `DTSTAMP:${stamp(now)}`,
    `LAST-MODIFIED:${stamp(m.updated_at)}`,
    `SEQUENCE:${m.revision}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(`${pending ? 'Pending: ' : ''}Study session with ${m.other_name}`)}`,
    `LOCATION:${text(m.location)}`,
    `DESCRIPTION:${text(details)}`,
    `STATUS:${pending ? 'TENTATIVE' : 'CONFIRMED'}`,
    'END:VEVENT',
  ]
}

export function buildCalendar(meetups: Meetup[], appUrl: string, now = new Date()) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IS-Connect//Meetups//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:IS-Connect meetups',
    // Asks calendar apps to check every hour. Apple and Outlook listen; Google picks its own schedule.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...meetups.flatMap((m) => event(m, appUrl, now)),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
