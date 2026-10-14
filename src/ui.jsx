// Small pieces shared by several screens.

export const NAV = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'myProfile', icon: '👤', label: 'My Profile', note: 'View or edit your profile' },
  { id: 'findFriends', icon: '🤝', label: 'Find Friends', note: 'Students to study with' },
  { id: 'messages', icon: '💬', label: 'Messages', note: 'Chat and plan to meet' },
  { id: 'calendar', icon: '📅', label: 'Availability', note: "When you're free" },
  { id: 'meetups', icon: '📍', label: 'My Meetups', note: 'Upcoming & past' },
  { id: 'resources', icon: '📚', label: 'Study Resources', note: 'Shared study guides' },
  { id: 'blockReport', icon: '🚩', label: 'Safety & Privacy', note: 'Block or report' },
]

// Which nav item to highlight for screens that aren't in the nav.
export const NAV_PARENT = { createProfile: 'myProfile', setupMeetup: 'meetups' }

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

export function Avatar({ name }) {
  return <div className="avatar">{initials(name)}</div>
}

export function PageHeader({ title, text }) {
  return (
    <header className="page-header">
      <p className="eyebrow">Your IS community</p>
      <h1>{title}</h1>
      {text && <p className="muted">{text}</p>}
    </header>
  )
}

export function NeedsProfile({ go }) {
  return (
    <section className="card empty">
      <h2>Create your profile first</h2>
      <p className="muted">Other students need to know who you are before you can connect.</p>
      <button className="primary" onClick={() => go('createProfile')}>
        Create your profile →
      </button>
    </section>
  )
}
