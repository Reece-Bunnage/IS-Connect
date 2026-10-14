import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery, useRpc } from '../api.js'
import { formatSlot, sharedSlots } from '../time.js'
import { ActiveDot, Avatar, DemoBadge, PageHeader, inviteClassmate, programLabel } from '../ui.jsx'

const STUDENT_SELECT =
  'id, user_id, full_name, avatar_color, program_status, graduation_year, looking_for_help_with, ask_me_about, bio, ' +
  'last_active_at, created_at, student_skills(skill_id, skills(name)), student_courses(course_id, courses(code)), ' +
  'student_needs(skill_id, skills(name)), availability_slots(day_of_week, start_time, duration_minutes)'

// How well another student fits you, and the reasons to show on their card.
function match(me, s, myRow) {
  const reasons = []
  let score = 0
  const myCourses = new Set(myRow.student_courses.map((c) => c.course_id))
  const myNeeds = new Set(myRow.student_needs.map((n) => n.skill_id))
  const mySkills = new Set(myRow.student_skills.map((k) => k.skill_id))

  const sharedCourses = s.student_courses.filter((c) => myCourses.has(c.course_id)).map((c) => c.courses.code)
  if (sharedCourses.length) {
    score += 3 * sharedCourses.length
    reasons.push(`In ${sharedCourses.join(', ')} with you`)
  }
  const canHelp = s.student_skills.filter((k) => myNeeds.has(k.skill_id)).map((k) => k.skills.name)
  if (canHelp.length) {
    score += 4 * canHelp.length
    reasons.push(`Strong in ${canHelp.join(', ')}, which you need`)
  }
  const youHelp = s.student_needs.filter((n) => mySkills.has(n.skill_id)).map((n) => n.skills.name)
  if (youHelp.length) {
    score += 2 * youHelp.length
    reasons.push(`Needs help with ${youHelp.join(', ')}, your strength`)
  }
  if (s.shared.length) {
    score += 2
    reasons.push(`Free together ${s.shared.slice(0, 2).map(formatSlot).join(', ')}`)
  }
  if (s.last_active_at && Date.now() - new Date(s.last_active_at) < 7 * 864e5) score += 1
  return { score, reasons }
}

export default function FindFriends({ go, me, params, showToast, refreshCounts }) {
  const [search, setSearch] = useState('')
  const [program, setProgram] = useState('all')
  const [course, setCourse] = useState('all')
  const [skill, setSkill] = useState('all')
  const [freeMatch, setFreeMatch] = useState(Boolean(params.freeMatch))
  const [show, setShow] = useState(params.show ?? 'all') // 'all' | 'friends' | 'requests'
  const [sort, setSort] = useState('match')
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [queuePick, setQueuePick] = useState('')
  const [joining, setJoining] = useState(false)

  const students = useQuery(() => supabase.from('students').select(STUDENT_SELECT).order('created_at', { ascending: false }), [])
  const lists = useQuery(async () => {
    const [courses, skills] = await Promise.all([
      supabase.from('courses').select('id, code').order('code'),
      supabase.from('skills').select('id, name').order('name'),
    ])
    return { courses: courses.data ?? [], skills: skills.data ?? [] }
  }, [])
  const friendships = useRpc('my_friendships', {}, [me.id])
  const queue = useRpc('my_queue', {}, [me.id])
  const { hidden } = useHiddenIds(me.id)

  if (students.error) return <p className="error">Could not load students: {students.error}</p>
  if (!students.data || !lists.data) return <p className="muted">Loading students…</p>

  const myRow = students.data.find((s) => s.id === me.id) ?? me
  const friendOf = new Map((friendships.data ?? []).map((f) => [f.other_id, f]))
  const q = search.trim().toLowerCase()

  const others = students.data
    .filter((s) => s.id !== me.id && !hidden.has(s.id))
    .map((s) => {
      const withShared = { ...s, shared: sharedSlots(myRow.availability_slots, s.availability_slots) }
      return { ...withShared, friendship: friendOf.get(s.id), ...match(me, withShared, myRow) }
    })
  const requests = others.filter((s) => s.friendship?.status === 'pending' && s.friendship.incoming)

  const shown = others
    .filter(
      (s) =>
        (!q || s.full_name.toLowerCase().includes(q)) &&
        (program === 'all' || s.program_status === program) &&
        (course === 'all' || s.student_courses.some((c) => String(c.course_id) === course)) &&
        (skill === 'all' || s.student_skills.some((k) => String(k.skill_id) === skill)) &&
        (!freeMatch || s.shared.length > 0) &&
        (show === 'all' || (show === 'friends' && s.friendship?.status === 'accepted') || (show === 'requests' && requests.includes(s))),
    )
    .sort((a, b) =>
      sort === 'match'
        ? b.score - a.score || new Date(b.last_active_at ?? 0) - new Date(a.last_active_at ?? 0)
        : sort === 'active'
          ? new Date(b.last_active_at ?? 0) - new Date(a.last_active_at ?? 0)
          : new Date(b.created_at) - new Date(a.created_at),
    )

  async function act(studentId, fn, args, toastText) {
    setBusyId(studentId)
    setActionError(null)
    try {
      await rpc(fn, args)
      await friendships.reload()
      refreshCounts()
      if (toastText) showToast({ text: toastText })
    } catch (err) {
      setActionError(err.message)
    }
    setBusyId(null)
  }

  // "Can't find anyone?": join the queue for a class or topic.
  async function joinQueue() {
    const [kind, id] = queuePick.split(':')
    setJoining(true)
    setActionError(null)
    try {
      const result = await rpc('join_study_queue', {
        p_course_id: kind === 'course' ? Number(id) : null,
        p_skill_id: kind === 'skill' ? Number(id) : null,
      })
      if (result.status === 'matched') {
        showToast({ text: "🎉 It's a match! You're in a new study group." })
        go('groups', { groupId: result.group_id })
        return
      }
      await queue.reload()
      showToast({ text: "You're on the list. We'll match you as soon as someone else asks for the same thing." })
    } catch (err) {
      setActionError(err.message)
    }
    setJoining(false)
  }

  function primaryAction(s) {
    const f = s.friendship
    const busy = busyId === s.id
    if (f?.status === 'pending' && f.incoming) {
      return (
        <>
          <button className="primary small" disabled={busy} onClick={() => act(s.id, 'respond_friend', { p_friendship_id: f.id, p_accept: true }, `You and ${s.full_name.split(' ')[0]} are now friends.`)}>
            Accept friend
          </button>
          <button className="secondary small" disabled={busy} onClick={() => act(s.id, 'respond_friend', { p_friendship_id: f.id, p_accept: false })}>
            Decline
          </button>
        </>
      )
    }
    if (f?.status === 'accepted') {
      return (
        <button className="primary small" onClick={() => go('messages', { studentId: s.id })}>
          Message
        </button>
      )
    }
    if (f?.status === 'pending') {
      return (
        <button className="secondary small" disabled>
          Request sent
        </button>
      )
    }
    return (
      <button className="primary small" disabled={busy} onClick={() => act(s.id, 'add_friend', { p_other_id: s.id }, `Friend request sent to ${s.full_name.split(' ')[0]}.`)}>
        + Add friend
      </button>
    )
  }

  const myCourseIds = new Set(myRow.student_courses.map((c) => c.course_id))
  const myNeedIds = new Set(myRow.student_needs.map((n) => n.skill_id))
  const queueOptions = [
    ...lists.data.courses.filter((c) => myCourseIds.has(c.id)).map((c) => ({ value: `course:${c.id}`, label: `${c.code} (your class)` })),
    ...lists.data.skills.filter((k) => myNeedIds.has(k.id)).map((k) => ({ value: `skill:${k.id}`, label: `${k.name} (you need help)` })),
    ...lists.data.courses.filter((c) => !myCourseIds.has(c.id)).map((c) => ({ value: `course:${c.id}`, label: c.code })),
    ...lists.data.skills.filter((k) => !myNeedIds.has(k.id)).map((k) => ({ value: `skill:${k.id}`, label: k.name })),
  ]

  const cantFind = (
    <section className="card match-card">
      <h2>Can't find anyone?</h2>
      <p className="muted">
        Tell us what you want to study. As soon as someone else asks for the same class or topic, we'll put you in a study group together.
      </p>
      {(queue.data ?? []).map((entry) => (
        <p key={entry.id} className="queue-entry">
          ⏳ Waiting for a match: <strong>{entry.label}</strong> <span className="muted">since {new Date(entry.created_at).toLocaleDateString()}</span>{' '}
          <button className="link small" onClick={() => rpc('leave_study_queue', { p_entry_id: entry.id }).then(queue.reload)}>
            Stop waiting
          </button>
        </p>
      ))}
      <div className="row">
        <select value={queuePick} onChange={(e) => setQueuePick(e.target.value)} aria-label="Class or topic to match on">
          <option value="">Choose a class or topic…</option>
          {queueOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button className="primary" disabled={!queuePick || joining} onClick={joinQueue}>
          {joining ? 'Matching…' : 'Match me'}
        </button>
      </div>
    </section>
  )

  return (
    <>
      <PageHeader title="Find someone to learn with." text="Best matches first: shared classes, strengths that cover your needs, and time you're both free." />

      <div className="segmented" role="tablist">
        {[
          ['all', 'All students'],
          ['friends', 'My friends'],
          ['requests', `Requests${requests.length ? ` (${requests.length})` : ''}`],
        ].map(([id, label]) => (
          <button key={id} className={show === id ? 'on' : ''} onClick={() => setShow(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" aria-label="Search by name" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="match">Best match</option>
          <option value="active">Recently active</option>
          <option value="new">Newest</option>
        </select>
        <select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="Program filter">
          <option value="all">Any program</option>
          <option value="pre_is">Pre-IS</option>
          <option value="is_core">IS Core</option>
          <option value="is_minor">IS Minor</option>
          <option value="ta">TA / Mentor</option>
        </select>
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Class filter">
          <option value="all">Any class</option>
          {lists.data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
        <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Strong in">
          <option value="all">Strong in anything</option>
          {lists.data.skills.map((k) => (
            <option key={k.id} value={k.id}>
              Strong in {k.name}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={freeMatch} onChange={(e) => setFreeMatch(e.target.checked)} />
          Free when I'm free
        </label>
      </div>

      {freeMatch && myRow.availability_slots.length === 0 && (
        <p className="notice">
          Set your free times first.{' '}
          <button className="link" onClick={() => go('calendar')}>
            Open Availability →
          </button>
        </p>
      )}
      {actionError && <p className="error">{actionError}</p>}

      {shown.length === 0 && (
        <section className="card empty">
          <h2>No one matches those filters</h2>
          <p className="muted">Try fewer filters, or let us match you below. You can also invite a classmate.</p>
          <button className="secondary" onClick={async () => showToast({ text: await inviteClassmate() })}>
            Invite a classmate
          </button>
        </section>
      )}

      <div className="list">
        {shown.map((s) => (
          <article key={s.id} className="card person">
            <Avatar name={s.full_name} color={s.avatar_color} />
            <div className="person-body">
              <h3>
                {s.full_name} <span className={`badge ${s.program_status}`}>{programLabel(s.program_status)}</span> <DemoBadge student={s} />{' '}
                <ActiveDot lastActive={s.last_active_at} />
              </h3>
              {s.student_courses.length > 0 && <p className="muted">{s.student_courses.map((c) => c.courses.code).sort().join(' · ')}</p>}
              {s.reasons.length > 0 && <p className="why">✨ {s.reasons.join(' · ')}</p>}
              {s.bio && <p>{s.bio}</p>}
              {s.ask_me_about && (
                <p>
                  <strong>Ask me about:</strong> {s.ask_me_about}
                </p>
              )}
              <div className="chips">
                {s.student_skills.map((k) => (
                  <span key={`s${k.skill_id}`} className="chip on">
                    {k.skills.name}
                  </span>
                ))}
                {s.student_needs.map((n) => (
                  <span key={`n${n.skill_id}`} className="chip need on" title="Wants help with">
                    Needs {n.skills.name}
                  </span>
                ))}
              </div>
              <div className="row actions">
                {primaryAction(s)}
                <details className="more">
                  <summary aria-label={`More actions for ${s.full_name}`}>⋯</summary>
                  <div className="menu">
                    {s.friendship?.status !== 'accepted' && <button onClick={() => go('messages', { studentId: s.id })}>Message</button>}
                    <button onClick={() => go('setupMeetup', { partnerId: s.id })}>Schedule a meetup</button>
                    {s.friendship?.status === 'accepted' && (
                      <button onClick={() => act(s.id, 'remove_friend', { p_other_id: s.id }, `Removed ${s.full_name.split(' ')[0]} from your friends.`)}>Remove friend</button>
                    )}
                    <button className="danger" onClick={() => go('blockReport', { studentId: s.id })}>
                      Block or report
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </article>
        ))}
      </div>

      {cantFind}
    </>
  )
}
