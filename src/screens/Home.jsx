import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery, useRpc } from '../api.js'
import { STUDENT_SELECT, scoreStudents } from '../matching.js'
import { formatSlot, formatWhen, googleCalendarLink, nextStart, toLocalInput } from '../time.js'
import { tipOfTheDay } from '../tips.js'
import { Avatar, CompletenessMeter, Icon, inviteClassmate, programLabel } from '../ui.jsx'

function firstName(name) {
  return name.split(' ')[0]
}

// "today", "tomorrow", "Wednesday", or "Oct 15".
function dayWord(value) {
  const d = new Date(value)
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `on ${d.toLocaleDateString(undefined, { weekday: 'long' })}`
  return `on ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

// Home, following the redesign mockup: greeting with one primary action,
// things waiting on you, your next meetup, friends free when you are (or new
// people to meet), and a quieter side rail (profile strength, tip, new study
// guides).
export default function Home({ go, me, refreshCounts, showToast }) {
  const [busy, setBusy] = useState(null)

  const students = useQuery(() => supabase.from('students').select(STUDENT_SELECT), [])
  const meetups = useRpc('my_meetups', {}, [me.id])
  const friendships = useRpc('my_friendships', {}, [me.id])
  const inbox = useRpc('my_inbox', {}, [me.id])
  const guides = useQuery(
    () =>
      supabase
        .from('study_resources')
        .select('id, title, course, uploader_id, uploader:uploader_id(full_name)')
        .order('uploaded_at', { ascending: false })
        .limit(12),
    [],
  )
  const { hidden } = useHiddenIds(me.id)

  const byId = new Map((students.data ?? []).map((s) => [s.id, s]))
  const now = Date.now()

  // Things waiting on you.
  const meetupInvites = (meetups.data ?? []).filter((m) => m.status === 'requested' && !m.i_asked && new Date(m.scheduled_at) > now)
  const friendRequests = (friendships.data ?? []).filter((f) => f.status === 'pending' && f.incoming && byId.has(f.other_id))
  const messageRequests = (inbox.data ?? []).filter((c) => c.state === 'request_in')
  const staleTimes = me.availability_updated_at && now - new Date(me.availability_updated_at) > 60 * 864e5
  const attention = [
    ...meetupInvites.map((m) => ({ kind: 'meetup', key: `m${m.id}`, m })),
    ...friendRequests.map((f) => ({ kind: 'friend', key: `f${f.id}`, f, s: byId.get(f.other_id) })),
    ...messageRequests.map((c) => ({ kind: 'message', key: `r${c.other_id}`, c })),
    ...(staleTimes ? [{ kind: 'stale', key: 'stale' }] : []),
  ]
  const waiting = attention.filter((a) => a.kind !== 'stale').length

  const next = (meetups.data ?? []).find((m) => new Date(m.scheduled_at) > now && (m.status === 'confirmed' || (m.status === 'requested' && m.i_asked)))

  // Study partners. Friends who share a free time come first, soonest first,
  // so you can plan a session. Without any, suggest new people: free when
  // you are first, then best match.
  const myRow = byId.get(me.id)
  const scored = students.data ? scoreStudents(students.data, me.id, hidden) : []
  const friendIds = new Set((friendships.data ?? []).filter((f) => f.status === 'accepted').map((f) => f.other_id))
  const friendsFree = scored
    .filter((s) => friendIds.has(s.id) && s.shared.length > 0)
    .map((s) => ({ ...s, soonest: s.shared.map((slot) => ({ slot, at: nextStart(slot) })).sort((a, b) => a.at - b.at)[0] }))
    .sort((a, b) => a.soonest.at - b.soonest.at)
    .slice(0, 3)
  const newPeople = scored.filter((s) => !friendIds.has(s.id))
  const hasFreeTogether = newPeople.some((s) => s.shared.length > 0)
  const partners = newPeople
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.shared.length > 0) - (a.shared.length > 0) || b.score - a.score)
    .slice(0, 3)

  const myCourses = new Set(me.student_courses.map((c) => c.courses.code))
  const newGuides = [...(guides.data ?? [])].sort((a, b) => myCourses.has(b.course) - myCourses.has(a.course)).slice(0, 2)

  let line = 'Find a study partner, ask your questions, and take your next step in IS.'
  if (waiting && next) line = `You have ${waiting} thing${waiting > 1 ? 's' : ''} waiting for you and a study session ${dayWord(next.scheduled_at)}.`
  else if (waiting) line = `You have ${waiting} thing${waiting > 1 ? 's' : ''} waiting for you.`
  else if (next) line = `Your next study session is ${dayWord(next.scheduled_at)}.`

  async function act(key, fn, args, toastText) {
    setBusy(key)
    try {
      await rpc(fn, args)
      await Promise.all([meetups.reload(), friendships.reload(), inbox.reload()])
      refreshCounts()
      if (toastText) showToast({ text: toastText })
    } catch (err) {
      showToast({ text: err.message })
    }
    setBusy(null)
  }

  function attentionCard(a) {
    if (a.kind === 'meetup') {
      const { m } = a
      return (
        <article key={a.key} className="attention-card">
          <Avatar name={m.other_name} color={m.other_color} />
          <div className="attention-text">
            <p className="strong">{m.other_name} wants to meet</p>
            <p className="meta">
              {formatWhen(m.scheduled_at)} · {m.location}
              {m.topic && ` · ${m.topic}`}
            </p>
          </div>
          <div className="attention-actions">
            <button className="outline" disabled={busy === a.key} onClick={() => act(a.key, 'set_meetup_status', { p_meetup_id: m.id, p_status: 'confirmed' }, `Confirmed! ${firstName(m.other_name)} will be notified.`)}>
              Confirm
            </button>
            <button className="text-button" disabled={busy === a.key} onClick={() => act(a.key, 'set_meetup_status', { p_meetup_id: m.id, p_status: 'cancelled' })}>
              Decline
            </button>
          </div>
        </article>
      )
    }
    if (a.kind === 'friend') {
      const { f, s } = a
      return (
        <article key={a.key} className="attention-card">
          <Avatar name={s.full_name} color={s.avatar_color} />
          <div className="attention-text">
            <p className="strong">{s.full_name} sent a friend request</p>
            <p className="meta">
              {programLabel(s.program_status)}
              {s.student_courses.length > 0 && ` · ${s.student_courses.map((c) => c.courses.code).sort().join(', ')}`}
            </p>
          </div>
          <div className="attention-actions">
            <button className="outline" disabled={busy === a.key} onClick={() => act(a.key, 'respond_friend', { p_friendship_id: f.id, p_accept: true }, `You and ${firstName(s.full_name)} are now friends.`)}>
              Accept
            </button>
            <button className="text-button" disabled={busy === a.key} onClick={() => act(a.key, 'respond_friend', { p_friendship_id: f.id, p_accept: false })}>
              Decline
            </button>
          </div>
        </article>
      )
    }
    if (a.kind === 'message') {
      const { c } = a
      return (
        <article key={a.key} className="attention-card">
          <Avatar name={c.name} color={c.color} />
          <div className="attention-text">
            <p className="strong">{c.name} wants to message you</p>
            <p className="meta clamp">“{c.last_body}”</p>
          </div>
          <div className="attention-actions">
            <button className="outline" onClick={() => go('messages', { studentId: c.other_id, tab: 'requests' })}>
              Read
            </button>
          </div>
        </article>
      )
    }
    return (
      <article key={a.key} className="attention-card">
        <span className="attention-icon">
          <Icon name="calendar" size={22} />
        </span>
        <div className="attention-text">
          <p className="strong">Your free times are over 2 months old</p>
          <p className="meta">New semester? Update them so matches stay accurate.</p>
        </div>
        <div className="attention-actions">
          <button className="outline" onClick={() => go('calendar')}>
            Update
          </button>
        </div>
      </article>
    )
  }

  return (
    <div className="home">
      <section className="greeting">
        <div>
          <p className="eyebrow-muted">Your I.S. community</p>
          <h1>Welcome back, {firstName(me.full_name)}.</h1>
          <p className="meta-lg">{line}</p>
        </div>
        <button className="primary big" onClick={() => go('findFriends')}>
          Find a study partner
        </button>
      </section>

      {attention.length > 0 && (
        <section>
          <h2>Needs your attention</h2>
          <div className="attention-grid">{attention.map(attentionCard)}</div>
        </section>
      )}

      <div className="home-columns">
        <div className="home-main">
          <section>
            <h2>Your next meetup</h2>
            {next ? (
              <article className="home-card meetup-card">
                <div className="date-block" aria-hidden="true">
                  <span>{new Date(next.scheduled_at).toLocaleDateString(undefined, { month: 'short' })}</span>
                  <strong>{new Date(next.scheduled_at).getDate()}</strong>
                  <span>{new Date(next.scheduled_at).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                </div>
                <div className="meetup-text">
                  <p className="strong">
                    Study session with {next.other_name}{' '}
                    <span className={`badge status-${next.status}`}>{next.status === 'confirmed' ? 'Confirmed' : 'Waiting to confirm'}</span>
                  </p>
                  <p className="meta">
                    {new Date(next.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} –{' '}
                    {new Date(new Date(next.scheduled_at).getTime() + next.duration_minutes * 60000).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ·{' '}
                    {next.location}
                    {next.topic && ` · ${next.topic}`}
                  </p>
                </div>
                <div className="meetup-links">
                  <button className="text-link" onClick={() => go('messages', { studentId: next.other_id })}>
                    Message {firstName(next.other_name)} →
                  </button>
                  {next.status === 'confirmed' && (
                    <a className="text-link" href={googleCalendarLink(next)} target="_blank" rel="noreferrer">
                      Add to Google Calendar
                    </a>
                  )}
                </div>
              </article>
            ) : (
              <article className="home-card empty-row">
                <p className="meta">No study sessions scheduled yet.</p>
                <button className="text-link" onClick={() => go('setupMeetup')}>
                  Set one up →
                </button>
              </article>
            )}
          </section>

          <section>
            <div className="section-head">
              <div>
                <h2>{friendsFree.length > 0 ? 'Friends free when you are' : 'Find your study people'}</h2>
                {friendsFree.length === 0 && <p className="meta">Matched on your classes, what you need help with, and your free times.</p>}
              </div>
              <button className="text-link" onClick={() => go('findFriends', hasFreeTogether ? { freeMatch: true } : {})}>
                {friendsFree.length > 0 ? 'More people to meet →' : 'See all students →'}
              </button>
            </div>
            {(!students.data || !friendships.data) && <p className="meta">Loading…</p>}
            {students.data && friendships.data && friendsFree.length > 0 && (
              <div className="home-card people-rows">
                {friendsFree.map((s) => (
                  <div key={s.id} className="person-line">
                    <Avatar name={s.full_name} color={s.avatar_color} />
                    <div className="person-line-text">
                      <p className="strong">{s.full_name}</p>
                      <p className="free-line">
                        <Icon name="clock" size={14} />
                        Free together {formatSlot(s.soonest.slot)}
                      </p>
                    </div>
                    <button
                      className="outline"
                      aria-label={`Plan a study session with ${s.full_name}`}
                      onClick={() => go('setupMeetup', { partnerId: s.id, at: toLocalInput(s.soonest.at) })}
                    >
                      Plan
                    </button>
                  </div>
                ))}
              </div>
            )}
            {students.data && friendships.data && friendsFree.length === 0 && partners.length > 0 && (
              <div className="home-card people-rows">
                {partners.map((s) => {
                  const detail = s.reasons.find((r) => !r.startsWith('Free together'))
                  return (
                    <div key={s.id} className="person-line">
                      <Avatar name={s.full_name} color={s.avatar_color} />
                      <div className="person-line-text">
                        <p className="strong">
                          {s.full_name} <span className={`badge ${s.program_status}`}>{programLabel(s.program_status)}</span>
                        </p>
                        {detail && <p className="meta">{detail}</p>}
                        {s.shared.length > 0 && (
                          <p className="free-line">
                            <Icon name="clock" size={14} />
                            Free together {formatSlot(s.shared[0])}
                          </p>
                        )}
                      </div>
                      <button className="outline" aria-label={`Say hi to ${s.full_name}`} onClick={() => go('messages', { studentId: s.id })}>
                        Say hi
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {students.data && friendships.data && friendsFree.length === 0 && partners.length === 0 && (
              <article className="home-card empty-row">
                <p className="meta">Add your classes, needs and free times to get suggestions.</p>
                <button className="text-link" onClick={() => go(myRow?.availability_slots?.length ? 'createProfile' : 'calendar')}>
                  Update profile →
                </button>
              </article>
            )}
          </section>
        </div>

        <aside className="home-rail">
          <CompletenessMeter profile={me} go={go} compact />

          <section className="home-card">
            <p className="rail-label">
              <Icon name="bulb" size={16} />
              Tip of the day
            </p>
            <p>{tipOfTheDay()}</p>
          </section>

          {newGuides.length > 0 && (
            <section className="home-card">
              <p className="rail-label">New study guides</p>
              <div className="guide-list">
                {newGuides.map((g) => (
                  <div key={g.id} className="guide">
                    <Icon name="doc" />
                    <div>
                      <p className="strong">{g.title}</p>
                      <p className="meta">
                        {g.course && `${g.course} · `}
                        {g.uploader_id === me.id ? 'you' : g.uploader.full_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="text-link" onClick={() => go('resources')}>
                Browse study resources →
              </button>
            </section>
          )}

          <button className="text-link invite" onClick={async () => showToast({ text: await inviteClassmate() })}>
            Invite a classmate →
          </button>
        </aside>
      </div>
    </div>
  )
}
