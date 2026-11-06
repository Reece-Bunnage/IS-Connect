import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery } from '../api.js'
import { DAYS, formatMinutes, mergeRanges, rangesByDay } from '../time.js'
import { PageHeader } from '../ui.jsx'

const LONG_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
const STEP = 30 // minutes between choices in the dropdowns
const EARLIEST = 6 * 60 // 6:00 AM
const LATEST = 24 * 60 // midnight
const DEFAULT_HOURS = [9 * 60, 17 * 60] // 9 AM - 5 PM when you switch a day on
const pad = (n) => String(n).padStart(2, '0')
const toHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`

let nextId = 1
const newRange = (start, end) => ({ id: nextId++, start, end })

// Saved rows -> { Mon: { on, ranges: [{ id, start, end }] }, ... } (minutes after midnight).
function fromSlots(slots) {
  const byDay = rangesByDay(slots)
  return Object.fromEntries(DAYS.map((d) => [d, { on: byDay[d].length > 0, ranges: byDay[d].map(([s, e]) => newRange(s, e)) }]))
}

// A day's valid ranges, overlaps merged.
const dayRanges = (day) => (day.on ? mergeRanges(day.ranges.filter((r) => r.end > r.start).map((r) => [r.start, r.end])) : [])

// What set_availability saves: one row per range.
const toSlots = (days) =>
  DAYS.flatMap((d) => dayRanges(days[d]).map(([s, e]) => ({ day: d, start_time: toHHMM(s), duration_minutes: e - s })))

// Every 30 minutes from `from` to `to`, plus `current` if it isn't one of them (older data).
function timeOptions(from, to, current) {
  const list = []
  for (let m = from; m <= to; m += STEP) list.push(m)
  if (!list.includes(current)) list.push(current)
  return list.sort((a, b) => a - b)
}

// Your weekly free times, like "Weekly hours" in Calendly or Google Calendar:
// switch a day on, then pick From / To times (add more ranges for a split day,
// or copy a day's hours to others). Saved as one availability_slots row per range.
export default function Calendar({ go, me, onSaved, showToast }) {
  const [days, setDays] = useState(null)
  const [savedJson, setSavedJson] = useState(null)
  const [copyFrom, setCopyFrom] = useState(null) // the day whose "Copy to" panel is open
  const [copyTo, setCopyTo] = useState(() => new Set())
  const [status, setStatus] = useState('') // read out by screen readers
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const focusId = useRef(null) // element to focus after the next render

  const slots = useQuery(
    () => supabase.from('availability_slots').select('day_of_week, start_time, duration_minutes').eq('student_id', me.id),
    [me.id],
  )

  // Start from what's saved in the database.
  useEffect(() => {
    if (slots.data && days === null) {
      const loaded = fromSlots(slots.data)
      setDays(loaded)
      setSavedJson(JSON.stringify(toSlots(loaded)))
    }
  }, [slots.data, days])

  // Keep keyboard focus in a sensible place after adding or removing hours.
  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus()
      focusId.current = null
    }
  })

  const stale = me.availability_updated_at && Date.now() - new Date(me.availability_updated_at) > 60 * 864e5

  if (slots.error) return <p className="error">Could not load your availability: {slots.error}</p>
  if (!days) return <p className="muted">Loading your availability…</p>

  const payload = toSlots(days)
  const dirty = JSON.stringify(payload) !== savedJson
  const invalid = DAYS.some((d) => days[d].on && days[d].ranges.some((r) => r.end <= r.start))
  const hours = payload.reduce((sum, s) => sum + s.duration_minutes, 0) / 60

  const update = (d, change) => setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...change(prev[d]) } }))

  function toggleDay(d, on) {
    update(d, (day) => ({ on, ranges: on && day.ranges.length === 0 ? [newRange(...DEFAULT_HOURS)] : day.ranges }))
    if (!on && copyFrom === d) setCopyFrom(null)
  }

  function setTime(d, id, field, value) {
    update(d, (day) => ({ ranges: day.ranges.map((r) => (r.id === id ? { ...r, [field]: value } : r)) }))
  }

  // A new range an hour after the day's last one.
  function addRange(d) {
    const last = days[d].ranges.at(-1)
    const start = Math.min(last ? last.end + 60 : DEFAULT_HOURS[0], LATEST - 60)
    const range = newRange(start, Math.min(start + 60, LATEST))
    focusId.current = `from-${range.id}`
    update(d, (day) => ({ ranges: [...day.ranges, range] }))
  }

  // Removing the last range switches the day off.
  function removeRange(d, id) {
    const left = days[d].ranges.filter((r) => r.id !== id)
    focusId.current = left.length ? `add-${d}` : `day-${d}`
    update(d, () => ({ ranges: left, on: left.length > 0 }))
  }

  function openCopy(d) {
    setCopyFrom(copyFrom === d ? null : d)
    setCopyTo(new Set())
  }
  function closeCopy() {
    focusId.current = `copy-btn-${copyFrom}`
    setCopyFrom(null)
  }
  function applyCopy() {
    setDays((prev) => {
      const next = { ...prev }
      for (const d of copyTo) next[d] = { on: true, ranges: prev[copyFrom].ranges.map((r) => newRange(r.start, r.end)) }
      return next
    })
    setStatus(`Copied ${LONG_DAY[copyFrom]}'s hours to ${DAYS.filter((d) => copyTo.has(d)).map((d) => LONG_DAY[d]).join(', ')}.`)
    closeCopy()
  }

  async function save(thenFind) {
    setSaving(true)
    setError(null)
    try {
      await rpc('set_availability', { p_slots: payload })
      await onSaved()
      setSavedJson(JSON.stringify(payload))
      if (thenFind) go('findFriends', { freeMatch: true })
      else showToast({ text: 'Free times saved.' })
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <>
      <PageHeader title="When are you free?" text="Set the hours you're usually free each week. Classmates see these when they set up a study session." />
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>

      <div className="availability-layout">
        <section className="card" aria-labelledby="weekly-hours-title">
          <h2 id="weekly-hours-title">Weekly hours</h2>
          {me.availability_updated_at && (
            <p className={stale ? 'notice' : 'muted small-text'}>
              {stale ? '⏰ ' : ''}Last updated {new Date(me.availability_updated_at).toLocaleDateString()}.
              {stale && " New semester? Check these are still right, then save so classmates don't see old times."}
            </p>
          )}

          <ul className="day-list">
            {DAYS.map((d) => {
              const day = days[d]
              return (
                <li key={d} className="day-hours">
                  <div className="day-name">
                    <input type="checkbox" id={`day-${d}`} checked={day.on} onChange={(e) => toggleDay(d, e.target.checked)} />
                    <label htmlFor={`day-${d}`}>{LONG_DAY[d]}</label>
                  </div>
                  <div className={`day-body ${day.on ? '' : 'off'}`}>
                    {!day.on ? (
                      <p className="muted">Not free</p>
                    ) : (
                      <>
                        {day.ranges.map((r, i) => {
                          const bad = r.end <= r.start
                          const name = day.ranges.length > 1 ? `${LONG_DAY[d]}, time ${i + 1}` : LONG_DAY[d]
                          return (
                            <div key={r.id} className="time-range">
                              <select id={`from-${r.id}`} aria-label={`${name}: from`} value={r.start} onChange={(e) => setTime(d, r.id, 'start', Number(e.target.value))}>
                                {timeOptions(EARLIEST, LATEST - STEP, r.start).map((m) => (
                                  <option key={m} value={m}>
                                    {formatMinutes(m)}
                                  </option>
                                ))}
                              </select>
                              <span aria-hidden="true">–</span>
                              <select
                                aria-label={`${name}: to`}
                                aria-invalid={bad || undefined}
                                aria-describedby={bad ? `err-${r.id}` : undefined}
                                value={r.end}
                                onChange={(e) => setTime(d, r.id, 'end', Number(e.target.value))}
                              >
                                {timeOptions(EARLIEST + STEP, LATEST, r.end).map((m) => (
                                  <option key={m} value={m}>
                                    {formatMinutes(m)}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="range-remove"
                                aria-label={`Remove ${name}, ${formatMinutes(r.start)} to ${formatMinutes(r.end)}`}
                                onClick={() => removeRange(d, r.id)}
                              >
                                ×
                              </button>
                              {bad && (
                                <p id={`err-${r.id}`} className="error small-text range-error">
                                  The end time must be after the start time.
                                </p>
                              )}
                            </div>
                          )
                        })}
                        <div className="range-tools">
                          <button type="button" id={`add-${d}`} className="link small" onClick={() => addRange(d)}>
                            + Add hours<span className="sr-only"> on {LONG_DAY[d]}</span>
                          </button>
                          <button
                            type="button"
                            id={`copy-btn-${d}`}
                            className="link small"
                            aria-label={`Copy ${LONG_DAY[d]}'s hours to other days`}
                            aria-expanded={copyFrom === d}
                            aria-controls={`copy-${d}`}
                            onClick={() => openCopy(d)}
                          >
                            Copy to other days
                          </button>
                        </div>
                        {copyFrom === d && (
                          <fieldset id={`copy-${d}`} className="copy-panel" onKeyDown={(e) => e.key === 'Escape' && closeCopy()}>
                            <legend>Copy {LONG_DAY[d]}'s hours to:</legend>
                            <div className="copy-days">
                              {DAYS.filter((o) => o !== d).map((o) => (
                                <label key={o} className="check">
                                  <input
                                    type="checkbox"
                                    checked={copyTo.has(o)}
                                    onChange={(e) =>
                                      setCopyTo((prev) => {
                                        const next = new Set(prev)
                                        if (e.target.checked) next.add(o)
                                        else next.delete(o)
                                        return next
                                      })
                                    }
                                  />
                                  {LONG_DAY[o]}
                                </label>
                              ))}
                            </div>
                            <div className="row">
                              <button type="button" className="primary small" disabled={copyTo.size === 0} onClick={applyCopy}>
                                Copy
                              </button>
                              <button type="button" className="secondary small" onClick={closeCopy}>
                                Cancel
                              </button>
                            </div>
                          </fieldset>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="muted small-text">
            {hours === 0 ? 'No free times set yet.' : `${hours} ${hours === 1 ? 'hour' : 'hours'} a week.`}
            {dirty && <strong className="unsaved"> Not saved yet.</strong>}
          </p>
          {invalid && <p className="error">Fix the times marked in red before saving.</p>}
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="primary" disabled={saving || invalid} onClick={() => save(true)}>
              Save & find a partner →
            </button>
            <button className="secondary" disabled={saving || invalid || !dirty} onClick={() => save(false)}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </section>

        <WeekPreview days={days} />
      </div>
    </>
  )
}

// A small picture of the week that follows your edits. It's only a visual
// check; the list above has the same information, so screen readers skip this.
function WeekPreview({ days }) {
  const byDay = Object.fromEntries(DAYS.map((d) => [d, dayRanges(days[d])]))
  const all = DAYS.flatMap((d) => byDay[d])
  const top = all.length ? Math.floor(Math.min(...all.map((r) => r[0])) / 60) * 60 : 0
  const bottom = all.length ? Math.ceil(Math.max(...all.map((r) => r[1])) / 60) * 60 : 0
  const rows = []
  for (let t = top; t < bottom; t += STEP) rows.push(t)
  const covered = (d, t) => byDay[d].some(([s, e]) => s <= t && t + STEP <= e)

  return (
    <aside className="card week-preview" aria-hidden="true">
      <h2>Your week</h2>
      {rows.length === 0 ? (
        <p className="muted small-text">Your free times will show here.</p>
      ) : (
        <div className="preview-grid">
          <span />
          {DAYS.map((d) => (
            <span key={d} className="preview-day">
              {d}
            </span>
          ))}
          {rows.map((t) => (
            <Fragment key={t}>
              <span className="preview-hour">{t % 60 === 0 ? formatMinutes(t).replace(':00', '') : ''}</span>
              {DAYS.map((d) => (
                <span key={d} className={`preview-cell ${covered(d, t) ? 'on' : ''} ${t % 60 === 0 ? 'hour-start' : ''}`} />
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </aside>
  )
}
