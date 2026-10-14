import { useState } from 'react'
import { rpc, useRpc } from '../api.js'
import { formatWhen } from '../time.js'
import { Avatar, PageHeader } from '../ui.jsx'

const STATUS_LABEL = {
  requested: 'Waiting to confirm',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired',
}
const FEEDBACK = [
  ['great', 'Great!'],
  ['okay', 'It was okay'],
  ['no_show', "Didn't happen"],
]

export default function Meetups({ go, me, refreshCounts, showToast }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [reschedule, setReschedule] = useState(null) // { id, value }

  const meetups = useRpc('my_meetups', {}, [me.id])

  if (meetups.error) return <p className="error">Could not load meetups: {meetups.error}</p>
  if (!meetups.data) return <p className="muted">Loading meetups…</p>

  const now = Date.now()
  const isUpcoming = (m) => new Date(m.scheduled_at) >= now && ['requested', 'confirmed'].includes(m.status)
  const upcoming = meetups.data.filter(isUpcoming)
  const past = meetups.data.filter((m) => !isUpcoming(m)).reverse()

  async function act(m, fn, args, toastText) {
    setBusyId(m.id)
    setError(null)
    try {
      await rpc(fn, { p_meetup_id: m.id, ...args })
      await meetups.reload()
      refreshCounts()
      setReschedule(null)
      if (toastText) showToast({ text: toastText })
    } catch (err) {
      setError(err.message)
    }
    setBusyId(null)
  }

  function card(m) {
    const busy = busyId === m.id
    const inPast = new Date(m.scheduled_at) < now
    const first = m.other_name.split(' ')[0]
    const end = new Date(new Date(m.scheduled_at).getTime() + m.duration_minutes * 60000)
    const needsFeedback = inPast && ['confirmed', 'completed'].includes(m.status) && !m.my_feedback
    return (
      <article key={m.id} className="card person">
        <Avatar name={m.other_name} color={m.other_color} />
        <div className="person-body">
          <h3>
            {m.other_name} <span className={`badge status-${m.status}`}>{STATUS_LABEL[m.status]}</span>
          </h3>
          <p>
            📅 {formatWhen(m.scheduled_at)} – {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            <br />📍 {m.location}
            {m.topic && (
              <>
                <br />📝 {m.topic}
              </>
            )}
          </p>
          <p className="muted">
            {m.status === 'expired'
              ? 'Nobody confirmed this before it started.'
              : m.status === 'requested'
                ? m.i_asked
                  ? `Waiting for ${first} to confirm.`
                  : `${first} asked to meet. Does this time work?`
                : m.i_asked
                  ? 'You set this up.'
                  : `${first} set this up.`}
          </p>

          {needsFeedback && (
            <div className="feedback">
              <p>
                <strong>How did it go?</strong>
              </p>
              <div className="row">
                {FEEDBACK.map(([id, label]) => (
                  <button key={id} className="secondary small" disabled={busy} onClick={() => act(m, 'meetup_feedback', { p_feedback: id }, id === 'great' ? 'Awesome! Keep it going 💪' : 'Thanks for letting us know.')}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {reschedule?.id === m.id && (
            <form
              className="row reschedule"
              onSubmit={(e) => {
                e.preventDefault()
                act(m, 'propose_new_time', { p_scheduled_at: new Date(reschedule.value).toISOString() }, `New time sent to ${first}.`)
              }}
            >
              <input type="datetime-local" value={reschedule.value} onChange={(e) => setReschedule({ ...reschedule, value: e.target.value })} aria-label="New date and time" required />
              <button type="submit" className="primary small" disabled={busy || !reschedule.value}>
                Send new time
              </button>
              <button type="button" className="secondary small" onClick={() => setReschedule(null)}>
                Cancel
              </button>
            </form>
          )}

          <div className="row actions">
            {m.status === 'requested' && !m.i_asked && (
              <button className="primary small" disabled={busy} onClick={() => act(m, 'set_meetup_status', { p_status: 'confirmed' }, `Confirmed! ${first} will be notified.`)}>
                Confirm
              </button>
            )}
            {['requested', 'confirmed'].includes(m.status) && !inPast && reschedule?.id !== m.id && (
              <button className="secondary small" disabled={busy} onClick={() => setReschedule({ id: m.id, value: '' })}>
                Suggest new time
              </button>
            )}
            {['requested', 'confirmed'].includes(m.status) && !inPast && (
              <button className="link small" disabled={busy} onClick={() => act(m, 'set_meetup_status', { p_status: 'cancelled' })}>
                {m.status === 'requested' && !m.i_asked ? 'Decline' : 'Cancel meetup'}
              </button>
            )}
            {(m.status === 'completed' || m.my_feedback === 'great' || m.status === 'expired') && (
              <button className="secondary small" onClick={() => go('setupMeetup', { partnerId: m.other_id, topic: m.topic })}>
                {m.status === 'expired' ? 'Try another time' : 'Meet again'}
              </button>
            )}
            <button className="link small" onClick={() => go('messages', { studentId: m.other_id })}>
              Message {first}
            </button>
          </div>
        </div>
      </article>
    )
  }

  return (
    <>
      <PageHeader title="Your time together." text="Review upcoming study sessions and the people you've learned with." />
      <div className="row">
        <button className="primary" onClick={() => go('setupMeetup')}>
          + Set up a meetup
        </button>
      </div>
      {error && <p className="error">{error}</p>}

      {meetups.data.length === 0 ? (
        <section className="card empty">
          <h2>No meetups yet</h2>
          <p className="muted">Find a student and choose a time that works for both of you.</p>
          <button className="primary" onClick={() => go('findFriends', { freeMatch: true })}>
            Find a study partner
          </button>
        </section>
      ) : (
        <>
          <h2 className="spaced">Upcoming</h2>
          {upcoming.length === 0 && <p className="muted">Nothing scheduled.</p>}
          <div className="list">{upcoming.map(card)}</div>
          {past.length > 0 && (
            <>
              <h2 className="spaced">Past, cancelled & expired</h2>
              <div className="list">{past.map(card)}</div>
            </>
          )}
        </>
      )}
    </>
  )
}
