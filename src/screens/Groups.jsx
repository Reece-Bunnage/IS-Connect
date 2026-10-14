import { useEffect, useRef, useState } from 'react'
import { rpc, usePolling, useQuery, useRpc } from '../api.js'
import { ActiveDot, Avatar, DemoBadge, PageHeader } from '../ui.jsx'

// Study groups: one per class (you're in the groups for your classes) plus
// groups made by "Can't find anyone?" matching. List + chat, like Messages.
export default function Groups({ go, me, params, refreshCounts, showToast }) {
  const selectedId = params.groupId
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const bottomRef = useRef(null)

  const groups = useRpc('my_groups', {}, [me.id])
  const detail = useQuery(() => (selectedId ? rpc('group_detail', { p_group_id: selectedId }) : Promise.resolve(null)), [selectedId])
  usePolling(groups.reload, 8000)
  usePolling(detail.reload, 5000)

  useEffect(() => {
    if (detail.data) refreshCounts()
  }, [detail.data?.messages?.length, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const count = detail.data?.messages?.length
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [count, selectedId])

  if (groups.error) return <p className="error">Could not load groups: {groups.error}</p>
  if (!groups.data) return <p className="muted">Loading groups…</p>

  const g = detail.data

  async function send(e) {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    setError(null)
    try {
      await rpc('send_group_message', { p_group_id: selectedId, p_body: draft })
      setDraft('')
      await Promise.all([detail.reload(), groups.reload()])
    } catch (err) {
      setError(err.message)
    }
    setSending(false)
  }

  async function leave() {
    try {
      await rpc('leave_group', { p_group_id: selectedId })
      showToast({ text: `You left ${g.name}.` })
      await groups.reload()
      go('groups')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <PageHeader title="Study together." text="Every class has a group. Add classes to your profile to join them, or get matched from Find Friends." />

      <div className={`messages-layout ${selectedId ? 'has-chat' : ''}`}>
        <section className="card convo-list">
          {groups.data.length === 0 && (
            <div>
              <p className="muted">You're not in any groups yet.</p>
              <button className="link" onClick={() => go('createProfile')}>
                Add your classes →
              </button>
            </div>
          )}
          {groups.data.map((grp) => (
            <button key={grp.id} className={`convo ${grp.id === selectedId ? 'on' : ''} ${grp.unread > 0 ? 'unread' : ''}`} onClick={() => go('groups', { groupId: grp.id })}>
              <span className={`group-icon ${grp.kind}`} aria-hidden="true">
                {grp.kind === 'match' ? '✨' : '#'}
              </span>
              <span className="convo-text">
                <strong>
                  {grp.name}
                  {grp.unread > 0 && <span className="count">{grp.unread}</span>}
                </strong>
                <span className="muted">{grp.last_body ? `${grp.sender_name}: ${grp.last_body}` : `${grp.member_count} member${grp.member_count === 1 ? '' : 's'}`}</span>
              </span>
            </button>
          ))}
          <button className="secondary small spaced" onClick={() => go('findFriends')}>
            Find a study match →
          </button>
        </section>

        <section className="card chat">
          {!selectedId && <p className="muted">Pick a group to see its chat.</p>}
          {selectedId && detail.error && <p className="error">{detail.error}</p>}
          {selectedId && g && (
            <>
              <div className="chat-header">
                <button className="link back-to-list" onClick={() => go('groups')}>
                  ← Groups
                </button>
                <div>
                  <h2>{g.name}</h2>
                  <p className="muted small-text">
                    {g.kind === 'match' ? 'Matched because you all asked for the same thing.' : 'Everyone taking this class.'} {g.members.length} members
                  </p>
                </div>
                {g.kind === 'match' && (
                  <button className="link muted-link" onClick={leave}>
                    Leave group
                  </button>
                )}
              </div>

              <details className="members">
                <summary>Members</summary>
                <ul>
                  {g.members.map((m) => (
                    <li key={m.id}>
                      <Avatar name={m.name} color={m.color} small />
                      <span>
                        {m.name}
                        {m.id === me.id && ' (you)'} <DemoBadge student={m} /> <ActiveDot lastActive={m.last_active_at} />
                      </span>
                      {m.id !== me.id && (
                        <button className="link small" onClick={() => go('messages', { studentId: m.id })}>
                          Message
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>

              <div className="bubbles">
                {g.messages.length === 0 && (
                  <p className="muted">
                    {g.kind === 'match' ? "You've been matched! Say hi and pick a time to meet." : 'No messages yet. Start the conversation!'}
                  </p>
                )}
                {g.messages.map((m) => (
                  <div key={m.id} className={`group-msg ${m.mine ? 'mine' : ''}`}>
                    {!m.mine && <Avatar name={m.name} color={m.color} small />}
                    <p className={`bubble ${m.mine ? 'mine' : ''}`}>
                      {!m.mine && <span className="bubble-name">{m.name.split(' ')[0]}</span>}
                      {m.body}
                      <span className="bubble-time">{new Date(m.sent_at).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                    </p>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {error && <p className="error">{error}</p>}
              <form className="send-row" onSubmit={send}>
                <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${g.name}…`} maxLength={2000} aria-label="Group message" />
                <button type="submit" className="primary" disabled={sending || !draft.trim()}>
                  Send
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </>
  )
}
