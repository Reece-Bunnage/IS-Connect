import { useState } from 'react'
import { rpc } from '../api.js'
import { formatSlot } from '../time.js'
import { Avatar, CompletenessMeter, programLabel } from '../ui.jsx'

const CONTACT_LABEL = { anyone: 'Anyone', courses: 'Classmates and friends', friends: 'Friends only' }

// Your saved profile, read back from the database on every page load.
export default function MyProfile({ go, profile, session, onDeleted }) {
  const [code, setCode] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)

  if (!profile) {
    return (
      <section className="card">
        <h1>No profile yet</h1>
        <p className="muted">Create your profile so other students can find you.</p>
        <button className="primary" onClick={() => go('createProfile')}>
          Create your profile →
        </button>
      </section>
    )
  }

  const courses = profile.student_courses.map((c) => c.courses.code).sort()
  const skills = profile.student_skills.map((s) => s.skills.name)
  const needs = profile.student_needs.map((s) => s.skills.name)

  async function newCode() {
    setError(null)
    try {
      setCode(await rpc('new_recovery_code'))
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteAccount(e) {
    e.preventDefault()
    setError(null)
    try {
      await rpc('delete_account', { p_password: password })
      onDeleted()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <CompletenessMeter profile={profile} go={go} />

      <section className="card success">
        <p className="notice">✅ Loaded from the database. Refresh the page and it's still here.</p>
        <div className="person">
          <Avatar name={profile.full_name} color={profile.avatar_color} />
          <div className="person-body">
            <h1>{profile.full_name}</h1>
            <p>
              <span className={`badge ${profile.program_status}`}>{programLabel(profile.program_status)}</span>
              {profile.graduation_year && <span className="muted"> · Class of {profile.graduation_year}</span>}
              <span className="muted"> · @{session.username}</span>
            </p>
          </div>
        </div>
        {profile.bio && <p>{profile.bio}</p>}
        <dl className="details">
          <dt>Classes</dt>
          <dd>{courses.length ? courses.join(', ') : <span className="muted">None yet</span>}</dd>
          <dt>Strong in</dt>
          <dd>
            {skills.length ? (
              <span className="chips inline">
                {skills.map((n) => (
                  <span key={n} className="chip on">
                    {n}
                  </span>
                ))}
              </span>
            ) : (
              <span className="muted">None yet</span>
            )}
          </dd>
          <dt>Wants help with</dt>
          <dd>
            {needs.length ? (
              <span className="chips inline">
                {needs.map((n) => (
                  <span key={n} className="chip need on">
                    {n}
                  </span>
                ))}
              </span>
            ) : (
              <span className="muted">None yet</span>
            )}
            {profile.looking_for_help_with && <span className="muted"> · {profile.looking_for_help_with}</span>}
          </dd>
          <dt>Ask me about</dt>
          <dd>{profile.ask_me_about || <span className="muted">Not set</span>}</dd>
          <dt>Free times</dt>
          <dd>{profile.availability_slots.length ? profile.availability_slots.map(formatSlot).join(', ') : <span className="muted">Not set</span>}</dd>
          <dt>Who can contact me</dt>
          <dd>
            {CONTACT_LABEL[profile.contact_setting]}{' '}
            <button className="link small" onClick={() => go('blockReport')}>
              Change
            </button>
          </dd>
        </dl>
        <p className="muted">Member since {new Date(profile.created_at).toLocaleDateString()}</p>
        <div className="row">
          <button className="primary" onClick={() => go('createProfile')}>
            Edit profile
          </button>
          <button className="secondary" onClick={() => go('findFriends')}>
            Find study partners →
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Account</h2>
        {error && <p className="error">{error}</p>}
        <h3 className="spaced">Recovery code</h3>
        <p className="muted">Lost your recovery code? Make a new one. The old one stops working.</p>
        {code ? (
          <>
            <p className="recovery-code">{code}</p>
            <p className="notice">Save this somewhere safe. It won't be shown again.</p>
          </>
        ) : (
          <button className="secondary" onClick={newCode}>
            Make a new recovery code
          </button>
        )}

        <h3 className="spaced">Delete account</h3>
        {!deleting ? (
          <button className="secondary danger" onClick={() => setDeleting(true)}>
            Delete my account…
          </button>
        ) : (
          <form className="form danger-zone" onSubmit={deleteAccount}>
            <p>
              This permanently deletes your login, profile, messages, meetups and study guides. <strong>It can't be undone.</strong>
            </p>
            <label>
              Type your password to confirm
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <div className="row">
              <button type="submit" className="primary danger-fill">
                Delete forever
              </button>
              <button type="button" className="secondary" onClick={() => setDeleting(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  )
}
