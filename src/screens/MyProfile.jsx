import { programLabel } from './FindFriends.jsx'

// Your saved profile, read back from the database on every page load.
export default function MyProfile({ go, profile }) {
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

  const skills = profile.student_skills.map((ss) => ss.skills.name)

  return (
    <section className="card success">
      <p className="notice">✅ Loaded from the database. Refresh the page and it's still here.</p>
      <h1>{profile.full_name}</h1>
      <p>
        <span className={`badge ${profile.program_status}`}>{programLabel(profile.program_status)}</span>
        {profile.current_course && <> · {profile.current_course}</>}
      </p>
      {profile.looking_for_help_with && (
        <p>
          <strong>Looking for help with:</strong> {profile.looking_for_help_with}
        </p>
      )}
      {skills.length > 0 && (
        <div className="chips">
          {skills.map((name) => (
            <span key={name} className="chip">
              {name}
            </span>
          ))}
        </div>
      )}
      <p className="muted">Member since {new Date(profile.created_at).toLocaleDateString()}</p>
      <div className="row">
        <button className="primary" onClick={() => go('createProfile')}>
          Edit profile
        </button>
        <button className="secondary" onClick={() => go('findFriends')}>
          See yourself in Find Friends →
        </button>
      </div>
    </section>
  )
}
