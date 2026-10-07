import { tipOfTheDay } from '../tips.js'

const tiles = [
  { id: 'createProfile', icon: '👤', label: 'Make Account', note: 'Create your profile' },
  { id: 'findFriends', icon: '🤝', label: 'Find Friends', note: 'Students to study with' },
  { id: 'messages', icon: '💬', label: 'Messages', note: 'Chat and plan to meet' },
  { id: 'calendar', icon: '📅', label: 'Calendar', note: 'Your availability' },
  { id: 'meetups', icon: '📍', label: 'My Meetups', note: 'Upcoming & past' },
  { id: 'resources', icon: '📚', label: 'Study Resources', note: 'Shared study guides' },
  { id: 'blockReport', icon: '🚩', label: 'Block / Report', note: 'Safety & privacy' },
]

export default function Home({ go }) {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">A little support goes a long way</p>
        <h1>You don't have to figure it out alone.</h1>
        <p>Find a study partner, ask your questions, and take your next step in IS.</p>
        <button className="primary" onClick={() => go('createProfile')}>
          Create your profile →
        </button>
      </section>

      <section className="card tip">
        <h2>💡 Tip of the day</h2>
        <p>{tipOfTheDay()}</p>
      </section>

      <section className="tiles">
        {tiles.map((t) => (
          <button key={t.id} className="tile" onClick={() => go(t.id)}>
            <span className="tile-icon">{t.icon}</span>
            <span className="tile-label">{t.label}</span>
            <span className="tile-note">{t.note}</span>
          </button>
        ))}
      </section>
    </>
  )
}
