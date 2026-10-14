import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery } from '../api.js'
import { formatWhen } from '../time.js'
import { Avatar, PageHeader } from '../ui.jsx'

const STATUS_LABEL = { requested: 'Waiting to confirm', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' }

export default function Meetups({ go, me }) {
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  const meetups = useQuery(
    () =>
      supabase
        .from('meetups')
        .select('id, scheduled_at, location, status, requester_id, partner_id, requester:requester_id(full_name), partner:partner_id(full_name)')
        .or(`requester_id.eq.${me.id},partner_id.eq.${me.id}`)
        .order('scheduled_at'),
    [me.id],
  )

  if (meetups.error) return <p className="error">Could not load meetups: {meetups.error}</p>
  if (!meetups.data) return <p className="muted">Loading meetups…</p>

  const now = Date.now()
  const isUpcoming = (m) => new Date(m.scheduled_at) >= now && ['requested', 'confirmed'].includes(m.status)
  const upcoming = meetups.data.filter(isUpcoming)
  const past = meetups.data.filter((m) => !isUpcoming(m)).reverse()

  async function setStatus(m, status) {
    setBusyId(m.id)
    setError(null)
    try {
      await rpc('set_meetup_status', { p_meetup_id: m.id, p_status: status })
      await meetups.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusyId(null)
  }

  function card(m) {
    const iAsked = m.requester_id === me.id
    const other = iAsked ? m.partner : m.requester
    const otherId = iAsked ? m.partner_id : m.requester_id
    const busy = busyId === m.id
    const inPast = new Date(m.scheduled_at) < now
    return (
      <article key={m.id} className="card person">
        <Avatar name={other.full_name} />
        <div className="person-body">
          <h3>
            {other.full_name} <span className={`badge status-${m.status}`}>{STATUS_LABEL[m.status]}</span>
          </h3>
          <p>
            📅 {formatWhen(m.scheduled_at)}
            <br />📍 {m.location}
          </p>
          <p className="muted">{iAsked ? 'You asked to meet.' : `${other.full_name.split(' ')[0]} asked to meet.`}</p>
          <div className="row actions">
            {m.status === 'requested' && !iAsked && !inPast && (
              <button className="primary small" disabled={busy} onClick={() => setStatus(m, 'confirmed')}>
                Confirm
              </button>
            )}
            {['requested', 'confirmed'].includes(m.status) && !inPast && (
              <button className="secondary small" disabled={busy} onClick={() => setStatus(m, 'cancelled')}>
                {m.status === 'requested' && !iAsked ? 'Decline' : 'Cancel'}
              </button>
            )}
            {m.status === 'confirmed' && inPast && (
              <button className="primary small" disabled={busy} onClick={() => setStatus(m, 'completed')}>
                Mark completed
              </button>
            )}
            <button className="secondary small" onClick={() => go('messages', { studentId: otherId })}>
              Message
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
              <h2 className="spaced">Past & cancelled</h2>
              <div className="list">{past.map(card)}</div>
            </>
          )}
        </>
      )}
    </>
  )
}
