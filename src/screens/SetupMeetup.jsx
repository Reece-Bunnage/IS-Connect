import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery, useRpc } from '../api.js'
import { STUDENT_SELECT, scoreStudents } from '../matching.js'
import { formatHour, formatWhen, freeAt, toLocalInput, upcomingFreeHours } from '../time.js'
import { Avatar, DemoBadge, Icon, PageHeader, programLabel } from '../ui.jsx'

const DURATIONS = [
  [30, '30 minutes'],
  [60, '1 hour'],
  [90, '1.5 hours'],
  [120, '2 hours'],
]
const PLACES = ['Library, 2nd floor study room', 'Business building commons', 'Student center', 'Online (Zoom)']
const STEPS = [
  ['when', 'When'],
  ['who', 'Who'],
  ['details', 'Details'],
]

// Time first, like "find a time" in a calendar app:
//   1. When:    one of your free hours, each showing how many people are free then
//   2. Who:     the people free then, best matches first
//   3. Details: how long, topic and place; then confirm and send.
// The time and person live in the URL (?at=2026-11-10T16:00&partnerId=…), so
// Back and swipe-back step back through them. Arriving with a partner already
// chosen (from a profile or a chat) skips "Who" and shows the hours you're both free.
export default function SetupMeetup({ go, back, me, params }) {
  const [topic, setTopic] = useState(params.topic ?? '')
  const [place, setPlace] = useState(PLACES[0])
  const [otherPlace, setOtherPlace] = useState('')
  const [duration, setDuration] = useState(60)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  const students = useQuery(() => supabase.from('students').select(`${STUDENT_SELECT}, contact_setting`).order('full_name'), [])
  const friendships = useRpc('my_friendships', {}, [me.id])
  const inbox = useRpc('my_inbox', {}, [me.id])
  const { hidden } = useHiddenIds(me.id)

  if (students.error) return <p className="error">Could not load students: {students.error}</p>
  const loading = (q) => !q.data && !q.error
  if (loading(students) || loading(friendships) || loading(inbox)) return <p className="muted">Loading…</p>

  const mySlots = students.data.find((s) => s.id === me.id)?.availability_slots ?? []
  const people = withContactRules(scoreStudents(students.data, me.id, hidden), students.data, me.id, friendships.data, inbox.data)
  const invitable = people.filter((s) => !s.blockReason)

  const partner = params.partnerId ? people.find((s) => s.id === params.partnerId) : null
  const parsed = params.at ? new Date(params.at) : null
  const at = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
  // Move between steps; keeps a topic passed in (from "Meet again").
  const open = (next) => go('setupMeetup', { ...next, topic: params.topic })

  const header = <PageHeader title="Set up a study session." text="Pick a time you're free, then someone who's free too." />

  if (params.partnerId && (!partner || partner.blockReason)) {
    return (
      <>
        {header}
        <section className="card">
          <p>{partner ? partner.blockReason : "That student isn't available to invite."}</p>
          <button className="secondary" onClick={() => open(at ? { at: params.at } : {})}>
            Pick someone else
          </button>
        </section>
      </>
    )
  }

  if (!at) {
    return (
      <>
        {header}
        <Steps stage="when" partner={partner} />
        <WhenStep go={go} open={open} mySlots={mySlots} partner={partner} invitable={invitable} />
      </>
    )
  }

  if (at <= new Date()) {
    return (
      <>
        {header}
        <section className="card">
          <p>That time has already passed.</p>
          <button className="secondary" onClick={() => open({ partnerId: partner?.id })}>
            Pick another time
          </button>
        </section>
      </>
    )
  }

  if (!partner) {
    return (
      <>
        {header}
        <Steps stage="who" />
        <WhoStep at={at} invitable={invitable} open={open} />
      </>
    )
  }

  const where = place === 'other' ? otherPlace.trim() : place
  const first = partner.full_name.split(' ')[0]

  if (params.confirm && where) {
    async function send() {
      setSending(true)
      setError(null)
      try {
        await rpc('request_meetup', {
          p_partner_id: partner.id,
          p_scheduled_at: at.toISOString(),
          p_duration_minutes: duration,
          p_topic: topic,
          p_location: where,
        })
        go('meetups', {}, { replace: true })
      } catch (err) {
        setError(err.message)
        setSending(false)
      }
    }
    return (
      <>
        <PageHeader title="Confirm your meetup." text="Check the details before sending your request." />
        <section className="card confirm">
          <div className="person">
            <Avatar name={partner.full_name} color={partner.avatar_color} />
            <div>
              <h2>{partner.full_name}</h2>
              <p className="muted">
                {programLabel(partner.program_status)}
                {partner.student_courses.length > 0 && ` · ${partner.student_courses.map((c) => c.courses.code).join(', ')}`}
              </p>
            </div>
          </div>
          <dl className="details">
            <dt>When</dt>
            <dd>
              {formatWhen(at)} · {DURATIONS.find((d) => d[0] === duration)[1]}
            </dd>
            {topic.trim() && (
              <>
                <dt>Topic</dt>
                <dd>{topic}</dd>
              </>
            )}
            <dt>Where</dt>
            <dd>{where}</dd>
            <dt>Next step</dt>
            <dd>{partner.user_id ? `${first} will see your request in My Meetups and can confirm it.` : 'This is a demo student, so they confirm right away.'}</dd>
          </dl>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="primary" disabled={sending} onClick={send}>
              {sending ? 'Sending…' : 'Send request'}
            </button>
            <button className="secondary" onClick={() => back('setupMeetup', { at: params.at, partnerId: partner.id })}>
              ← Change details
            </button>
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      {header}
      <Steps stage="details" />
      <section className="card form">
        <div>
          <Picked icon={<Icon name="calendar" />} label="When" value={formatWhen(at)} onChange={() => open({ partnerId: partner.id })} />
          <Picked icon={<Avatar name={partner.full_name} color={partner.avatar_color} small />} label="With" value={partner.full_name} onChange={() => open({ at: params.at })} />
          {!freeAt(partner.availability_slots, at) && (
            <p className="notice spaced-sm">{first} hasn't marked this time as free, so check it works for them.</p>
          )}
        </div>
        <label>
          How long?
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          What do you want to study? (optional)
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. IS 201 exam 2 review" maxLength={120} />
        </label>
        <fieldset>
          <legend>Where</legend>
          <div className="chips">
            {[...PLACES, 'other'].map((p) => (
              <button type="button" key={p} className={`chip ${place === p ? 'on' : ''}`} onClick={() => setPlace(p)}>
                {p === 'other' ? 'Somewhere else…' : p}
              </button>
            ))}
          </div>
          {place === 'other' && <input value={otherPlace} onChange={(e) => setOtherPlace(e.target.value)} placeholder="e.g. TNRB 2nd floor" aria-label="Place" />}
        </fieldset>
        <button type="button" className="primary" disabled={!where} onClick={() => open({ at: params.at, partnerId: partner.id, confirm: true })}>
          Review & confirm →
        </button>
      </section>
    </>
  )
}

// Adds `blockReason` (why you can't invite them, or null). Mirrors
// _contact_block_reason in supabase/functions.sql so the lists only show people
// who'll actually get the invite; the server still has the final say.
function withContactRules(people, all, meId, friendships, inbox) {
  const myCourses = new Set(all.find((s) => s.id === meId)?.student_courses.map((c) => c.course_id) ?? [])
  const friends = new Set((friendships ?? []).filter((f) => f.status === 'accepted').map((f) => f.other_id))
  const talking = new Set((inbox ?? []).filter((c) => c.state === 'chat' || c.state === 'request_in').map((c) => c.other_id))
  return people
    .map((s) => {
      const first = s.full_name.split(' ')[0]
      let blockReason = null
      if (!(friends.has(s.id) || talking.has(s.id) || s.contact_setting === 'anyone')) {
        if (s.contact_setting !== 'courses') blockReason = `${first} only accepts meetup invites from friends. Send a friend request first.`
        else if (!s.student_courses.some((c) => myCourses.has(c.course_id)))
          blockReason = `${first} only accepts meetup invites from classmates and friends. Send a friend request first.`
      }
      return { ...s, blockReason }
    })
    .sort((a, b) => b.score - a.score || a.full_name.localeCompare(b.full_name))
}

function Steps({ stage, partner }) {
  const index = STEPS.findIndex(([id]) => id === stage)
  return (
    <ol className="stepper" aria-label="Steps">
      {STEPS.map(([id, label], i) => (
        <li key={id} className={i === index ? 'on' : i < index || (id === 'who' && partner) ? 'done' : ''} aria-current={i === index ? 'step' : undefined}>
          <span>{i + 1}</span> {label}
        </li>
      ))}
    </ol>
  )
}

// Step 1. Phone: a strip of the next 7 days, then that day's free hours.
// Desktop: all 7 days side by side (the same markup; index.css decides).
function WhenStep({ go, open, mySlots, partner, invitable }) {
  const days = upcomingFreeHours(mySlots).map((d) => ({
    ...d,
    hours: partner ? d.hours.filter((h) => freeAt(partner.availability_slots, h)) : d.hours,
  }))
  const [dayKey, setDayKey] = useState(() => (days.find((d) => d.hours.length) ?? days[0]).key)
  const [custom, setCustom] = useState('')
  const anyHours = days.some((d) => d.hours.length)
  const dayName = (d, i) => (i === 0 ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'short' }))

  function freeLabel(hour) {
    if (partner) return 'Both free'
    const n = invitable.filter((s) => freeAt(s.availability_slots, hour)).length
    return n === 0 ? 'No one yet' : `${n} ${n === 1 ? 'person' : 'people'} free`
  }

  return (
    <>
      {partner && (
        <section className="card">
          <Picked
            icon={<Avatar name={partner.full_name} color={partner.avatar_color} small />}
            label="With"
            value={partner.full_name}
            onChange={() => open({})}
          />
        </section>
      )}
      <section className="card">
        <h2>{partner ? `When are you both free?` : 'When are you free?'}</h2>
        {mySlots.length === 0 ? (
          <p className="notice">
            Add your free times to see who's free when you are.{' '}
            <button type="button" className="link" onClick={() => go('calendar')}>
              Open Availability →
            </button>
          </p>
        ) : (
          <>
            {!anyHours && (
              <p className="muted">
                {partner
                  ? `You and ${partner.full_name.split(' ')[0]} aren't both free in the next week. Pick another time below.`
                  : 'None of your free hours are left this week. Pick another time below.'}
              </p>
            )}
            <div className="day-tabs">
              {days.map((d, i) => (
                <button
                  key={d.key}
                  type="button"
                  className={`day-tab ${d.key === dayKey ? 'on' : ''} ${d.hours.length ? '' : 'empty'}`}
                  aria-pressed={d.key === dayKey}
                  aria-label={`${d.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${d.hours.length} free ${d.hours.length === 1 ? 'hour' : 'hours'}`}
                  onClick={() => setDayKey(d.key)}
                >
                  <span>{dayName(d, i)}</span>
                  <strong>{d.date.getDate()}</strong>
                </button>
              ))}
            </div>
            <div className="week-grid">
              {days.map((d, i) => (
                <section key={d.key} className={`day-col ${d.key === dayKey ? 'on' : ''}`} aria-label={d.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
                  <h3 className="day-col-head">
                    {dayName(d, i)} <strong>{d.date.getDate()}</strong>
                  </h3>
                  {d.hours.length === 0 && <p className="muted small-text">{partner ? 'Not both free' : 'No free hours'}</p>}
                  <ul className="hour-list">
                    {d.hours.map((h) => {
                      const label = freeLabel(h)
                      return (
                        <li key={h.getTime()}>
                          <button type="button" className={`hour ${label === 'No one yet' ? 'none' : ''}`} onClick={() => open({ at: toLocalInput(h), partnerId: partner?.id })}>
                            <span className="hour-time">{formatHour(h)}</span>
                            <span className="hour-free">{label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
        <details className="another-time" open={mySlots.length === 0 || !anyHours || undefined}>
          <summary>Another time…</summary>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (custom) open({ at: custom, partnerId: partner?.id })
            }}
          >
            <input type="datetime-local" value={custom} min={toLocalInput(new Date())} onChange={(e) => setCustom(e.target.value)} aria-label="Date and time" required />
            <button className="secondary small" disabled={!custom}>
              {partner ? 'Use this time' : "See who's free"}
            </button>
          </form>
        </details>
      </section>
      {!partner && <SearchByName invitable={invitable} open={open} />}
    </>
  )
}

// For when you already know who: pick them first, then a time you're both free.
function SearchByName({ invitable, open }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const matches = q
    ? invitable.filter((s) => s.full_name.toLowerCase().includes(q) || s.student_courses.some((c) => c.courses.code.toLowerCase().includes(q)))
    : []
  return (
    <section className="card form">
      <label>
        Already know who?
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or class" />
      </label>
      {q && matches.length === 0 && <p className="muted">No one you can invite matches “{query.trim()}”.</p>}
      {matches.length > 0 && <PersonList people={matches.slice(0, 8)} onPick={(s) => open({ partnerId: s.id })} />}
      {matches.length > 8 && <p className="muted small-text">Keep typing to narrow it down.</p>}
    </section>
  )
}

// Step 2: the people free at that time, best matches first.
function WhoStep({ at, invitable, open }) {
  const free = invitable.filter((s) => freeAt(s.availability_slots, at))
  const others = invitable.filter((s) => !free.includes(s))
  const pick = (s) => open({ at: toLocalInput(at), partnerId: s.id })
  return (
    <section className="card">
      <Picked icon={<Icon name="calendar" />} label="When" value={formatWhen(at)} onChange={() => open({})} />
      <h2 className="spaced">Who's free then</h2>
      {free.length === 0 ? (
        <p className="muted">No one else has marked this time as free.</p>
      ) : (
        <>
          <p className="muted small-text">Best matches first: shared classes, and topics you can help each other with.</p>
          <PersonList people={free} onPick={pick} />
        </>
      )}
      {others.length > 0 && (
        <details className="others">
          <summary>Others you can invite ({others.length})</summary>
          <p className="muted small-text">They haven't marked this time as free, so check it works for them.</p>
          <PersonList people={others} onPick={pick} />
        </details>
      )}
    </section>
  )
}

function PersonList({ people, onPick }) {
  return (
    <ul className="pick-list">
      {people.map((s) => (
        <li key={s.id}>
          <button type="button" className="convo" onClick={() => onPick(s)}>
            <Avatar name={s.full_name} color={s.avatar_color} small />
            <span className="convo-text">
              <strong>
                {s.full_name} <DemoBadge student={s} />
              </strong>
              <span className="muted">{s.reasons.find((r) => !r.startsWith('Free together')) ?? programLabel(s.program_status)}</span>
            </span>
            <span className="pick-cta" aria-hidden="true">
              Pick ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

// A choice already made ("When: Tue, Nov 10 · 4:00 PM"), with a way to change it.
function Picked({ icon, label, value, onChange }) {
  return (
    <div className="picked">
      <span className="picked-icon">{icon}</span>
      <span className="picked-text">
        <span className="muted small-text">{label}</span>
        <strong>{value}</strong>
      </span>
      <button type="button" className="link small" onClick={onChange}>
        Change
      </button>
    </div>
  )
}
