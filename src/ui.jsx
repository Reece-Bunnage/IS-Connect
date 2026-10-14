// Small pieces shared by several screens.

export const NAV = [
  { id: 'home', icon: '🏠', label: 'Home' },
  { id: 'myProfile', icon: '👤', label: 'My Profile', note: 'View or edit your profile' },
  { id: 'findFriends', icon: '🤝', label: 'Find Friends', note: 'Students to study with', badge: 'friend_requests' },
  { id: 'messages', icon: '💬', label: 'Messages', note: 'Chat and plan to meet', badge: 'messages' },
  { id: 'groups', icon: '👥', label: 'Study Groups', note: 'One per class, plus matches', badge: 'groups_unread' },
  { id: 'calendar', icon: '📅', label: 'Availability', note: "When you're free" },
  { id: 'meetups', icon: '📍', label: 'My Meetups', note: 'Upcoming & past', badge: 'meetup_requests' },
  { id: 'resources', icon: '📚', label: 'Study Resources', note: 'Shared study guides' },
  { id: 'blockReport', icon: '🚩', label: 'Safety & Privacy', note: 'Who can contact you' },
]

// Which nav item to highlight for screens that aren't in the nav.
export const NAV_PARENT = { createProfile: 'myProfile', setupMeetup: 'meetups' }

// Badge number for a nav item, from my_state's counts.
export function badgeCount(item, counts) {
  if (!item.badge || !counts) return 0
  if (item.badge === 'messages') return (counts.unread_messages ?? 0) + (counts.message_requests ?? 0)
  return counts[item.badge] ?? 0
}

export const PROGRAMS = [
  { id: 'pre_is', label: 'Pre-IS' },
  { id: 'is_core', label: 'IS Core' },
  { id: 'is_minor', label: 'IS Minor' },
  { id: 'ta', label: 'TA / Mentor' },
]

export function programLabel(status) {
  return PROGRAMS.find((p) => p.id === status)?.label ?? 'Pre-IS'
}

// Dark enough for white initials (all at least 4.5:1).
export const AVATAR_COLORS = ['#24543f', '#2f4fb5', '#7a3fa0', '#a8431f', '#1f6f78', '#b0306a', '#8a5a00', '#4a4f57']

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function Avatar({ name, color, small }) {
  return (
    <div className={`avatar ${small ? 'small' : ''}`} style={{ background: color || '#24543f' }} aria-hidden="true">
      {initials(name)}
    </div>
  )
}

// "Active now" / "Active today" / "Active this week", or nothing.
export function activeLabel(lastActive) {
  if (!lastActive) return null
  const minutes = (Date.now() - new Date(lastActive)) / 60000
  if (minutes < 10) return 'Active now'
  if (minutes < 24 * 60) return 'Active today'
  if (minutes < 7 * 24 * 60) return 'Active this week'
  return null
}

export function ActiveDot({ lastActive }) {
  const label = activeLabel(lastActive)
  if (!label) return null
  return <span className={`active-label ${label === 'Active now' ? 'now' : ''}`}>{label}</span>
}

// Sample students have no login; they answer automatically.
export function DemoBadge({ student }) {
  if (student?.user_id !== null && !student?.is_sample) return null
  return (
    <span className="badge demo" title="Sample student for testing: accepts requests and replies automatically">
      Demo
    </span>
  )
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

// What a complete profile has. Matching in Find Friends depends on most of these.
export function profileChecklist(profile) {
  if (!profile) return []
  return [
    { id: 'courses', label: 'Add your IS classes', done: profile.student_courses?.length > 0, screen: 'createProfile' },
    { id: 'needs', label: 'Say what you need help with', done: profile.student_needs?.length > 0, screen: 'createProfile' },
    { id: 'skills', label: 'List your strengths', done: profile.student_skills?.length > 0, screen: 'createProfile' },
    { id: 'times', label: 'Set your free times', done: profile.availability_slots?.length > 0, screen: 'calendar' },
    { id: 'bio', label: 'Write a short bio', done: Boolean(profile.bio), screen: 'createProfile' },
    { id: 'ask', label: 'Add an "Ask me about" icebreaker', done: Boolean(profile.ask_me_about), screen: 'createProfile' },
  ]
}

// LinkedIn-style "profile strength" meter with the next steps.
export function CompletenessMeter({ profile, go, compact }) {
  const items = profileChecklist(profile)
  const done = items.filter((i) => i.done).length
  const percent = Math.round((done / items.length) * 100)
  if (compact && percent === 100) return null
  const todo = items.filter((i) => !i.done)
  return (
    <section className="card meter-card">
      <div className="meter-head">
        <h2>Profile strength: {percent}%</h2>
        <span className="muted">{percent === 100 ? 'All set!' : 'Complete profiles get better matches.'}</span>
      </div>
      <div className="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} aria-label="Profile strength">
        <div className="meter-fill" style={{ width: `${percent}%` }} />
      </div>
      {todo.length > 0 && (
        <ul className="checklist">
          {(compact ? todo.slice(0, 2) : todo).map((i) => (
            <li key={i.id}>
              <button className="link" onClick={() => go(i.screen)}>
                {i.label} →
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// A short message at the bottom of the screen, optionally with an Undo button.
export function Toast({ toast, onClose }) {
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          className="link"
          onClick={() => {
            toast.undo()
            onClose()
          }}
        >
          Undo
        </button>
      )}
      <button className="link muted-link" aria-label="Dismiss" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}

// "Invite a classmate": share sheet on phones, copy the link elsewhere.
export async function inviteClassmate() {
  const url = window.location.origin + import.meta.env.BASE_URL
  const text = 'Join me on IS-Connect to find IS study partners:'
  try {
    if (navigator.share) {
      await navigator.share({ title: 'IS-Connect', text, url })
      return 'Thanks for sharing!'
    }
    await navigator.clipboard.writeText(`${text} ${url}`)
    return 'Invite link copied. Paste it to a classmate!'
  } catch {
    return `Share this link: ${url}`
  }
}
