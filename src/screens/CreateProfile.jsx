import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery } from '../api.js'
import { AVATAR_COLORS, Avatar, PROGRAMS } from '../ui.jsx'

function formFrom(profile) {
  return {
    full_name: profile?.full_name ?? '',
    program_status: profile?.program_status ?? 'pre_is',
    graduation_year: profile?.graduation_year ?? '',
    avatar_color: profile?.avatar_color ?? AVATAR_COLORS[0],
    bio: profile?.bio ?? '',
    ask_me_about: profile?.ask_me_about ?? '',
    looking_for_help_with: profile?.looking_for_help_with ?? '',
    course_ids: profile?.student_courses?.map((c) => c.course_id) ?? [],
    skill_ids: profile?.student_skills?.map((s) => s.skill_id) ?? [],
    need_ids: profile?.student_needs?.map((s) => s.skill_id) ?? [],
  }
}

const STEPS = ['About you', 'Your classes', 'Strengths & needs']
const thisYear = new Date().getFullYear()
const YEARS = Array.from({ length: 7 }, (_, i) => thisYear + i)

// New students go through 3 short steps; editing shows everything on one page.
// Saves through save_profile (supabase/functions.sql).
export default function CreateProfile({ go, profile, onSaved, onboarding }) {
  const isNew = !profile
  const [form, setForm] = useState(() => formFrom(profile))
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const lists = useQuery(async () => {
    const [courses, skills] = await Promise.all([
      supabase.from('courses').select('id, code, name').order('code'),
      supabase.from('skills').select('id, name').order('name'),
    ])
    const err = courses.error || skills.error
    if (err) throw new Error(err.message)
    return { courses: courses.data, skills: skills.data }
  }, [])

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const toggle = (field, id) =>
    setForm({ ...form, [field]: form[field].includes(id) ? form[field].filter((x) => x !== id) : [...form[field], id] })

  async function save() {
    if (!form.full_name.trim()) {
      setStep(0)
      setError('Please enter your name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      // 1-2. Send the request; save_profile checks your login and saves your row,
      // classes, strengths and needs, and joins your classes' study groups.
      await rpc('save_profile', { p_profile: { ...form, graduation_year: form.graduation_year || null } })
      // 3-4. Re-read the profile from the database and show it.
      await onSaved()
      go(isNew ? 'home' : 'myProfile')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (lists.error) return <p className="error">Could not load classes and topics: {lists.error}</p>
  if (!lists.data) return <p className="muted">Loading…</p>
  const { courses, skills } = lists.data

  const about = (
    <fieldset className="form-section">
      <legend className="section-title">About you</legend>
      <div className="avatar-row">
        <Avatar name={form.full_name || '?'} color={form.avatar_color} />
        <div>
          <span className="field-label">Avatar color</span>
          <div className="swatches" role="radiogroup" aria-label="Avatar color">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={form.avatar_color === c}
                aria-label={`Color ${c}`}
                className={`swatch ${form.avatar_color === c ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setForm({ ...form, avatar_color: c })}
              />
            ))}
          </div>
        </div>
      </div>
      <label>
        Full name
        <input value={form.full_name} onChange={set('full_name')} placeholder="e.g. Jamie Rivera" required />
      </label>
      <fieldset>
        <legend>Where are you in the program?</legend>
        <div className="chips">
          {PROGRAMS.map((p) => (
            <label key={p.id} className={`chip ${form.program_status === p.id ? 'on' : ''}`}>
              <input type="radio" name="program_status" value={p.id} checked={form.program_status === p.id} onChange={set('program_status')} />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Expected graduation (optional)
        <select value={form.graduation_year} onChange={set('graduation_year')}>
          <option value="">Not sure yet</option>
          {YEARS.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
      </label>
      <label>
        Short bio (optional)
        <textarea value={form.bio} onChange={set('bio')} rows={2} maxLength={280} placeholder="e.g. Switching into IS from accounting. I learn best by doing practice problems." />
      </label>
    </fieldset>
  )

  const classes = (
    <fieldset className="form-section">
      <legend className="section-title">Your IS classes this semester</legend>
      <p className="muted">Pick every class you're taking. You'll join each class's study group automatically.</p>
      <div className="chips">
        {courses.map((c) => (
          <label key={c.id} className={`chip ${form.course_ids.includes(c.id) ? 'on' : ''}`} title={c.name}>
            <input type="checkbox" checked={form.course_ids.includes(c.id)} onChange={() => toggle('course_ids', c.id)} />
            {c.code}
          </label>
        ))}
      </div>
    </fieldset>
  )

  const strengths = (
    <fieldset className="form-section">
      <legend className="section-title">Strengths & needs</legend>
      <fieldset>
        <legend>I'm strong in…</legend>
        <div className="chips">
          {skills.map((s) => (
            <label key={s.id} className={`chip ${form.skill_ids.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={form.skill_ids.includes(s.id)} onChange={() => toggle('skill_ids', s.id)} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>I'd like help with…</legend>
        <div className="chips">
          {skills.map((s) => (
            <label key={s.id} className={`chip need ${form.need_ids.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={form.need_ids.includes(s.id)} onChange={() => toggle('need_ids', s.id)} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Anything specific? (optional)
        <input value={form.looking_for_help_with} onChange={set('looking_for_help_with')} placeholder="e.g. LEFT vs INNER joins" />
      </label>
      <label>
        Ask me about… (an easy conversation starter)
        <input value={form.ask_me_about} onChange={set('ask_me_about')} placeholder="e.g. my favorite study spots on campus" maxLength={80} />
      </label>
    </fieldset>
  )

  const sections = [about, classes, strengths]

  if (isNew) {
    const last = step === STEPS.length - 1
    return (
      <section className="card">
        {onboarding && <p className="eyebrow">Welcome to IS-Connect</p>}
        <h1>Set up your profile</h1>
        <ol className="stepper" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''}>
              <span>{i + 1}</span> {s}
            </li>
          ))}
        </ol>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault()
            if (last) save()
            else if (step === 0 && !form.full_name.trim()) setError('Please enter your name.')
            else {
              setError(null)
              setStep(step + 1)
            }
          }}
        >
          {sections[step]}
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? 'Saving…' : last ? 'Finish' : 'Next →'}
            </button>
            {step > 0 && (
              <button type="button" className="secondary" onClick={() => setStep(step - 1)}>
                ← Back
              </button>
            )}
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="card">
      <h1>Edit your profile</h1>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {about}
        {classes}
        {strengths}
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={() => go('myProfile')}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}
