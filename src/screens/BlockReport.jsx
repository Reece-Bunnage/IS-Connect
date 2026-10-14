import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery, useRpc } from '../api.js'
import { Avatar, PageHeader } from '../ui.jsx'

const CONTACT_OPTIONS = [
  ['anyone', 'Anyone on IS-Connect', 'Anyone can send you a message request or meetup invite.'],
  ['courses', 'Classmates and friends', 'Only people in one of your classes, or your friends. (Recommended)'],
  ['friends', 'Friends only', 'Others can still send you a friend request first.'],
]

// Who can contact you, and blocking or reporting people you've interacted
// with. Blocking hides you from each other everywhere and cancels upcoming meetups.
export default function BlockReport({ go, me, params, showToast, onSaved }) {
  const [confirm, setConfirm] = useState(null) // { id, report: bool }
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const contacts = useRpc('my_contacts', {}, [me.id])
  const blocks = useRpc('my_blocks', {}, [me.id])
  const students = useQuery(() => supabase.from('students').select('id, full_name, avatar_color'), [])

  if (contacts.error || blocks.error) return <p className="error">Could not load: {contacts.error || blocks.error}</p>
  if (!contacts.data || !blocks.data || !students.data) return <p className="muted">Loading…</p>

  const byId = new Map(students.data.map((s) => [s.id, s]))
  const blockedIds = new Set(blocks.data.map((b) => b.blocked_id))
  const ids = new Set(contacts.data)
  if (params.studentId) ids.add(params.studentId)
  const people = [...ids]
    .filter((id) => id !== me.id && !blockedIds.has(id) && byId.has(id))
    .sort((a, b) => (a === params.studentId ? -1 : b === params.studentId ? 1 : byId.get(a).full_name.localeCompare(byId.get(b).full_name)))

  async function setContact(value) {
    setError(null)
    try {
      await rpc('set_contact_setting', { p_setting: value })
      await onSaved()
      showToast({ text: 'Privacy setting saved.' })
    } catch (err) {
      setError(err.message)
    }
  }

  async function block(e) {
    e.preventDefault()
    const person = byId.get(confirm.id)
    setBusy(true)
    setError(null)
    try {
      await rpc('block_user', { p_other_id: confirm.id, p_is_report: confirm.report, p_reason: confirm.report ? reason : null })
      await Promise.all([blocks.reload(), contacts.reload()])
      const first = person.full_name.split(' ')[0]
      showToast({
        text: confirm.report ? `Reported and blocked ${first}. An admin will review it.` : `Blocked ${first}.`,
        undo: async () => {
          await rpc('unblock_user', { p_other_id: person.id })
          await blocks.reload()
        },
      })
      setConfirm(null)
      setReason('')
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function unblock(b) {
    setError(null)
    try {
      await rpc('unblock_user', { p_other_id: b.blocked_id })
      await blocks.reload()
      showToast({ text: `Unblocked ${b.name.split(' ')[0]}.` })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <PageHeader title="You're in control." text="Choose who can reach you, and block or report anyone who makes you uncomfortable." />
      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Who can message me or invite me to meet?</h2>
        <fieldset className="radio-list">
          <legend className="sr-only">Who can contact me</legend>
          {CONTACT_OPTIONS.map(([value, label, help]) => (
            <label key={value} className={`radio-card ${me.contact_setting === value ? 'on' : ''}`}>
              <input type="radio" name="contact" value={value} checked={me.contact_setting === value} onChange={() => setContact(value)} />
              <span>
                <strong>{label}</strong>
                <span className="muted">{help}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="muted small-text">Friends and people you're already chatting with can always reach you. New messages from others arrive as requests you can accept or decline.</p>
      </section>

      <section className="card">
        <h2>People you've interacted with</h2>
        {people.length === 0 && (
          <p className="muted">
            No one yet. Students you message, meet with or friend show up here.{' '}
            <button className="link" onClick={() => go('findFriends')}>
              Find Friends →
            </button>
          </p>
        )}
        <div className="list">
          {people.map((id) => {
            const p = byId.get(id)
            const first = p.full_name.split(' ')[0]
            return (
              <div key={id} className={`person-row ${id === params.studentId ? 'highlight' : ''}`}>
                <Avatar name={p.full_name} color={p.avatar_color} small />
                <div className="person-body">
                  <strong>{p.full_name}</strong>
                  {confirm?.id === id ? (
                    <form className="form confirm-box" onSubmit={block}>
                      <p>
                        {confirm.report ? `Report and block ${first}?` : `Block ${first}?`} You won't see each other, your friendship is removed, and upcoming meetups
                        with them are cancelled.
                      </p>
                      {confirm.report && (
                        <label>
                          What happened? (sent to the admins)
                          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} required placeholder="e.g. Sent spam links" />
                        </label>
                      )}
                      <div className="row">
                        <button type="submit" className="primary small danger-fill" disabled={busy}>
                          {confirm.report ? 'Report & block' : 'Block'}
                        </button>
                        <button type="button" className="secondary small" onClick={() => setConfirm(null)}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="row actions">
                      <button className="secondary small" onClick={() => setConfirm({ id, report: false })}>
                        Block
                      </button>
                      <button className="secondary small danger" onClick={() => setConfirm({ id, report: true })}>
                        Report
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="card">
        <h2>Blocked</h2>
        {blocks.data.length === 0 && <p className="muted">You haven't blocked anyone.</p>}
        <div className="list">
          {blocks.data.map((b) => (
            <div key={b.blocked_id} className="person-row">
              <Avatar name={b.name} color={b.color} small />
              <div className="person-body">
                <strong>{b.name}</strong>
                <p className="muted">
                  {b.is_report ? `Reported: ${b.reason}` : 'Blocked'} · {new Date(b.created_at).toLocaleDateString()}
                </p>
                <button className="link small" onClick={() => unblock(b)}>
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
