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

// The next date (in local time) that falls on this weekday and time.
export function nextDateFor(day, hhmm) {
  const now = new Date()
  const target = new Date(now)
  const jsDay = (DAYS.indexOf(day) + 1) % 7 // JS: Sunday = 0
  target.setDate(now.getDate() + ((jsDay - now.getDay() + 7) % 7))
  const minutes = toMinutes(hhmm)
  target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 7)
  return target
}

// 'Wed, Oct 15 · 3:00 PM'
export function formatWhen(value) {
  const d = new Date(value)
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}
