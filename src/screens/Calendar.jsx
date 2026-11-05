import { Fragment, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery } from '../api.js'
import { DAYS, formatTime } from '../time.js'
import { PageHeader } from '../ui.jsx'

const HOURS = Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`) // 8 AM - 8 PM starts
const WEEKDAYS = ['Tue', 'Wed', 'Thu', 'Fri']
const LONG_DAY = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }
const shortHour = (h) => formatTime(h).replace(':00', '') // '16:00' -> '4 PM'

// Saved rows -> the set of 1-hour blocks they cover ('Mon 16:00').
function toKeys(rows) {
  const keys = new Set()
  for (const r of rows) {
    const [h, m] = r.start_time.split(':').map(Number)
    const start = h * 60 + m
    const end = start + (r.duration_minutes ?? 60)
    for (let t = start; t + 60 <= end || t === start; t += 60) {
      keys.add(`${r.day_of_week} ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
    }
  }
  return keys
}

const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k))

// Your weekly free times, like When2meet: the whole week is one grid, and you
// tap or drag across hours to mark them. Saved to availability_slots as
// 1-hour blocks.
export default function Calendar({ go, me, onSaved, showToast }) {
  const [picked, setPicked] = useState(null) // Set of 'Mon 16:00'
  const [savedKeys, setSavedKeys] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const paint = useRef(null) // while dragging: true = marking free, false = clearing

  const slots = useQuery(
    () => supabase.from('availability_slots').select('day_of_week, start_time, duration_minutes').eq('student_id', me.id),
    [me.id],
  )

  // Start from what's saved in the database.
  useEffect(() => {
    if (slots.data && picked === null) {
      const keys = toKeys(slots.data)
      setPicked(keys)
      setSavedKeys(keys)
    }
  }, [slots.data, picked])

  const stale = me.availability_updated_at && Date.now() - new Date(me.availability_updated_at) > 60 * 864e5

  if (slots.error) return <p className="error">Could not load your availability: {slots.error}</p>
  if (!picked) return <p className="muted">Loading your availability…</p>

  const dirty = !sameSet(picked, savedKeys)
  const mondayHours = HOURS.filter((h) => picked.has(`Mon ${h}`))

  function set(key, on) {
    setPicked((prev) => {
      if (prev.has(key) === on) return prev
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })
  }

  // Tap or drag: the first block decides whether the drag marks or clears.
  const cellAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('.avail-cell')
  function onPointerDown(e) {
    const cell = e.target.closest('.avail-cell')
    if (!cell || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault() // no text selection while dragging
    // Keep getting the moves and the release even if the pointer leaves the grid.
    e.currentTarget.setPointerCapture?.(e.pointerId)
    paint.current = !picked.has(cell.dataset.key)
    set(cell.dataset.key, paint.current)
  }
  function onPointerMove(e) {
    if (paint.current === null) return
    const cell = cellAt(e)
    if (cell) set(cell.dataset.key, paint.current)
  }
  const endPaint = () => (paint.current = null)

  function copyMonday() {
    setPicked((prev) => {
      const next = new Set([...prev].filter((k) => !WEEKDAYS.includes(k.split(' ')[0])))
      for (const d of WEEKDAYS) for (const h of mondayHours) next.add(`${d} ${h}`)
      return next
    })
  }

  async function save(thenFind) {
    setSaving(true)
    setError(null)
    try {
      const payload = [...picked].map((key) => {
        const [d, t] = key.split(' ')
        return { day: d, start_time: t, duration_minutes: 60 }
      })
      await rpc('set_availability', { p_slots: payload })
      await onSaved()
      setSavedKeys(new Set(picked))
      if (thenFind) go('findFriends', { freeMatch: true })
      else showToast({ text: 'Free times saved.' })
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <>
      <PageHeader title="When are you free?" text="Mark the hours you're usually free each week. Classmates see these when they set up a study session." />

      <section className="card">
        {me.availability_updated_at && (
          <p className={stale ? 'notice' : 'muted small-text'}>
            {stale ? '⏰ ' : ''}Last updated {new Date(me.availability_updated_at).toLocaleDateString()}.
            {stale && " New semester? Check these are still right, then save so classmates don't see old times."}
          </p>
        )}
        <p className="muted small-text">Tap an hour to mark it, or drag across several. Tap again to clear.</p>

        <div className="avail-grid" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPaint} onPointerCancel={endPaint} onLostPointerCapture={endPaint}>
          <span />
          {DAYS.map((d) => (
            <span key={d} className="avail-day">
              {d}
            </span>
          ))}
          {HOURS.map((h) => (
            <Fragment key={h}>
              <span className="avail-hour">{shortHour(h)}</span>
              {DAYS.map((d) => {
                const key = `${d} ${h}`
                const on = picked.has(key)
                return (
                  <button
                    key={key}
                    type="button"
                    data-key={key}
                    className={`avail-cell ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    aria-label={`${LONG_DAY[d]} ${formatTime(h)}`}
                    // Pointer taps are handled above; this is for the keyboard (Enter / Space).
                    onClick={(e) => e.detail === 0 && set(key, !on)}
                  />
                )
              })}
            </Fragment>
          ))}
        </div>

        <div className="row avail-tools">
          {mondayHours.length > 0 && (
            <button type="button" className="link small" onClick={copyMonday}>
              Copy Monday to Tue–Fri
            </button>
          )}
          {picked.size > 0 && (
            <button type="button" className="link small muted-link" onClick={() => setPicked(new Set())}>
              Clear all
            </button>
          )}
        </div>

        <p className="muted small-text">
          {picked.size === 0 ? 'No hours marked yet.' : `${picked.size} ${picked.size === 1 ? 'hour' : 'hours'} a week.`}
          {dirty && <strong className="unsaved"> Not saved yet.</strong>}
        </p>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="primary" disabled={saving} onClick={() => save(true)}>
            Save & find a partner →
          </button>
          <button className="secondary" disabled={saving || !dirty} onClick={() => save(false)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </>
  )
}
