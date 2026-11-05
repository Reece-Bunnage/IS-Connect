// Weekly availability helpers. Slots look like the availability_slots rows:
// { day_of_week: 'Mon', start_time: '16:00:00', duration_minutes: 60 }

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

// '16:00:00' -> '4:00 PM'
export function formatTime(hhmm) {
  const minutes = toMinutes(hhmm)
  const h = Math.floor(minutes / 60)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(minutes % 60).padStart(2, '0')} ${suffix}`
}

export function formatSlot(slot) {
  return `${slot.day_of_week} ${formatTime(slot.start_time)}`
}

// Times both students are free (at least 30 minutes), sorted Mon -> Sun.
export function sharedSlots(mine = [], theirs = []) {
  const shared = new Map()
  for (const a of mine) {
    for (const b of theirs) {
      if (a.day_of_week !== b.day_of_week) continue
      const start = Math.max(toMinutes(a.start_time), toMinutes(b.start_time))
      const end = Math.min(
        toMinutes(a.start_time) + a.duration_minutes,
        toMinutes(b.start_time) + b.duration_minutes,
      )
      if (end - start >= 30) {
        const slot = { day_of_week: a.day_of_week, start_time: toHHMM(start), duration_minutes: end - start }
        shared.set(`${slot.day_of_week} ${slot.start_time}`, slot)
      }
    }
  }
  return [...shared.values()].sort(
    (x, y) => DAYS.indexOf(x.day_of_week) - DAYS.indexOf(y.day_of_week) || x.start_time.localeCompare(y.start_time),
  )
}

const pad = (n) => String(n).padStart(2, '0')

// A Date -> '2026-11-10T16:00' in local time: what <input type="datetime-local">
// uses, and how Set Up Meetup keeps the chosen time in its URL.
export function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 'Mon'..'Sun' for a Date.
export function weekday(date) {
  return DAYS[(date.getDay() + 6) % 7] // JS: Sunday = 0
}

// Whether someone's weekly free times cover `minutes` minutes from `date`.
export function freeAt(slots = [], date, minutes = 60) {
  const day = weekday(date)
  const start = date.getHours() * 60 + date.getMinutes()
  return slots.some(
    (s) => s.day_of_week === day && toMinutes(s.start_time) <= start && start + minutes <= toMinutes(s.start_time) + s.duration_minutes,
  )
}

// The next 7 days (today first), each with the hours in your free times that
// haven't started yet, as Dates.
export function upcomingFreeHours(slots = [], now = new Date()) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const starts = new Set()
    for (const s of slots) {
      if (s.day_of_week !== weekday(date)) continue
      const end = toMinutes(s.start_time) + s.duration_minutes
      for (let m = toMinutes(s.start_time); m + 60 <= end; m += 60) starts.add(m)
    }
    const hours = [...starts]
      .sort((a, b) => a - b)
      .map((m) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(m / 60), m % 60))
      .filter((h) => h > now)
    return { key: toLocalInput(date).slice(0, 10), date, hours }
  })
}

// '4 PM', or '4:30 PM' when it isn't on the hour.
export function formatHour(date) {
  return date.toLocaleTimeString(undefined, date.getMinutes() ? { hour: 'numeric', minute: '2-digit' } : { hour: 'numeric' })
}

// 'Wed, Oct 15 · 3:00 PM'
export function formatWhen(value) {
  const d = new Date(value)
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

// Opens Google Calendar with the meetup filled in, ready to save. Nothing is shared
// with Google until the student presses Save there.
export function googleCalendarLink(meetup) {
  const start = new Date(meetup.scheduled_at)
  const end = new Date(start.getTime() + meetup.duration_minutes * 60000)
  const stamp = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, '') // 20261105T220000Z
  const appUrl = window.location.origin + import.meta.env.BASE_URL
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Study session with ${meetup.other_name}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    location: meetup.location,
    details: `${meetup.topic ? `Topic: ${meetup.topic}\n\n` : ''}Set up on IS-Connect: ${appUrl}`,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
