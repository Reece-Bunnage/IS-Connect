import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export function programLabel(status) {
  return status === 'is_core' ? 'IS Core' : 'Pre-IS'
}

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function FindFriends() {
  const [students, setStudents] = useState(null)
  const [error, setError] = useState(null)
  const [program, setProgram] = useState('all')
  const [skill, setSkill] = useState('all')

  useEffect(() => {
    supabase
      .from('students')
      .select('id, full_name, program_status, current_course, looking_for_help_with, bio, created_at, student_skills(skills(name))')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setStudents(data)
      })
  }, [])

  if (error) return <p className="error">Could not load students: {error}</p>
  if (!students) return <p className="muted">Loading students…</p>

  const withSkills = students.map((s) => ({ ...s, skills: s.student_skills.map((ss) => ss.skills.name) }))
  const allSkills = [...new Set(withSkills.flatMap((s) => s.skills))].sort()
  const shown = withSkills.filter(
    (s) => (program === 'all' || s.program_status === program) && (skill === 'all' || s.skills.includes(skill)),
  )

  return (
    <>
      <h1>Find Friends</h1>
      <p className="muted">Students on IS-Connect, newest first.</p>

      <div className="filters">
        <select value={program} onChange={(e) => setProgram(e.target.value)} aria-label="Program filter">
          <option value="all">All students</option>
          <option value="pre_is">Pre-IS</option>
          <option value="is_core">IS Core</option>
        </select>
        <select value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Strength filter">
          <option value="all">Any strength</option>
          {allSkills.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </div>

      {shown.length === 0 && <p className="muted">No students match those filters.</p>}

      <div className="list">
        {shown.map((s) => (
          <article key={s.id} className="card person">
            <div className="avatar">{initials(s.full_name)}</div>
            <div>
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
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
