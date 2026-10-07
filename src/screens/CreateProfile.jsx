import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

function formFrom(profile) {
  return {
    full_name: profile?.full_name ?? '',
    program_status: profile?.program_status ?? 'pre_is',
    current_course: profile?.current_course ?? '',
    looking_for_help_with: profile?.looking_for_help_with ?? '',
  }
}

// Vertical slice: this form INSERTs (or UPDATEs) your row in `students` and
// your strengths in `student_skills`, then shows the saved profile.
export default function CreateProfile({ go, profile, onSaved }) {
  const [skills, setSkills] = useState([])
  const [form, setForm] = useState(() => formFrom(profile))
  const [skillIds, setSkillIds] = useState(() => profile?.student_skills.map((ss) => ss.skill_id) ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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

    const fields = {
      full_name: form.full_name.trim(),
      program_status: form.program_status,
      current_course: form.current_course.trim() || null,
      looking_for_help_with: form.looking_for_help_with.trim() || null,
    }

    // 1-2. Send the request; Supabase saves the row (user_id = your login) and returns it.
    const { data: student, error: saveError } = profile
      ? await supabase.from('students').update(fields).eq('id', profile.id).select().single()
      : await supabase.from('students').insert(fields).select().single()

    if (saveError) {
      setError(saveError.message)
      setSaving(false)
      return
    }

    // Replace your strengths with the current selection.
    let { error: skillsError } = await supabase.from('student_skills').delete().eq('student_id', student.id)
    if (!skillsError && skillIds.length > 0) {
      ;({ error: skillsError } = await supabase
        .from('student_skills')
        .insert(skillIds.map((skill_id) => ({ student_id: student.id, skill_id }))))
    }

    // 3-4. Re-read the profile from the database and show it.
    await onSaved()
    setSaving(false)
    if (skillsError) setError(`Profile saved, but strengths failed: ${skillsError.message}`)
    else go('myProfile')
  }

  return (
    <section className="card">
      <h1>{profile ? 'Edit your profile' : 'Make your account'}</h1>
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
          {saving ? 'Saving…' : profile ? 'Save changes' : 'Create profile'}
        </button>
      </form>
    </section>
  )
}
