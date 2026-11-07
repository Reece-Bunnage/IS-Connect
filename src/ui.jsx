// Small pieces shared by several screens.
import { useEffect, useRef } from 'react'

export const NAV = [
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'myProfile', icon: 'user', label: 'My Profile', short: 'Profile' },
  { id: 'findFriends', icon: 'users', label: 'Find Friends', short: 'Friends', badge: 'friend_requests' },
  { id: 'messages', icon: 'message', label: 'Messages', short: 'Messages', badge: 'messages' },
  { id: 'groups', icon: 'group', label: 'Study Groups', short: 'Groups', badge: 'groups_unread' },
  { id: 'calendar', icon: 'calendar', label: 'Availability', short: 'Free times' },
  { id: 'meetups', icon: 'pin', label: 'My Meetups', short: 'Meetups', badge: 'meetup_requests' },
  { id: 'resources', icon: 'book', label: 'Study Resources', short: 'Guides' },
  { id: 'blockReport', icon: 'shield', label: 'Safety & Privacy', short: 'Safety' },
]

// One family of simple line icons (from the IS Together mockup), drawn in the text color.
const ICON_PATHS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
      <path d="M18 14.7c2.4.6 4 2.4 4 5.3" />
    </>
  ),
  message: <path d="M4 5h16v11H9l-5 4z" />,
  group: (
    <>
      <path d="M4 5h11v8H8l-4 3z" />
      <path d="M15 9h5v8l-3-2h-6v-2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  doc: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" />,
}

export function Icon({ name, size = 18 }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  )
}

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

export function PageHeader({ title, text, className = '', eyebrow = 'Your I.S. community' }) {
  return (
    <header className={`page-header ${className}`}>
      <p className="eyebrow">{eyebrow}</p>
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

// A ⋯ button with a small menu of less-used or risky actions. It closes after
// a choice, when you tap elsewhere, or on Escape (focus goes back to ⋯).
export function MoreMenu({ label, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    const onPointerDown = (e) => el.open && !el.contains(e.target) && (el.open = false)
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && el.open) {
        el.open = false
        el.querySelector('summary').focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('keydown', onKeyDown)
    }
  }, [])
  return (
    <details className="more" ref={ref}>
      <summary aria-label={label}>⋯</summary>
      <div className="menu" onClick={(e) => e.target.closest('button') && (ref.current.open = false)}>
        {children}
      </div>
    </details>
  )
}

// The slim bar at the top of an open chat, like a messaging app: back to the
// list (phones only; on desktop the list is beside the chat), who or what the
// chat is, then actions.
export function ChatBar({ onBack, backLabel, icon, title, subtitle, children }) {
  return (
    <div className="chat-bar">
      <button type="button" className="chat-back back-to-list" aria-label={backLabel} onClick={onBack}>
        ‹
      </button>
      {icon}
      <div className="chat-bar-text">
        <h2>{title}</h2>
        {subtitle && <div className="chat-bar-sub">{subtitle}</div>}
      </div>
      <div className="chat-bar-actions">{children}</div>
    </div>
  )
}

// Whether a student has anything for ProfileDetails to show.
export function hasProfileDetails(s) {
  return Boolean(s.bio || s.ask_me_about || s.student_courses?.length || s.student_skills?.length || s.student_needs?.length)
}

// A student's bio, "Ask me about", classes, strengths and needs.
export function ProfileDetails({ student: s }) {
  const classes = (s.student_courses ?? []).map((c) => c.courses.code).sort()
  const strengths = (s.student_skills ?? []).map((k) => k.skills.name)
  const needs = (s.student_needs ?? []).map((n) => n.skills.name)
  return (
    <div className="profile-details">
      {s.bio && <p>{s.bio}</p>}
      {s.ask_me_about && (
        <p>
          <strong>Ask me about:</strong> {s.ask_me_about}
        </p>
      )}
      <dl className="person-facts">
        {classes.length > 0 && (
          <>
            <dt>Classes</dt>
            <dd>{classes.join(' · ')}</dd>
          </>
        )}
        {strengths.length > 0 && (
          <>
            <dt>Strong in</dt>
            <dd className="chips">
              {strengths.map((name) => (
                <span key={name} className="chip on">
                  {name}
                </span>
              ))}
            </dd>
          </>
        )}
        {needs.length > 0 && (
          <>
            <dt>Wants help with</dt>
            <dd className="chips">
              {needs.map((name) => (
                <span key={name} className="chip need on">
                  {name}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

// A centered pop-up (native <dialog>: Esc closes it, focus stays inside).
// Tapping the dark area around it closes it too.
export function Dialog({ dialogRef, title, titleId, onClose, children }) {
  return (
    <dialog ref={dialogRef} className="app-dialog" aria-labelledby={titleId} onClose={onClose} onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <div className="app-dialog-body">
        <div className="survey-dialog-head">
          <div className="app-dialog-title" id={titleId}>
            {title}
          </div>
          <button type="button" className="close-button" aria-label="Close" onClick={() => dialogRef.current.close()}>
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
