import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery } from '../api.js'
import { formatSlot, formatWhen, nextDateFor, sharedSlots } from '../time.js'
import { Avatar, PageHeader, programLabel } from '../ui.jsx'

const PLACES = ['Library, 2nd floor study room', 'Business building commons', 'Student center', 'Online (Zoom)']

// Step 1: pick a partner, a time you're both free, and a place.
// Step 2: confirm every detail, then send the request.
export default function SetupMeetup({ go, me, params }) {
  const [partnerId, setPartnerId] = useState(params.partnerId ?? '')
  const [slotKey, setSlotKey] = useState('') // 'Mon 16:00' or 'custom'
  const [custom, setCustom] = useState('')
  const [place, setPlace] = useState(PLACES[0])
  const [otherPlace, setOtherPlace] = useState('')
  const [step, setStep] = useState('pick')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const students = useQuery(
    () =>
      supabase
        .from('students')
        .select('id, full_name, program_status, current_course, user_id, availability_slots(day_of_week, start_time, duration_minutes)')
        .order('full_name'),
    [],
  )
  const { hidden } = useHiddenIds(me.id)

  if (students.error) return <p className="error">Could not load students: {students.error}</p>
  if (!students.data) return <p className="muted">Loading…</p>

  const mySlots = students.data.find((s) => s.id === me.id)?.availability_slots ?? []
  const options = students.data.filter((s) => s.id !== me.id && !hidden.has(s.id))
  const partner = options.find((s) => s.id === partnerId)
  const shared = partner ? sharedSlots(mySlots, partner.availability_slots) : []

  const when =
    slotKey === 'custom'
      ? custom && new Date(custom)
      : slotKey && nextDateFor(...slotKey.split(' '))
  const where = place === 'other' ? otherPlace.trim() : place
  const ready = partner && when && where

  async function send() {
    setSending(true)
    setError(null)
    try {
      await rpc('request_meetup', {
        p_partner_id: partner.id,
        p_scheduled_at: when.toISOString(),
        p_location: where,
      })
      go('meetups')
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  if (step === 'confirm' && ready) {
    return (
      <>
        <PageHeader title="Confirm your meetup." text="Check the details before sending your request." />
        <section className="card confirm">
          <div className="person">
            <Avatar name={partner.full_name} />
            <div>
              <h2>{partner.full_name}</h2>
              <p className="muted">
                {programLabel(partner.program_status)}
                {partner.current_course && ` · ${partner.current_course}`}
              </p>
            </div>
          </div>
          <dl className="details">
            <dt>When</dt>
            <dd>{formatWhen(when)} · 1 hour</dd>
            <dt>Where</dt>
            <dd>{where}</dd>
            <dt>Next step</dt>
            <dd>
              {partner.user_id
                ? `${partner.full_name.split(' ')[0]} will see your request in My Meetups and can confirm it.`
                : 'This is a sample student, so they confirm right away.'}
            </dd>
          </dl>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="primary" disabled={sending} onClick={send}>
              {sending ? 'Sending…' : 'Send request'}
            </button>
            <button className="secondary" onClick={() => setStep('pick')}>
              ← Change details
            </button>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Set up a study session." text="Pick a partner, a time you're both free, and a place to meet." />
      <section className="card form">
        <label>
          Study partner
          <select
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value)
              setSlotKey('')
            }}
          >
            <option value="">Choose a student…</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({programLabel(s.program_status)}
                {s.current_course && `, ${s.current_course}`})
              </option>
            ))}
          </select>
        </label>

        {partner && (
          <fieldset>
            <legend>When</legend>
            {mySlots.length === 0 && (
              <p className="notice">
                Add your free times to see when you overlap.{' '}
                <button type="button" className="link" onClick={() => go('calendar')}>
                  Open Availability →
                </button>
              </p>
            )}
            {mySlots.length > 0 && shared.length === 0 && (
              <p className="muted">You and {partner.full_name.split(' ')[0]} don't share any free times yet. Pick another time below.</p>
            )}
            <div className="chips">
              {shared.map((slot) => {
                const key = `${slot.day_of_week} ${slot.start_time}`
                return (
                  <button type="button" key={key} className={`chip ${slotKey === key ? 'on' : ''}`} onClick={() => setSlotKey(key)}>
                    {formatSlot(slot)} (both free)
                  </button>
                )
              })}
              <button type="button" className={`chip ${slotKey === 'custom' ? 'on' : ''}`} onClick={() => setSlotKey('custom')}>
                Another time…
              </button>
            </div>
            {slotKey === 'custom' && (
              <input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Date and time" />
            )}
            {when && <p className="muted">📅 {formatWhen(when)}</p>}
          </fieldset>
        )}

        {partner && (
          <fieldset>
            <legend>Where</legend>
            <div className="chips">
              {[...PLACES, 'other'].map((p) => (
                <button type="button" key={p} className={`chip ${place === p ? 'on' : ''}`} onClick={() => setPlace(p)}>
                  {p === 'other' ? 'Somewhere else…' : p}
                </button>
              ))}
            </div>
            {place === 'other' && (
              <input value={otherPlace} onChange={(e) => setOtherPlace(e.target.value)} placeholder="e.g. TNRB 2nd floor" aria-label="Place" />
            )}
          </fieldset>
        )}

        <button type="button" className="primary" disabled={!ready} onClick={() => setStep('confirm')}>
          Review & confirm →
        </button>
      </section>
    </>
  )
}
