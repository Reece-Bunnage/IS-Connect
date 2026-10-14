import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery } from '../api.js'
import { DAYS, formatTime } from '../time.js'
import { PageHeader } from '../ui.jsx'

const HOURS = Array.from({ length: 13 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`) // 8 AM - 8 PM

// Your weekly free times, saved to availability_slots (one hour each).
export default function Calendar({ go, me, onSaved }) {
  const [day, setDay] = useState('Mon')
  const [picked, setPicked] = useState(null) // Set of 'Mon 16:00'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const slots = useQuery(
    () => supabase.from('availability_slots').select('day_of_week, start_time').eq('student_id', me.id),
    [me.id],
  )

  // Start from what's saved in the database.
  useEffect(() => {
    if (slots.data && picked === null) {
      setPicked(new Set(slots.data.map((s) => `${s.day_of_week} ${s.start_time.slice(0, 5)}`)))
    }
  }, [slots.data, picked])

  const stale = me.availability_updated_at && Date.now() - new Date(me.availability_updated_at) > 60 * 864e5

  if (slots.error) return <p className="error">Could not load your availability: {slots.error}</p>
  if (!picked) return <p className="muted">Loading your availability…</p>

  function toggle(hour) {
    const key = `${day} ${hour}`
    const next = new Set(picked)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setPicked(next)
    setSaved(false)
  }

  const sorted = [...picked].sort((a, b) => {
    const [da, ta] = a.split(' ')
    const [db, tb] = b.split(' ')
    return DAYS.indexOf(da) - DAYS.indexOf(db) || ta.localeCompare(tb)
  })

  async function save(thenFind) {
    setSaving(true)
    setError(null)
    try {
      const payload = sorted.map((key) => {
        const [d, t] = key.split(' ')
        return { day: d, start_time: t, duration_minutes: 60 }
      })
      await rpc('set_availability', { p_slots: payload })
      await onSaved()
      if (thenFind) go('findFriends', { freeMatch: true })
      else setSaved(true)
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  return (
    <>
      <PageHeader title="Make a little time to connect." text="Select the weekly times you're available. Scheduling shows only shared times." />

      <section className="card">
        <h2>Your weekly availability</h2>
        <p className="muted">Pick a day, then tap the hours you're free. Each one is a 1-hour study block.</p>
        {me.availability_updated_at && (
          <p className={stale ? 'notice' : 'muted small-text'}>
            {stale ? '⏰ ' : ''}Last updated {new Date(me.availability_updated_at).toLocaleDateString()}.
            {stale && " New semester? Check these are still right, then save so classmates don't see old times."}
          </p>
        )}

        <div className="segmented days">
          {DAYS.map((d) => {
            const count = sorted.filter((k) => k.startsWith(d)).length
            return (
              <button key={d} className={day === d ? 'on' : ''} onClick={() => setDay(d)}>
                {d}
                {count > 0 && <span className="count">{count}</span>}
              </button>
            )
          })}
        </div>

        <div className="chips hours">
          {HOURS.map((h) => (
            <button key={h} className={`chip ${picked.has(`${day} ${h}`) ? 'on' : ''}`} onClick={() => toggle(h)}>
              {formatTime(h)}
            </button>
          ))}
        </div>

        <h3 className="spaced">Your free times</h3>
        {sorted.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <div className="chips">
            {sorted.map((key) => {
              const [d, t] = key.split(' ')
              return (
                <span key={key} className="chip">
                  {d} {formatTime(t)} · 1 hour
                </span>
              )
            })}
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {saved && <p className="notice">✅ Saved. Refresh the page and your times are still here.</p>}
        <div className="row">
          <button className="primary" disabled={saving} onClick={() => save(true)}>
            Save & find a partner →
          </button>
          <button className="secondary" disabled={saving} onClick={() => save(false)}>
            Save
          </button>
        </div>
      </section>
    </>
  )
}
