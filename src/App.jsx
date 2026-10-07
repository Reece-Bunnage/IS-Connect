import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import Login from './screens/Login.jsx'
import Home from './screens/Home.jsx'
import CreateProfile from './screens/CreateProfile.jsx'
import MyProfile from './screens/MyProfile.jsx'
import FindFriends from './screens/FindFriends.jsx'
import Messages from './screens/Messages.jsx'
import Meetups from './screens/Meetups.jsx'
import Resources from './screens/Resources.jsx'
import ComingSoon from './screens/ComingSoon.jsx'

const SCREEN_KEY = 'is-connect-screen'

function loadScreen() {
  try {
    return localStorage.getItem(SCREEN_KEY) || 'home'
  } catch {
    return 'home'
  }
}

export default function App() {
  const [screen, setScreen] = useState(loadScreen)
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [profile, setProfile] = useState(undefined) // undefined = loading, null = none yet
  const [profileError, setProfileError] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

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

  function go(next) {
    setScreen(next)
    try {
      localStorage.setItem(SCREEN_KEY, next)
    } catch {
      // Storage unavailable; the app still works, it just won't remember the screen.
    }
    window.scrollTo(0, 0)
  }

  async function logOut() {
    await supabase.auth.signOut()
    go('home')
  }

  const screens = {
    home: <Home go={go} profile={profile} />,
    createProfile: <CreateProfile go={go} profile={profile} onSaved={reloadProfile} />,
    myProfile: <MyProfile go={go} profile={profile} />,
    findFriends: <FindFriends />,
    messages: <Messages />,
    meetups: <Meetups />,
    resources: <Resources />,
    calendar: <ComingSoon title="Calendar" text="Set your weekly availability and see when others are free." />,
    blockReport: <ComingSoon title="Block / Report" text="Block or report a student you've interacted with." />,
  }

  let content
  if (session === undefined) content = <p className="muted">Loading…</p>
  else if (!session) content = <Login />
  else if (profileError) content = <p className="error">Could not load your profile: {profileError}</p>
  else if (profile === undefined) content = <p className="muted">Loading your profile…</p>
  else content = screens[screen] ?? screens.home

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go('home')}>
          <span className="logo">IS</span> IS-Connect
        </button>
        {session && (
          <div className="row account">
            {screen !== 'home' && (
              <button className="link" onClick={() => go('home')}>
                ← Home
              </button>
            )}
            <span className="muted">{session.user.email}</span>
            <button className="link" onClick={logOut}>
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="content">{content}</main>
    </div>
  )
}
