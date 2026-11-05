import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery, useRpc } from '../api.js'
import { STUDENT_SELECT, scoreStudents } from '../matching.js'
import { ActiveDot, Avatar, DemoBadge, MoreMenu, PageHeader, ProfileDetails, hasProfileDetails, inviteClassmate, programLabel } from '../ui.jsx'

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

  const others = scoreStudents(students.data, me.id, hidden).map((s) => ({ ...s, friendship: friendOf.get(s.id) }))
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

  // The buttons people actually use sit on the card. Only rarely used or risky
  // actions (Remove friend, Block or report) are tucked into the ⋯ menu.
  function actions(s) {
    const f = s.friendship
    const busy = busyId === s.id
    const first = s.full_name.split(' ')[0]
    const message = (className) => (
      <button className={className} aria-label={`Message ${first}`} onClick={() => go('messages', { studentId: s.id })}>
        Message
      </button>
    )
    const schedule = (
      <button className="secondary small" aria-label={`Schedule a meetup with ${first}`} onClick={() => go('setupMeetup', { partnerId: s.id })}>
        Schedule
      </button>
    )
    let main
    let menu
    if (f?.status === 'pending' && f.incoming) {
      main = (
        <>
          <button className="primary small" disabled={busy} onClick={() => act(s.id, 'respond_friend', { p_friendship_id: f.id, p_accept: true }, `You and ${first} are now friends.`)}>
            Accept friend
          </button>
          <button className="secondary small" disabled={busy} onClick={() => act(s.id, 'respond_friend', { p_friendship_id: f.id, p_accept: false })}>
            Decline
          </button>
        </>
      )
      menu = (
        <>
          <button onClick={() => go('messages', { studentId: s.id })}>Message</button>
          <button onClick={() => go('setupMeetup', { partnerId: s.id })}>Schedule a meetup</button>
        </>
      )
    } else if (f?.status === 'accepted') {
      main = (
        <>
          {message('primary small')}
          {schedule}
        </>
      )
      menu = <button onClick={() => act(s.id, 'remove_friend', { p_other_id: s.id }, `Removed ${first} from your friends.`)}>Remove friend</button>
    } else {
      main = (
        <>
          {f?.status === 'pending' ? (
            <button className="secondary small" disabled>
              Request sent
            </button>
          ) : (
            <button className="primary small" disabled={busy} onClick={() => act(s.id, 'add_friend', { p_other_id: s.id }, `Friend request sent to ${first}.`)}>
              + Add friend
            </button>
          )}
          {schedule}
        </>
      )
      menu = <button onClick={() => go('messages', { studentId: s.id })}>Message</button>
    }
    return (
      <div className="row actions">
        {main}
        <MoreMenu label={`More actions for ${s.full_name}`}>
          {menu}
          <button className="danger" onClick={() => go('blockReport', { studentId: s.id })}>
            Block or report
          </button>
        </MoreMenu>
      </div>
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

      <div className="people-list">
        {shown.map((s) => {
          const strengths = s.student_skills.map((k) => k.skills.name)
          return (
            <article key={s.id} className="card person-card">
              <div className="person-head">
                <Avatar name={s.full_name} color={s.avatar_color} />
                <div className="person-head-text">
                  <h3>
                    {s.full_name} <DemoBadge student={s} />
                  </h3>
                  <p className="person-meta">
                    <span className={`badge ${s.program_status}`}>{programLabel(s.program_status)}</span>
                    <ActiveDot lastActive={s.last_active_at} />
                  </p>
                </div>
              </div>
              {s.reasons.length > 0 && <p className="why">✨ {s.reasons.slice(0, 2).join(' · ')}</p>}
              {strengths.length > 0 && (
                <div className="chips">
                  <span className="sr-only">Strong in: </span>
                  {strengths.slice(0, 3).map((name) => (
                    <span key={name} className="chip on">
                      {name}
                    </span>
                  ))}
                  {strengths.length > 3 && <span className="chip more-count">+{strengths.length - 3} more</span>}
                </div>
              )}
              {actions(s)}
              <MoreAbout student={s} />
            </article>
          )
        })}
      </div>

      {cantFind}
    </>
  )
}

// Everything else about a student, folded away so the list stays scannable.
function MoreAbout({ student: s }) {
  if (!hasProfileDetails(s)) return null
  return (
    <details className="person-more">
      <summary>More about {s.full_name.split(' ')[0]}</summary>
      <ProfileDetails student={s} />
    </details>
  )
}
