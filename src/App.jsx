import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { logOut as endSession, restoreSession } from './auth.js'
import { NAV, NAV_PARENT, NeedsProfile } from './ui.jsx'
import Login from './screens/Login.jsx'
import Home from './screens/Home.jsx'
import CreateProfile from './screens/CreateProfile.jsx'
import MyProfile from './screens/MyProfile.jsx'
import FindFriends from './screens/FindFriends.jsx'
import Messages from './screens/Messages.jsx'
import Calendar from './screens/Calendar.jsx'
import SetupMeetup from './screens/SetupMeetup.jsx'
import Meetups from './screens/Meetups.jsx'
import Resources from './screens/Resources.jsx'
import BlockReport from './screens/BlockReport.jsx'

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
const NEEDS_PROFILE = new Set(['messages', 'calendar', 'setupMeetup', 'meetups', 'blockReport'])

export default function App() {
  const [{ screen, params }, setNav] = useState(loadNav)
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = none yet
  const [profileError, setProfileError] = useState(null)

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
    const { data, error } = await supabase
      .from('students')
      .select('*, student_skills(skill_id, skills(name))')
      .eq('user_id', userId)
      .maybeSingle()
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
    go('home')
  }

  const props = { go, me: profile, params }
  const screens = {
    home: <Home {...props} />,
    createProfile: <CreateProfile go={go} profile={profile} token={session?.token} onSaved={reloadProfile} />,
    myProfile: <MyProfile go={go} profile={profile} />,
    findFriends: <FindFriends {...props} />,
    messages: <Messages {...props} />,
    calendar: <Calendar {...props} />,
    setupMeetup: <SetupMeetup {...props} />,
    meetups: <Meetups {...props} />,
    resources: <Resources {...props} />,
    blockReport: <BlockReport {...props} />,
  }

  let content
  if (session === undefined) content = <p className="muted">Loading…</p>
  else if (!session) content = <Login onLogin={setSession} />
  else if (profileError) content = <p className="error">Could not load your profile: {profileError}</p>
  else if (profile === undefined) content = <p className="muted">Loading your profile…</p>
  else if (NEEDS_PROFILE.has(screen) && !profile) content = <NeedsProfile go={go} />
  else content = screens[screen] ?? screens.home

  const active = NAV_PARENT[screen] ?? screen

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
            <span className="muted">@{session.username}</span>
            <button className="link" onClick={logOut}>
              Log out
            </button>
          </div>
        )}
      </header>

      <div className="layout">
        {session && (
          <nav className="sidebar" aria-label="Main">
            {NAV.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${active === item.id ? 'on' : ''}`}
                onClick={() => go(item.id)}
              >
                <span aria-hidden="true">{item.icon}</span> {item.label}
              </button>
            ))}
            <p className="sidebar-note">
              <strong>You belong here.</strong>
              <br />
              Everyone starts somewhere. Learning is better together.
            </p>
          </nav>
        )}
        <main className="content">{content}</main>
      </div>
    </div>
  )
}
