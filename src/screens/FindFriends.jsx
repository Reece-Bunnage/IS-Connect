import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery, useRpc } from '../api.js'
import { STUDENT_SELECT, scoreStudents } from '../matching.js'
import { ActiveDot, Avatar, DemoBadge, MoreMenu, PageHeader, ProfileDetails, arrowKeys, hasProfileDetails, inviteClassmate, programLabel, tabProps } from '../ui.jsx'

export default function FindFriends({ go, me, params, showToast, refreshCounts }) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('all')
  const [show, setShow] = useState(params.show ?? 'all') // 'all' | 'friends' | 'requests'
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
        (course === 'all' || s.student_courses.some((c) => String(c.course_id) === course)) &&
        (show === 'all' || (show === 'friends' && s.friendship?.status === 'accepted') || (show === 'requests' && requests.includes(s))),
    )
    .sort((a, b) => b.score - a.score || new Date(b.last_active_at ?? 0) - new Date(a.last_active_at ?? 0))

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
      <PageHeader eyebrow="Your IS community" title="Find someone to learn with." text="Find a friend, then schedule a meetup to grow together!" />

      <div className="segmented" role="tablist" aria-label="Show" onKeyDown={arrowKeys({ select: true })}>
        {[
          ['all', 'All students'],
          ['friends', 'My friends'],
          ['requests', `Requests${requests.length ? ` (${requests.length})` : ''}`],
        ].map(([id, label]) => (
          <button key={id} {...tabProps(show === id)} className={show === id ? 'on' : ''} onClick={() => setShow(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="filters">
        <form
          className="find-search"
          onSubmit={(e) => {
            e.preventDefault()
            setSearch(searchInput)
          }}
        >
          <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search by name..." aria-label="Search by name" />
          <button className="primary" type="submit">Enter</button>
        </form>
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Class filter">
          <option value="all">Any class</option>
          {lists.data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </select>
      </div>
      {actionError && <p className="error">{actionError}</p>}

      {shown.length === 0 && (
        <section className="card empty">
          <h2>No one matches your search</h2>
          <p className="muted">Try another name or class, or let us match you below. You can also invite a classmate.</p>
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
