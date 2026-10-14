import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useHiddenIds, useQuery } from '../api.js'
import { formatSlot, sharedSlots } from '../time.js'
import { Avatar, PageHeader, programLabel } from '../ui.jsx'

export default function FindFriends({ go, me, params }) {
  const [program, setProgram] = useState('all')
  const [skill, setSkill] = useState('all')
  const [course, setCourse] = useState('all')
  const [freeMatch, setFreeMatch] = useState(Boolean(params.freeMatch))
  const [show, setShow] = useState(params.show ?? 'all') // 'all' | 'friends' | 'requests'
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const students = useQuery(
    () =>
      supabase
        .from('students')
        .select(
          'id, full_name, program_status, current_course, looking_for_help_with, bio, created_at, ' +
            'student_skills(skills(name)), availability_slots(day_of_week, start_time, duration_minutes)',
        )
        .order('created_at', { ascending: false }),
    [],
  )
  const friendships = useQuery(
    () =>
      me
        ? supabase.from('friendships').select('*').or(`requester_id.eq.${me.id},addressee_id.eq.${me.id}`)
        : Promise.resolve({ data: [] }),
    [me?.id],
  )
  const { hidden } = useHiddenIds(me?.id)

  if (students.error) return <p className="error">Could not load students: {students.error}</p>
  if (!students.data) return <p className="muted">Loading students…</p>

  // The friendship (if any) between you and each other student.
  const friendOf = new Map(
    (friendships.data ?? []).map((f) => [f.requester_id === me?.id ? f.addressee_id : f.requester_id, f]),
  )
  const mySlots = students.data.find((s) => s.id === me?.id)?.availability_slots ?? []

  const others = students.data
    .filter((s) => s.id !== me?.id && !hidden.has(s.id))
    .map((s) => ({
      ...s,
      skills: s.student_skills.map((ss) => ss.skills.name),
      shared: sharedSlots(mySlots, s.availability_slots),
      friendship: friendOf.get(s.id),
    }))
  const allSkills = [...new Set(others.flatMap((s) => s.skills))].sort()
  const allCourses = [...new Set(others.map((s) => s.current_course).filter(Boolean))].sort()
  const requests = others.filter((s) => s.friendship?.status === 'pending' && s.friendship.addressee_id === me?.id)

  const shown = others.filter(
    (s) =>
      (program === 'all' || s.program_status === program) &&
      (skill === 'all' || s.skills.includes(skill)) &&
      (course === 'all' || s.current_course === course) &&
      (!freeMatch || s.shared.length > 0) &&
      (show === 'all' ||
        (show === 'friends' && s.friendship?.status === 'accepted') ||
        (show === 'requests' && requests.includes(s))),
  )

  async function act(studentId, fn, args) {
    setBusyId(studentId)
    setActionError(null)
    try {
      await rpc(fn, args)
      await friendships.reload()
    } catch (err) {
      setActionError(err.message)
    }
    setBusyId(null)
  }

  function friendButton(s) {
    const f = s.friendship
    const busy = busyId === s.id
    if (f?.status === 'accepted') {
      return (
        <button className="secondary small" disabled={busy} onClick={() => act(s.id, 'remove_friend', { p_other_id: s.id })}>
          ✓ Friends
        </button>
      )
    }
    if (f?.status === 'pending' && f.addressee_id === me?.id) {
      return (
        <>
          <button className="primary small" disabled={busy} onClick={() => act(s.id, 'respond_friend', { p_friendship_id: f.id, p_accept: true })}>
            Accept friend
          </button>
          <button className="secondary small" disabled={busy} onClick={() => act(s.id, 'respond_friend', { p_friendship_id: f.id, p_accept: false })}>
            Decline
          </button>
        </>
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
      <button className="primary small" disabled={busy} onClick={() => act(s.id, 'add_friend', { p_other_id: s.id })}>
        + Add friend
      </button>
    )
  }

  return (
    <>
      <PageHeader title="Find someone to learn with." text="Filter by program, course, strengths, or when you're both free." />
      <p className="notice">Sample students (like Emma and Daniel) accept friend requests and meetups automatically, so you can try everything.</p>

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
        <select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="Program filter">
          <option value="all">Pre-IS & IS Core</option>
          <option value="pre_is">Pre-IS</option>
          <option value="is_core">IS Core</option>
        </select>
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course filter">
          <option value="all">Any course</option>
          {allCourses.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Strength filter">
          <option value="all">Any strength</option>
          {allSkills.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={freeMatch} onChange={(e) => setFreeMatch(e.target.checked)} />
          Free when I'm free
        </label>
      </div>

      {freeMatch && mySlots.length === 0 && (
        <p className="notice">
          Set your free times first.{' '}
          <button className="link" onClick={() => go('calendar')}>
            Open Availability →
          </button>
        </p>
      )}
      {actionError && <p className="error">{actionError}</p>}
      {shown.length === 0 && <p className="muted">No students match those filters.</p>}

      <div className="list">
        {shown.map((s) => (
          <article key={s.id} className="card person">
            <Avatar name={s.full_name} />
            <div className="person-body">
              <h3>
                {s.full_name} <span className={`badge ${s.program_status}`}>{programLabel(s.program_status)}</span>
              </h3>
              {s.current_course && <p className="muted">{s.current_course}</p>}
              {s.bio && <p>{s.bio}</p>}
              {s.looking_for_help_with && (
                <p>
                  <strong>Looking for help with:</strong> {s.looking_for_help_with}
                </p>
              )}
              {s.skills.length > 0 && (
                <div className="chips">
                  {s.skills.map((name) => (
                    <span key={name} className="chip on">
                      {name}
                    </span>
                  ))}
                </div>
              )}
              {s.shared.length > 0 && (
                <p className="free-together">🕒 Free together: {s.shared.map(formatSlot).join(', ')}</p>
              )}
              {me && (
                <div className="row actions">
                  {friendButton(s)}
                  <button className="secondary small" onClick={() => go('messages', { studentId: s.id })}>
                    Message
                  </button>
                  <button className="secondary small" onClick={() => go('setupMeetup', { partnerId: s.id })}>
                    Schedule
                  </button>
                  <button className="link small" onClick={() => go('blockReport', { studentId: s.id })}>
                    Block / report
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
