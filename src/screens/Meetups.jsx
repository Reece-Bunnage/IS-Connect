import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function Meetups() {
  const [meetups, setMeetups] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('meetups')
      .select('id, scheduled_at, location, status, requester:requester_id(full_name), partner:partner_id(full_name)')
      .order('scheduled_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setMeetups(data)
      })
  }, [])

  return (
    <>
      <h1>My Meetups</h1>
      <p className="notice">Read-only sample meetups. Scheduling is coming next.</p>
      {error && <p className="error">{error}</p>}
      {!meetups && !error && <p className="muted">Loading…</p>}
      <div className="list">
        {meetups?.map((m) => (
          <article key={m.id} className="card">
            <h3>
              {m.requester.full_name} & {m.partner.full_name} <span className="badge">{m.status}</span>
            </h3>
            <p className="muted">
              {new Date(m.scheduled_at).toLocaleString()} · {m.location}
            </p>
          </article>
        ))}
      </div>
    </>
  )
}
