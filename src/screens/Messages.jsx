import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery } from '../api.js'
import { Avatar, PageHeader } from '../ui.jsx'

// Conversation list + one open chat (params.studentId). On a phone only one
// shows at a time; on a wide screen they sit side by side.
export default function Messages({ go, me, params }) {
  const selectedId = params.studentId
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const bottomRef = useRef(null)

  const messages = useQuery(
    () =>
      supabase
        .from('messages')
        .select('id, body, sent_at, sender_id, recipient_id')
        .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
        .order('sent_at'),
    [me.id],
  )
  const students = useQuery(() => supabase.from('students').select('id, full_name').order('full_name'), [])
  const { hidden } = useHiddenIds(me.id)

  // Check for new messages every few seconds while this screen is open.
  useEffect(() => {
    const timer = setInterval(messages.reload, 4000)
    return () => clearInterval(timer)
  }, [messages.reload])

  const chatLength = messages.data?.filter((m) => [m.sender_id, m.recipient_id].includes(selectedId)).length
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chatLength, selectedId])

  if (messages.error) return <p className="error">Could not load messages: {messages.error}</p>
  if (!messages.data || !students.data) return <p className="muted">Loading messages…</p>

  const nameOf = new Map(students.data.map((s) => [s.id, s.full_name]))

  // One conversation per other student, most recent first.
  const conversations = new Map()
  for (const m of messages.data) {
    const otherId = m.sender_id === me.id ? m.recipient_id : m.sender_id
    if (!hidden.has(otherId)) conversations.set(otherId, m)
  }
  const list = [...conversations.entries()].sort((a, b) => b[1].sent_at.localeCompare(a[1].sent_at))
  const chat = messages.data.filter(
    (m) => (m.sender_id === me.id && m.recipient_id === selectedId) || (m.sender_id === selectedId && m.recipient_id === me.id),
  )
  const newChatOptions = students.data.filter((s) => s.id !== me.id && !hidden.has(s.id) && !conversations.has(s.id))

  async function send(e) {
    e.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    setSendError(null)
    try {
      await rpc('send_message', { p_recipient_id: selectedId, p_body: draft })
      setDraft('')
      await messages.reload()
    } catch (err) {
      setSendError(err.message)
    }
    setSending(false)
  }

  return (
    <>
      <PageHeader title="A conversation is a good start." text="Ask a question or plan a time to work through something together." />

      <div className={`messages-layout ${selectedId ? 'has-chat' : ''}`}>
        <section className="card convo-list">
          {list.length === 0 && <p className="muted">No conversations yet. Say hi to someone below!</p>}
          {list.map(([otherId, last]) => (
            <button
              key={otherId}
              className={`convo ${otherId === selectedId ? 'on' : ''}`}
              onClick={() => go('messages', { studentId: otherId })}
            >
              <Avatar name={nameOf.get(otherId) ?? '?'} />
              <span className="convo-text">
                <strong>{nameOf.get(otherId)}</strong>
                <span className="muted">
                  {last.sender_id === me.id && 'You: '}
                  {last.body}
                </span>
              </span>
            </button>
          ))}
          {newChatOptions.length > 0 && (
            <label className="new-chat">
              <span className="muted">Start a new chat</span>
              <select value="" onChange={(e) => go('messages', { studentId: e.target.value })}>
                <option value="">Choose a student…</option>
                {newChatOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        <section className="card chat">
          {!selectedId && <p className="muted">Pick a conversation to start chatting.</p>}
          {selectedId && hidden.has(selectedId) && <p className="muted">You can't message this student.</p>}
          {selectedId && !hidden.has(selectedId) && (
            <>
              <div className="chat-header">
                <button className="link back-to-list" onClick={() => go('messages')}>
                  ← Chats
                </button>
                <h2>{nameOf.get(selectedId) ?? 'Student'}</h2>
                <div className="row">
                  <button className="link" onClick={() => go('setupMeetup', { partnerId: selectedId })}>
                    Schedule a meetup →
                  </button>
                  <button className="link muted-link" onClick={() => go('blockReport', { studentId: selectedId })}>
                    Block / report
                  </button>
                </div>
              </div>

              <div className="bubbles">
                {chat.length === 0 && <p className="muted">No messages yet. Say hello!</p>}
                {chat.map((m) => (
                  <p key={m.id} className={`bubble ${m.sender_id === me.id ? 'mine' : ''}`}>
                    {m.body}
                    <span className="bubble-time">
                      {new Date(m.sent_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </p>
                ))}
                <div ref={bottomRef} />
              </div>

              {sendError && <p className="error">{sendError}</p>}
              <form className="send-row" onSubmit={send}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Ask about a class or say hello…"
                  maxLength={2000}
                  aria-label="Message"
                />
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
