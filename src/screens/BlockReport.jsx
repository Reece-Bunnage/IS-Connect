import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery } from '../api.js'
import { Avatar, PageHeader } from '../ui.jsx'

// Block or report students you've interacted with. Blocking hides you from
// each other everywhere and cancels upcoming meetups.
export default function BlockReport({ go, me, params }) {
  const [reportingId, setReportingId] = useState(null)
  const [reason, setReason] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  const data = useQuery(async () => {
    const mine = (col) => `${col}.eq.${me.id}`
    const [students, messages, meetups, friendships, blocks] = await Promise.all([
      supabase.from('students').select('id, full_name'),
      supabase.from('messages').select('sender_id, recipient_id').or(`${mine('sender_id')},${mine('recipient_id')}`),
      supabase.from('meetups').select('requester_id, partner_id').or(`${mine('requester_id')},${mine('partner_id')}`),
      supabase.from('friendships').select('requester_id, addressee_id').or(`${mine('requester_id')},${mine('addressee_id')}`),
      supabase.from('user_blocks').select('blocked_id, is_report, reason, created_at').eq('blocker_id', me.id),
    ])
    const error = [students, messages, meetups, friendships, blocks].find((r) => r.error)?.error
    if (error) return { error }

    // Everyone you've messaged, met with or friended (plus whoever you came here to block).
    const ids = new Set(params.studentId ? [params.studentId] : [])
    for (const m of messages.data) ids.add(m.sender_id).add(m.recipient_id)
    for (const m of meetups.data) ids.add(m.requester_id).add(m.partner_id)
    for (const f of friendships.data) ids.add(f.requester_id).add(f.addressee_id)
    ids.delete(me.id)
    return { data: { names: new Map(students.data.map((s) => [s.id, s.full_name])), ids, blocks: blocks.data } }
  }, [me.id, params.studentId])

  if (data.error) return <p className="error">Could not load: {data.error}</p>
  if (!data.data) return <p className="muted">Loading…</p>

  const { names, ids, blocks } = data.data
  const blockedIds = new Set(blocks.map((b) => b.blocked_id))
  const people = [...ids]
    .filter((id) => !blockedIds.has(id) && names.has(id))
    .sort((a, b) => (a === params.studentId ? -1 : b === params.studentId ? 1 : names.get(a).localeCompare(names.get(b))))

  async function act(id, fn, args, message) {
    setBusyId(id)
    setError(null)
    setDone(null)
    try {
      await rpc(fn, { p_other_id: id, ...args })
      setReportingId(null)
      setReason('')
      setDone(message)
      await data.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusyId(null)
  }

  return (
    <>
      <PageHeader title="You're in control." text="Block or report someone you've interacted with. They won't be able to message you, friend you, or set up meetups." />
      {error && <p className="error">{error}</p>}
      {done && <p className="notice">{done}</p>}

      <section className="card">
        <h2>People you've interacted with</h2>
        {people.length === 0 && (
          <p className="muted">
            No one yet. Students you message, meet with or friend will show up here.{' '}
            <button className="link" onClick={() => go('findFriends')}>
              Find Friends →
            </button>
          </p>
        )}
        <div className="list">
          {people.map((id) => (
            <div key={id} className={`person-row ${id === params.studentId ? 'highlight' : ''}`}>
              <Avatar name={names.get(id)} />
              <div className="person-body">
                <strong>{names.get(id)}</strong>
                {reportingId === id ? (
                  <form
                    className="form"
                    onSubmit={(e) => {
                      e.preventDefault()
                      act(id, 'block_user', { p_is_report: true, p_reason: reason }, `Reported and blocked ${names.get(id)}. Thanks for keeping IS-Connect safe.`)
                    }}
                  >
                    <label>
                      What happened?
                      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required placeholder="e.g. Sent spam links" />
                    </label>
                    <div className="row">
                      <button type="submit" className="primary small" disabled={busyId === id}>
                        Report & block
                      </button>
                      <button type="button" className="secondary small" onClick={() => setReportingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="row actions">
                    <button
                      className="secondary small"
                      disabled={busyId === id}
                      onClick={() => act(id, 'block_user', { p_is_report: false, p_reason: null }, `Blocked ${names.get(id)}.`)}
                    >
                      Block
                    </button>
                    <button className="secondary small danger" onClick={() => setReportingId(id)}>
                      Report
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Blocked</h2>
        {blocks.length === 0 && <p className="muted">You haven't blocked anyone.</p>}
        <div className="list">
          {blocks.map((b) => (
            <div key={b.blocked_id} className="person-row">
              <Avatar name={names.get(b.blocked_id) ?? '?'} />
              <div className="person-body">
                <strong>{names.get(b.blocked_id)}</strong>
                <p className="muted">
                  {b.is_report ? `Reported: ${b.reason}` : 'Blocked'} · {new Date(b.created_at).toLocaleDateString()}
                </p>
                <button
                  className="link small"
                  disabled={busyId === b.blocked_id}
                  onClick={() => act(b.blocked_id, 'unblock_user', {}, `Unblocked ${names.get(b.blocked_id)}.`)}
                >
                  Unblock
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
