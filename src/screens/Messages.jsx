import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, usePolling, useQuery, useRpc } from '../api.js'
import { ActiveDot, Avatar, DemoBadge, PageHeader, activeLabel } from '../ui.jsx'

// Conversation suggestions so a nervous first message isn't a blank box.
function icebreakers(me, other) {
  const myCourses = new Set(me.student_courses.map((c) => c.courses.code))
  const shared = other?.student_courses?.map((c) => c.courses.code).find((c) => myCourses.has(c))
  const theirStrength = other?.student_skills?.map((k) => k.skills.name).find((n) => me.student_needs.some((x) => x.skills.name === n))
  return [
    shared && `Hi! I'm in ${shared} too. Want to study together this week?`,
    theirStrength && `Hi! I saw you're strong in ${theirStrength}. Could you help me with it sometime?`,
    other?.ask_me_about && `Hi! Your profile says to ask you about ${other.ask_me_about}. I'd love to hear about it!`,
    'Hi! Want to meet up and review for the next exam?',
  ].filter(Boolean)
}

// Inbox (Chats / Requests) + one open chat (params.studentId). On a phone
// only one shows at a time; on a wide screen they sit side by side.
export default function Messages({ go, me, params, refreshCounts }) {
  const selectedId = params.studentId
  const [tab, setTab] = useState(params.tab ?? 'chats')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const bottomRef = useRef(null)

  const inbox = useRpc('my_inbox', {}, [me.id])
  const chat = useQuery(() => (selectedId ? rpc('my_chat', { p_other_id: selectedId }) : Promise.resolve(null)), [selectedId])
  const students = useQuery(
    () =>
      supabase
        .from('students')
        .select('id, user_id, full_name, avatar_color, ask_me_about, student_courses(courses(code)), student_skills(skills(name))')
        .order('full_name'),
    [],
  )
  const { hidden } = useHiddenIds(me.id)

  // Check for new messages every few seconds while this screen is open.
  usePolling(inbox.reload, 5000)
  usePolling(chat.reload, 4000)

  // Opening a chat marks it read, so refresh the badges.
  useEffect(() => {
    if (chat.data) refreshCounts()
  }, [chat.data?.messages?.length, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const chatLength = chat.data?.messages?.length
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chatLength, selectedId])

  if (inbox.error) return <p className="error">Could not load messages: {inbox.error}</p>
  if (!inbox.data || !students.data) return <p className="muted">Loading messages…</p>

  const chats = inbox.data.filter((c) => c.state !== 'request_in')
  const requests = inbox.data.filter((c) => c.state === 'request_in')
  const list = tab === 'requests' ? requests : chats
  const inInbox = new Set(inbox.data.map((c) => c.other_id))
  const newChatOptions = students.data.filter((s) => s.id !== me.id && !hidden.has(s.id) && !inInbox.has(s.id))
  const otherProfile = students.data.find((s) => s.id === selectedId)
  const c = chat.data

  async function send(text) {
    const body = (text ?? draft).trim()
    if (!body) return
    setSending(true)
    setSendError(null)
    try {
      await rpc('send_message', { p_recipient_id: selectedId, p_body: body })
      setDraft('')
      await Promise.all([chat.reload(), inbox.reload()])
    } catch (err) {
      setSendError(err.message)
    }
    setSending(false)
  }

  async function respond(accept) {
    try {
      await rpc('respond_message_request', { p_other_id: selectedId, p_accept: accept })
      await Promise.all([chat.reload(), inbox.reload()])
      refreshCounts()
      if (!accept) go('messages', { tab: 'requests' })
    } catch (err) {
      setSendError(err.message)
    }
  }

  return (
    <>
      <PageHeader title="A conversation is a good start." text="Ask a question or plan a time to work through something together." />

      <div className={`messages-layout ${selectedId ? 'has-chat' : ''}`}>
        <section className="card convo-list">
          <div className="segmented">
            <button className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}>
              Chats
            </button>
            <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
              Requests{requests.length > 0 && <span className="count">{requests.length}</span>}
            </button>
          </div>
          {tab === 'requests' && <p className="muted small-text">Messages from people you haven't connected with yet. They can't see if you've read them.</p>}
          {list.length === 0 && <p className="muted">{tab === 'requests' ? 'No message requests.' : 'No conversations yet. Say hi to someone below!'}</p>}
          {list.map((conv) => (
            <button
              key={conv.other_id}
              className={`convo ${conv.other_id === selectedId ? 'on' : ''} ${conv.unread > 0 ? 'unread' : ''}`}
              onClick={() => go('messages', { studentId: conv.other_id, tab })}
            >
              <Avatar name={conv.name} color={conv.color} small />
              <span className="convo-text">
                <strong>
                  {conv.name}
                  {conv.unread > 0 && <span className="count">{conv.unread}</span>}
                </strong>
                <span className="muted">
                  {conv.state === 'request_out' && '(waiting for them to accept) '}
                  {conv.last_from_me && 'You: '}
                  {conv.last_body}
                </span>
              </span>
            </button>
          ))}
          {tab === 'chats' && newChatOptions.length > 0 && (
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
          {selectedId && chat.error && <p className="error">{chat.error}</p>}
          {selectedId && !c && !chat.error && <p className="muted">Loading…</p>}
          {selectedId && c && (
            <>
              <div className="chat-header">
                <button className="link back-to-list" onClick={() => go('messages', { tab })}>
                  ← Chats
                </button>
                <div>
                  <h2>
                    {c.other.name} <DemoBadge student={c.other} />
                  </h2>
                  {activeLabel(c.other.last_active_at) && <ActiveDot lastActive={c.other.last_active_at} />}
                </div>
                <div className="row">
                  {c.state !== 'blocked' && (
                    <button className="link" onClick={() => go('setupMeetup', { partnerId: selectedId })}>
                      Schedule a meetup →
                    </button>
                  )}
                  <button className="link muted-link" onClick={() => go('blockReport', { studentId: selectedId })}>
                    Block / report
                  </button>
                </div>
              </div>

              {c.state === 'request_in' && (
                <div className="notice request-banner">
                  <p>
                    <strong>{c.other.name.split(' ')[0]} wants to message you.</strong> Accept to chat, or decline and they can't message you again.
                  </p>
                  <div className="row">
                    <button className="primary small" onClick={() => respond(true)}>
                      Accept
                    </button>
                    <button className="secondary small" onClick={() => respond(false)}>
                      Decline
                    </button>
                  </div>
                </div>
              )}
              {c.state === 'request_out' && <p className="notice">Message request sent. You can keep chatting; they'll see it once they accept.</p>}

              <div className="bubbles">
                {c.messages.length === 0 && c.state !== 'blocked' && (
                  <div className="icebreakers">
                    <p className="muted">Not sure what to say? Tap one to send it:</p>
                    {icebreakers(me, otherProfile).map((t) => (
                      <button key={t} className="chip" disabled={!c.can_send || sending} onClick={() => send(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {c.messages.map((m, i) => (
                  <p key={m.id} className={`bubble ${m.mine ? 'mine' : ''}`}>
                    {m.body}
                    <span className="bubble-time">
                      {new Date(m.sent_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      {m.mine && i === c.messages.length - 1 && m.read_at && ' · Seen'}
                    </span>
                  </p>
                ))}
                <div ref={bottomRef} />
              </div>

              {sendError && <p className="error">{sendError}</p>}
              {c.can_send ? (
                <form
                  className="send-row"
                  onSubmit={(e) => {
                    e.preventDefault()
                    send()
                  }}
                >
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask about a class or say hello…" maxLength={2000} aria-label="Message" />
                  <button type="submit" className="primary" disabled={sending || !draft.trim()}>
                    Send
                  </button>
                </form>
              ) : (
                <p className="notice">
                  {c.reason}{' '}
                  {c.state === 'chat' && (
                    <button className="link" onClick={() => go('findFriends', { show: 'all' })}>
                      Find them in Find Friends →
                    </button>
                  )}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </>
  )
}
