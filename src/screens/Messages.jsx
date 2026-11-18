import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, suggestOpeners, useHiddenIds, usePolling, useQuery, useRpc } from '../api.js'
import { formatWhen, googleCalendarLink, nextStart, sharedSlots } from '../time.js'
import { ActiveDot, Avatar, ChatBar, DemoBadge, Dialog, Icon, MoreMenu, PLACES, PageHeader, ProfileDetails, activeLabel, arrowKeys, hasProfileDetails, programLabel, tabProps } from '../ui.jsx'

// Inbox (Chats / Requests) + one open chat (params.studentId). On a phone
// only one shows at a time; on a wide screen they sit side by side.
export default function Messages({ go, back, me, params, refreshCounts }) {
  const selectedId = params.studentId
  const [tab, setTab] = useState(params.tab ?? 'chats')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const bottomRef = useRef(null)
  const profileRef = useRef(null)
  const inputRef = useRef(null)
  // AI-written openers for an empty chat: { loading, openers, error }.
  const [ai, setAi] = useState({})
  const aiFor = useRef(null) // the chat they're for, so a late reply can't land in another chat

  const inbox = useRpc('my_inbox', {}, [me.id])
  const chat = useQuery(() => (selectedId ? rpc('my_chat', { p_other_id: selectedId }) : Promise.resolve(null)), [selectedId])
  const students = useQuery(
    () =>
      supabase
        .from('students')
        .select(
          'id, user_id, full_name, avatar_color, program_status, bio, ask_me_about, contact_setting, student_courses(courses(code)), ' +
            'student_skills(skills(name)), student_needs(skills(name)), availability_slots(day_of_week, start_time, duration_minutes)',
        )
        .order('full_name'),
    [],
  )
  const meetups = useRpc('my_meetups', {}, [me.id])
  const { hidden } = useHiddenIds(me.id)

  // Check for new messages every few seconds while this screen is open.
  usePolling(inbox.reload, 5000)
  usePolling(chat.reload, 4000)
  usePolling(meetups.reload, 8000)

  // Opening a chat marks it read, so refresh the badges.
  useEffect(() => {
    if (chat.data) refreshCounts()
  }, [chat.data?.messages?.length, selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const chatLength = chat.data?.messages?.length
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chatLength, selectedId])

  // Each chat starts without AI suggestions.
  useEffect(() => {
    aiFor.current = null
    setAi({})
  }, [selectedId])

  if (inbox.error) return <p className="error">Could not load messages: {inbox.error}</p>
  if (!inbox.data || !students.data) return <p className="muted">Loading messages…</p>

  const chats = inbox.data.filter((c) => c.state !== 'request_in')
  const requests = inbox.data.filter((c) => c.state === 'request_in')
  const list = tab === 'requests' ? requests : chats
  const inInbox = new Set(inbox.data.map((c) => c.other_id))
  const newChatOptions = students.data.filter((s) => s.id !== me.id && !hidden.has(s.id) && !inInbox.has(s.id))
  const otherProfile = students.data.find((s) => s.id === selectedId)
  const c = chat.data

  async function send() {
    const body = draft.trim()
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

  async function writeWithAi() {
    const id = selectedId
    aiFor.current = id
    setAi((a) => ({ ...a, loading: true, error: null }))
    try {
      const openers = await suggestOpeners(id)
      if (aiFor.current === id) setAi({ openers })
    } catch (err) {
      if (aiFor.current === id) setAi((a) => ({ ...a, loading: false, error: err.message }))
    }
  }

  // An AI suggestion goes into the message box to read and edit; it's never
  // sent for them.
  function pickOpener(text) {
    setDraft(text)
    inputRef.current?.focus()
  }

  async function respond(accept) {
    try {
      await rpc('respond_message_request', { p_other_id: selectedId, p_accept: accept })
      await Promise.all([chat.reload(), inbox.reload()])
      refreshCounts()
      if (!accept) go('messages', { tab: 'requests' }, { replace: true })
    } catch (err) {
      setSendError(err.message)
    }
  }

  return (
    <>
      {/* In an open chat on a phone, the conversation gets the whole screen. */}
      <PageHeader className={selectedId ? 'hide-on-phone' : ''} title="A conversation is a good start." text="Ask a question or plan a time to work through something together." />

      <div className={`messages-layout ${selectedId ? 'has-chat' : ''}`}>
        <section className="card convo-list">
          <div className="segmented" role="tablist" aria-label="Inbox" onKeyDown={arrowKeys({ select: true })}>
            <button {...tabProps(tab === 'chats')} className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}>
              Chats
            </button>
            <button {...tabProps(tab === 'requests')} className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
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

        {/* The open chat, with its meetups box underneath. */}
        <div className="chat-column">
          <section className="card chat">
            {!selectedId && <p className="muted">Pick a conversation to start chatting.</p>}
            {selectedId && chat.error && <p className="error">{chat.error}</p>}
            {selectedId && !c && !chat.error && <p className="muted">Loading…</p>}
            {selectedId && c && (
              <>
                <ChatBar
                  onBack={() => back('messages', { tab })}
                  backLabel="Back to chats"
                  icon={<Avatar name={c.other.name} color={c.other.color} small />}
                  title={c.other.name}
                  subtitle={
                    <>
                      <DemoBadge student={c.other} />
                      {activeLabel(c.other.last_active_at) && <ActiveDot lastActive={c.other.last_active_at} />}
                    </>
                  }
                >
                  {c.state !== 'blocked' && (
                    <button className="secondary small" aria-label={`Schedule a meetup with ${c.other.name.split(' ')[0]}`} onClick={() => go('setupMeetup', { partnerId: selectedId })}>
                      Schedule
                    </button>
                  )}
                  <MoreMenu label={`More options for ${c.other.name}`}>
                    {otherProfile && <button onClick={() => profileRef.current.showModal()}>View profile</button>}
                    <button className="danger" onClick={() => go('blockReport', { studentId: selectedId })}>
                      Block or report
                    </button>
                  </MoreMenu>
                </ChatBar>
                {otherProfile && (
                  <Dialog
                    dialogRef={profileRef}
                    titleId="profile-title"
                    title={
                      <div className="person-head">
                        <Avatar name={otherProfile.full_name} color={otherProfile.avatar_color} />
                        <div className="person-head-text">
                          <h2>{otherProfile.full_name}</h2>
                          <p className="person-meta">
                            <span className={`badge ${otherProfile.program_status}`}>{programLabel(otherProfile.program_status)}</span>
                            <ActiveDot lastActive={c.other.last_active_at} />
                          </p>
                        </div>
                      </div>
                    }
                  >
                    {hasProfileDetails(otherProfile) ? <ProfileDetails student={otherProfile} /> : <p className="muted">They haven't filled in their profile yet.</p>}
                  </Dialog>
                )}

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
                  {/* An empty chat: type your own first message, or have AI write
                      3 from what you two share (classes, topics, free times). */}
                  {c.messages.length === 0 && c.can_send && (
                    <div className="icebreakers">
                      {ai.openers ? (
                        <>
                          <p className="muted">Written by AI from what you two share. Tap one to edit it, then send:</p>
                          {ai.openers.map((t) => (
                            <button key={t} className="chip" onClick={() => pickOpener(t)}>
                              {t}
                            </button>
                          ))}
                        </>
                      ) : (
                        <p className="muted">Say hi and suggest a time to study, or let AI write a first message from your shared classes and free times.</p>
                      )}
                      {/* Before any suggestions, AI is the one thing to try, so it's a
                          real button; after, asking again is a quieter link. */}
                      <button type="button" className={ai.openers ? 'link ai-write' : 'primary small ai-write'} disabled={ai.loading} onClick={writeWithAi}>
                        {ai.openers ? 'Write 3 different ones' : '✨ Write 3 openers with AI'}
                      </button>
                      <p className="muted small-text" role="status">
                        {ai.loading ? 'Writing 3 suggestions…' : ai.error}
                      </p>
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
                    <input
                      ref={inputRef}
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

          {selectedId && c && otherProfile && c.state !== 'blocked' && (
            <ChatMeetups
              key={selectedId}
              me={me}
              other={otherProfile}
              chat={c}
              meetups={meetups.data}
              reload={meetups.reload}
              refreshCounts={refreshCounts}
              go={go}
            />
          )}
        </div>
      </div>
    </>
  )
}

// A box below the conversation: your upcoming study sessions with this person (a
// short version of My Meetups) and the next times you're both free. Asking
// takes two taps: pick a time, then Send request, with the place you used
// last already chosen. The Schedule button up top still covers any other time.
function ChatMeetups({ me, other, chat, meetups, reload, refreshCounts, go }) {
  const [pick, setPick] = useState(null) // { at: Date, minutes }
  const [place, setPlace] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  if (!meetups) return null

  const first = other.full_name.split(' ')[0]
  const now = Date.now()
  const upcoming = meetups.filter((m) => m.other_id === other.id && ['requested', 'confirmed'].includes(m.status) && new Date(m.scheduled_at) > now)

  // Would the server take a meetup invite? Mirrors my_chat's states and
  // _contact_block_reason in supabase/functions.sql.
  const myClasses = new Set(me.student_courses.map((x) => x.courses.code))
  const canInvite =
    chat.state === 'request_in' ||
    (chat.state === 'chat' && chat.can_send) ||
    (chat.state === 'request_out' &&
      (other.contact_setting === 'anyone' || (other.contact_setting === 'courses' && other.student_courses.some((x) => myClasses.has(x.courses.code)))))

  // The next few times you're both free, starting at least 2 hours from now.
  // None while a request is waiting, so nobody sends the same one twice.
  const waiting = upcoming.some((m) => m.status === 'requested')
  const from = new Date(now + 2 * 3600e3)
  const times =
    canInvite && !waiting
      ? sharedSlots(me.availability_slots, other.availability_slots)
          .map((slot) => ({ at: nextStart(slot, from), minutes: Math.min(60, slot.duration_minutes) }))
          .filter((t) => t.at && !upcoming.some((m) => new Date(m.scheduled_at).getTime() === t.at.getTime()))
          .sort((a, b) => a.at - b.at)
          .slice(0, 3)
      : []
  if (upcoming.length === 0 && times.length === 0) return null

  // The place of your latest meetup with anyone, else the first usual place.
  const lastPlace = meetups.filter((m) => m.status !== 'cancelled').at(-1)?.location
  const places = lastPlace && !PLACES.includes(lastPlace) ? [lastPlace, ...PLACES] : PLACES
  const where = place ?? lastPlace ?? PLACES[0]

  async function run(fn, args) {
    setBusy(true)
    setError(null)
    try {
      await rpc(fn, args)
      await reload()
      refreshCounts()
      setPick(null)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <section className="card chat-meetups" aria-label={`Meetups with ${first}`}>
      <div className="chat-meetups-head">
        <h3>Meetups with {first}</h3>
        <button className="link small" onClick={() => go('meetups')}>
          My Meetups →
        </button>
      </div>

      {upcoming.map((m) => (
        <div key={m.id} className="chat-meetup">
          <Icon name="calendar" />
          <div className="chat-meetup-text">
            <p>
              <strong>{formatWhen(m.scheduled_at)}</strong>{' '}
              <span className={`badge status-${m.status}`}>{m.status === 'confirmed' ? 'Confirmed' : m.i_asked ? `Waiting for ${first}` : `${first} wants to meet`}</span>
            </p>
            <p className="muted small-text">
              {m.location}
              {m.topic && ` · ${m.topic}`}
            </p>
          </div>
          {m.status === 'requested' && !m.i_asked && (
            <div className="row">
              <button className="primary small" disabled={busy} onClick={() => run('set_meetup_status', { p_meetup_id: m.id, p_status: 'confirmed' })}>
                Confirm
              </button>
              <button className="link small" disabled={busy} onClick={() => run('set_meetup_status', { p_meetup_id: m.id, p_status: 'cancelled' })}>
                Decline
              </button>
            </div>
          )}
          {m.status === 'confirmed' && (
            <a className="secondary small button-link" href={googleCalendarLink(m)} target="_blank" rel="noreferrer">
              Add to Google Calendar
            </a>
          )}
        </div>
      ))}

      {times.length > 0 && (
        <div>
          <p className="chat-free-label">
            <Icon name="clock" size={16} />
            You're both free
          </p>
          <div className="row">
            {times.map((t) => {
              const on = pick?.at.getTime() === t.at.getTime()
              return (
                <button key={t.at.getTime()} type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => setPick(on ? null : t)}>
                  {formatWhen(t.at)}
                </button>
              )
            })}
          </div>
          {pick && (
            <div className="chat-invite">
              <label>
                Where
                <select value={where} onChange={(e) => setPlace(e.target.value)}>
                  {places.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary small"
                disabled={busy}
                onClick={() =>
                  run('request_meetup', { p_partner_id: other.id, p_scheduled_at: pick.at.toISOString(), p_duration_minutes: pick.minutes, p_topic: null, p_location: where })
                }
              >
                {busy ? 'Sending…' : 'Send request'}
              </button>
              <p className="muted small-text">
                {pick.minutes === 60 ? '1 hour' : `${pick.minutes} minutes`}. {first} gets a request to confirm.
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </section>
  )
}
