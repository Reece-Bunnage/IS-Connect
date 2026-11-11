import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { forgetSession, logOut as endSession, restoreSession } from './auth.js'
import { rpc, usePolling } from './api.js'
import { Icon, NAV, NAV_PARENT, NeedsProfile, TabBar, Toast, arrowKeys, badgeCount } from './ui.jsx'
import Login from './screens/Login.jsx'
import Welcome from './screens/Welcome.jsx'
import GuidedTour, { tourWasSeen } from './GuidedTour.jsx'
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

// Every screen has its own URL, e.g. #/messages?studentId=…, so the browser's
// Back button and the phone's swipe-back gesture step through the app instead
// of leaving it, and a refresh reopens the same place. Hash URLs need no
// server setup, so they work on GitHub Pages.
function toHash(screen, params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== false && value !== '') query.set(key, String(value))
  }
  const qs = query.toString()
  return `#/${screen === 'home' ? '' : screen}${qs ? `?${qs}` : ''}`
}

// Params come back as strings (e.g. freeMatch: "true").
function fromHash(hash = window.location.hash) {
  const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?')
  return { screen: decodeURIComponent(path) || 'home', params: Object.fromEntries(new URLSearchParams(qs)) }
}

function currentHash() {
  const { screen, params } = fromHash()
  return toHash(screen, params)
}

// history.state for each app entry: `depth` counts the app pages behind it,
// `prevScreen` is the screen of the one directly behind it.
function historyState() {
  return window.history.state ?? { depth: 0, prevScreen: null }
}

// Screens that only make sense once you have a profile.
const NEEDS_PROFILE = new Set(['messages', 'groups', 'calendar', 'setupMeetup', 'meetups', 'blockReport', 'notifications'])

const PROFILE_SELECT =
  '*, student_skills(skill_id, skills(name)), student_courses(course_id, courses(code)), ' +
  'student_needs(skill_id, skills(name)), availability_slots(day_of_week, start_time, duration_minutes)'

export default function App() {
  const [{ screen, params }, setNav] = useState(() => fromHash())
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = none yet
  const [profileError, setProfileError] = useState(null)
  const [counts, setCounts] = useState(null)
  const [toast, setToast] = useState(null)
  const [authMode, setAuthMode] = useState(null)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourCheckedFor, setTourCheckedFor] = useState(null)

  // Back/forward (button or swipe) changes the URL; show the screen it names.
  useEffect(() => {
    if (!window.history.state) window.history.replaceState(historyState(), '')
    const onPop = () => setNav(fromHash())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Pick up the login this browser saved, if it's still valid.
  useEffect(() => {
    restoreSession()
      .then(setSession)
      .catch(() => setSession(null))
  }, [])

  const userId = session?.user_id

  useEffect(() => {
    if (!userId || !profile || tourCheckedFor === userId) return
    setTourCheckedFor(userId)
    if (!tourWasSeen(userId)) setTourOpen(true)
  }, [userId, profile, tourCheckedFor])

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

  // Open a screen. `replace` swaps the current history entry instead of adding
  // one: use it after a form is submitted or something is left/deleted, so
  // Back doesn't return to a page that no longer applies.
  function go(next, nextParams = {}, { replace = false } = {}) {
    const url = toHash(next, nextParams)
    const here = historyState()
    if (replace) window.history.replaceState(here, '', url)
    else if (url !== currentHash()) window.history.pushState({ depth: here.depth + 1, prevScreen: fromHash().screen }, '', url)
    // Read params back from the URL so a click and a refresh see the same values.
    setNav(fromHash(url))
    window.scrollTo(0, 0)
  }

  // One step back inside the app. With `to` (an in-page "← Messages" link) it
  // only steps back if that screen is the page behind; otherwise it opens `to`.
  // If there's no app page behind (the link was opened directly), it opens the
  // parent screen or Home rather than leaving the site.
  function back(to, toParams = {}) {
    const here = historyState()
    if (here.depth > 0 && (to === undefined || here.prevScreen === to)) window.history.back()
    else go(to ?? NAV_PARENT[screen] ?? 'home', toParams, { replace: true })
  }

  async function logOut() {
    await endSession()
    setSession(null)
    setAuthMode(null)
    setTourOpen(false)
    setTourCheckedFor(null)
    setCounts(null)
    go('home', {}, { replace: true })
  }

  function accountDeleted() {
    forgetSession()
    setSession(null)
    setAuthMode(null)
    setTourOpen(false)
    setTourCheckedFor(null)
    setCounts(null)
    go('home', {}, { replace: true })
  }

  const props = { go, back, me: profile, params, counts, refreshCounts, showToast: setToast }
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
  else if (!session) content = authMode
    ? <><button className="link welcome-back" onClick={() => setAuthMode(null)}>← Back to welcome</button><Login key={authMode} initialMode={authMode} onLogin={setSession} /></>
    : <Welcome onStart={setAuthMode} />
  else if (profileError) content = <p className="error">Could not load your profile: {profileError}</p>
  else if (profile === undefined) content = <p className="muted">Loading your profile…</p>
  else if (!profile && screen !== 'createProfile') content = <CreateProfile go={go} profile={null} onSaved={reloadProfile} onboarding />
  else if (NEEDS_PROFILE.has(screen) && !profile) content = <NeedsProfile go={go} />
  else content = screens[screen] ?? screens.home

  const active = NAV_PARENT[screen] ?? screen
  const nav = session?.is_admin ? [...NAV, { id: 'reports', icon: 'doc', label: 'Reports (admin)' }] : NAV
  const notificationCount = counts?.notifications ?? 0
  const hasNav = Boolean(session && profile)
  // An open chat keeps the whole phone screen, like a messaging app: its own
  // ‹ button goes back to the list, so the tab bar steps aside.
  const inChat = (screen === 'messages' && params.studentId) || (screen === 'groups' && params.groupId)
  const hasTabBar = hasNav && !inChat

  return (
    <div className={`app ${session ? 'signed-in' : !authMode ? 'welcome-app' : ''} ${hasNav ? 'has-nav' : ''} ${hasTabBar ? 'has-tabbar' : ''}`}>
      {/* First Tab stop, shown only when focused: jumps past the header and
          menu. A button, not <a href="#main">, which would change the page. */}
      <button className="skip-link" onClick={() => document.getElementById('main').focus()}>
        Skip to main content
      </button>
      <header className="topbar">
        <button className="brand" onClick={() => session ? go('home') : setAuthMode(null)}>
          <span className="logo">IS</span> IS-Connect
        </button>
        {!session && session !== undefined && <button className="link" onClick={() => setAuthMode(authMode ? null : 'login')}>{authMode ? 'Welcome' : 'Log in'}</button>}
        {session && (
          <div className="row account">
            {screen !== 'home' && (
              <button className="link back-home" onClick={() => back()}>
                ← Back
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
            <button className="link" disabled={!profile} onClick={() => setTourOpen(true)}>Help / Tour</button>
            <span className="muted">@{session.username}</span>
            <button className="link logout" onClick={logOut}>
              Log out
            </button>
          </div>
        )}
      </header>

      <div className={`layout ${hasNav ? 'has-sidebar' : ''}`}>
        {hasNav && (
          <nav className="sidebar" aria-label="Main" onKeyDown={arrowKeys({ vertical: true })}>
            {nav.map((item) => {
              const n = badgeCount(item, counts)
              return (
                <button
                  key={item.id}
                  data-tour={item.id}
                  className={`nav-item ${active === item.id ? 'on' : ''}`}
                  aria-current={active === item.id ? 'page' : undefined}
                  onClick={() => go(item.id)}
                >
                  <Icon name={item.icon} /> {item.label}
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
        <main id="main" className="content" tabIndex={-1}>
          {content}
        </main>
      </div>
      {hasTabBar && <TabBar nav={nav} active={active} counts={counts} go={go} username={session.username} onLogOut={logOut} />}
      {tourOpen && session && profile && <GuidedTour userId={userId} go={go} onClose={() => setTourOpen(false)} />}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
