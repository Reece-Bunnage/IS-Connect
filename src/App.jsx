import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { forgetSession, logOut as endSession, restoreSession } from './auth.js'
import { rpc, usePolling } from './api.js'
import { NAV, NAV_PARENT, NeedsProfile, Toast, badgeCount } from './ui.jsx'
import Login from './screens/Login.jsx'
import Home from './screens/Home.jsx'
import CreateProfile from './screens/CreateProfile.jsx'
import MyProfile from './screens/MyProfile.jsx'
import FindFriends from './screens/FindFriends.jsx'
import Messages from './screens/Messages.jsx'
import Groups from './screens/Groups.jsx'
import Calendar from './screens/Calendar.jsx'
import SetupMeetup from './screens/SetupMeetup.jsx'
import Meetups from './screens/Meetups.jsx'
import Resources from './screens/Resources.jsx'
import BlockReport from './screens/BlockReport.jsx'
import Notifications from './screens/Notifications.jsx'
import Reports from './screens/Reports.jsx'

const SCREEN_KEY = 'is-connect-screen'
const PARAMS_KEY = 'is-connect-params'

// The screen (and its params, e.g. which chat is open) is remembered so a
// refresh reopens the same place.
function loadNav() {
  try {
    return {
      screen: localStorage.getItem(SCREEN_KEY) || 'home',
      params: JSON.parse(localStorage.getItem(PARAMS_KEY) || '{}'),
    }
  } catch {
    return { screen: 'home', params: {} }
  }
}

// Screens that only make sense once you have a profile.
const NEEDS_PROFILE = new Set(['messages', 'groups', 'calendar', 'setupMeetup', 'meetups', 'blockReport', 'notifications'])

const PROFILE_SELECT =
  '*, student_skills(skill_id, skills(name)), student_courses(course_id, courses(code)), ' +
  'student_needs(skill_id, skills(name)), availability_slots(day_of_week, start_time, duration_minutes)'

export default function App() {
  const [{ screen, params }, setNav] = useState(loadNav)
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = none yet
  const [profileError, setProfileError] = useState(null)
  const [counts, setCounts] = useState(null)
  const [toast, setToast] = useState(null)

  // Pick up the login this browser saved, if it's still valid.
  useEffect(() => {
    restoreSession()
      .then(setSession)
      .catch(() => setSession(null))
  }, [])

  const userId = session?.user_id

  // Your own row in `students`, read fresh from the database.
  const reloadProfile = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('students').select(PROFILE_SELECT).eq('user_id', userId).maybeSingle()
    if (error) setProfileError(error.message)
    else {
      setProfileError(null)
      setProfile(data)
    }
  }, [userId])

  useEffect(() => {
    setProfile(undefined)
    reloadProfile()
  }, [reloadProfile])

  // Badge counts (unread messages, requests, notifications...). Also marks you "active".
  const hasProfile = Boolean(profile)
  const refreshCounts = useCallback(async () => {
    if (!hasProfile) return setCounts(null)
    try {
      setCounts(await rpc('my_state'))
    } catch {
      // Offline or logged out; keep the last counts.
    }
  }, [hasProfile])
  useEffect(() => {
    refreshCounts()
  }, [refreshCounts, screen])
  usePolling(refreshCounts, 30000)

  // Auto-hide toasts.
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(timer)
  }, [toast])

  function go(next, nextParams = {}) {
    setNav({ screen: next, params: nextParams })
    try {
      localStorage.setItem(SCREEN_KEY, next)
      localStorage.setItem(PARAMS_KEY, JSON.stringify(nextParams))
    } catch {
      // Storage unavailable; the app still works, it just won't remember the screen.
    }
    window.scrollTo(0, 0)
  }

  async function logOut() {
    await endSession()
    setSession(null)
    setCounts(null)
    go('home')
  }

  function accountDeleted() {
    forgetSession()
    setSession(null)
    setCounts(null)
    go('home')
  }

  const props = { go, me: profile, params, counts, refreshCounts, showToast: setToast }
  const screens = {
    home: <Home {...props} />,
    createProfile: <CreateProfile go={go} profile={profile} onSaved={reloadProfile} />,
    myProfile: <MyProfile {...props} profile={profile} session={session} onDeleted={accountDeleted} />,
    findFriends: <FindFriends {...props} />,
    messages: <Messages {...props} />,
    groups: <Groups {...props} />,
    calendar: <Calendar {...props} onSaved={reloadProfile} />,
    setupMeetup: <SetupMeetup {...props} />,
    meetups: <Meetups {...props} />,
    resources: <Resources {...props} />,
    blockReport: <BlockReport {...props} onSaved={reloadProfile} />,
    notifications: <Notifications {...props} />,
    reports: session?.is_admin ? <Reports {...props} /> : null,
  }

  let content
  if (session === undefined) content = <p className="muted">Loading…</p>
  else if (!session) content = <Login onLogin={setSession} />
  else if (profileError) content = <p className="error">Could not load your profile: {profileError}</p>
  else if (profile === undefined) content = <p className="muted">Loading your profile…</p>
  else if (!profile && screen !== 'createProfile') content = <CreateProfile go={go} profile={null} onSaved={reloadProfile} onboarding />
  else if (NEEDS_PROFILE.has(screen) && !profile) content = <NeedsProfile go={go} />
  else content = screens[screen] ?? screens.home

  const active = NAV_PARENT[screen] ?? screen
  const nav = session?.is_admin ? [...NAV, { id: 'reports', icon: '🛡️', label: 'Reports (admin)' }] : NAV
  const notificationCount = counts?.notifications ?? 0

  return (
    <div className={`app ${session ? 'signed-in' : ''}`}>
      <header className="topbar">
        <button className="brand" onClick={() => go('home')}>
          <span className="logo">IS</span> IS-Connect
        </button>
        {session && (
          <div className="row account">
            {screen !== 'home' && (
              <button className="link back-home" onClick={() => go('home')}>
                ← Home
              </button>
            )}
            {profile && (
              <button
                className="bell"
                onClick={() => go('notifications')}
                aria-label={`Notifications${notificationCount ? `, ${notificationCount} new` : ''}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {notificationCount > 0 && <span className="count">{notificationCount}</span>}
              </button>
            )}
            <span className="muted">@{session.username}</span>
            <button className="link" onClick={logOut}>
              Log out
            </button>
          </div>
        )}
      </header>

      <div className={`layout ${session && profile ? 'has-sidebar' : ''}`}>
        {session && profile && (
          <nav className="sidebar" aria-label="Main">
            {nav.map((item) => {
              const n = badgeCount(item, counts)
              return (
                <button key={item.id} className={`nav-item ${active === item.id ? 'on' : ''}`} onClick={() => go(item.id)}>
                  <span aria-hidden="true">{item.icon}</span> {item.label}
                  {n > 0 && <span className="count">{n}</span>}
                </button>
              )
            })}
            <p className="sidebar-note">
              <strong>You belong here.</strong>
              <br />
              Everyone starts somewhere. Learning is better together.
            </p>
          </nav>
        )}
        <main className="content">{content}</main>
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
