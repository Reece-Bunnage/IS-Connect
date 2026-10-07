import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { programLabel } from './FindFriends.jsx'

const emptyForm = {
  full_name: '',
  program_status: 'pre_is',
  current_course: '',
  looking_for_help_with: '',
}

// Vertical slice: this form INSERTs a new row into `students` (and its
// strengths into `student_skills`), then shows the row Supabase sends back.
export default function CreateProfile({ go }) {
  const [skills, setSkills] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [skillIds, setSkillIds] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    supabase
      .from('skills')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setSkills(data)
      })
  }, [])

  function update(field) {
    return (e) => setForm({ ...form, [field]: e.target.value })
  }

  function toggleSkill(id) {
    setSkillIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.full_name.trim()) {
      setError('Please enter your name.')
      return
    }
    setSaving(true)
    setError(null)

    // 1-2. Send the request; Supabase inserts the row and returns it.
    const { data: student, error: insertError } = await supabase
      .from('students')
      .insert({
        full_name: form.full_name.trim(),
        program_status: form.program_status,
        current_course: form.current_course.trim() || null,
        looking_for_help_with: form.looking_for_help_with.trim() || null,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setSaving(false)
      return
    }

    if (skillIds.length > 0) {
      const { error: skillsError } = await supabase
        .from('student_skills')
        .insert(skillIds.map((skill_id) => ({ student_id: student.id, skill_id })))
      if (skillsError) setError(`Profile saved, but strengths failed: ${skillsError.message}`)
    }

    // 3-4. Display the value returned from the database.
    setCreated(student)
    setForm(emptyForm)
    setSkillIds([])
    setSaving(false)
  }

  if (created) {
    return (
      <section className="card success">
        <h1>Welcome, {created.full_name}! 🎉</h1>
        <p>
          Your profile was saved to the database. You're listed as{' '}
          <strong>{programLabel(created.program_status)}</strong>
          {created.current_course && <> · {created.current_course}</>}.
        </p>
        <p className="muted">
          Student ID: <code>{created.id}</code>
        </p>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="primary" onClick={() => go('findFriends')}>
            See yourself in Find Friends →
          </button>
          <button className="secondary" onClick={() => setCreated(null)}>
            Create another
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card">
      <h1>Make your account</h1>
      <p className="muted">Just the basics, so other students know who you are.</p>

      <form onSubmit={handleSubmit} className="form">
        <label>
          Full name
          <input value={form.full_name} onChange={update('full_name')} placeholder="e.g. Jamie Rivera" required />
        </label>

        <fieldset>
          <legend>Where are you in the program?</legend>
          <label className="inline">
            <input
              type="radio"
              name="program_status"
              value="pre_is"
              checked={form.program_status === 'pre_is'}
              onChange={update('program_status')}
            />
            Pre-IS
          </label>
          <label className="inline">
            <input
              type="radio"
              name="program_status"
              value="is_core"
              checked={form.program_status === 'is_core'}
              onChange={update('program_status')}
            />
            IS Core
          </label>
        </fieldset>

        <label>
          Current IS course
          <input value={form.current_course} onChange={update('current_course')} placeholder="e.g. IS 201" />
        </label>

        <label>
          Looking for help with
          <input
            value={form.looking_for_help_with}
            onChange={update('looking_for_help_with')}
            placeholder="e.g. SQL joins"
          />
        </label>

        <fieldset>
          <legend>Your strengths</legend>
          <div className="chips">
            {skills.map((s) => (
              <label key={s.id} className={`chip ${skillIds.includes(s.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={skillIds.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Create profile'}
        </button>
      </form>
    </section>
  )
}
