import { useState } from 'react'
import Home from './screens/Home.jsx'
import CreateProfile from './screens/CreateProfile.jsx'
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

  function go(next) {
    setScreen(next)
    try {
      localStorage.setItem(SCREEN_KEY, next)
    } catch {
      // Storage unavailable; the app still works, it just won't remember the screen.
    }
    window.scrollTo(0, 0)
  }

  const screens = {
    home: <Home go={go} />,
    createProfile: <CreateProfile go={go} />,
    findFriends: <FindFriends />,
    messages: <Messages />,
    meetups: <Meetups />,
    resources: <Resources />,
    calendar: <ComingSoon title="Calendar" text="Set your weekly availability and see when others are free." />,
    blockReport: <ComingSoon title="Block / Report" text="Block or report a student you've interacted with." />,
  }

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go('home')}>
          <span className="logo">IS</span> IS-Connect
        </button>
        {screen !== 'home' && (
          <button className="link" onClick={() => go('home')}>
            ← Home
          </button>
        )}
      </header>
      <main className="content">{screens[screen] ?? screens.home}</main>
    </div>
  )
}
