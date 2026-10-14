import { tipOfTheDay } from '../tips.js'
import { CompletenessMeter, NAV, badgeCount, inviteClassmate } from '../ui.jsx'

export default function Home({ go, me, counts, showToast }) {
  const c = counts ?? {}
  const attention = [
    c.message_requests > 0 && { text: `${c.message_requests} message request${c.message_requests > 1 ? 's' : ''}`, screen: 'messages', params: { tab: 'requests' } },
    c.unread_messages > 0 && { text: `${c.unread_messages} unread message${c.unread_messages > 1 ? 's' : ''}`, screen: 'messages' },
    c.friend_requests > 0 && { text: `${c.friend_requests} friend request${c.friend_requests > 1 ? 's' : ''}`, screen: 'findFriends', params: { show: 'requests' } },
    c.meetup_requests > 0 && { text: `${c.meetup_requests} meetup invite${c.meetup_requests > 1 ? 's' : ''} to answer`, screen: 'meetups' },
    c.groups_unread > 0 && { text: `${c.groups_unread} new study group message${c.groups_unread > 1 ? 's' : ''}`, screen: 'groups' },
    me.availability_updated_at &&
      Date.now() - new Date(me.availability_updated_at) > 60 * 864e5 && { text: 'Your free times are over 2 months old', screen: 'calendar' },
  ].filter(Boolean)

  async function invite() {
    showToast({ text: await inviteClassmate() })
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">A little support goes a long way</p>
        <h1>Welcome back, {me.full_name.split(' ')[0]}!</h1>
        <p>Pick up where you left off: find a study partner or check your messages.</p>
        <div className="row">
          <button className="primary" onClick={() => go('findFriends')}>
            Find your study partner →
          </button>
          <button className="secondary" onClick={invite}>
            Invite a classmate
          </button>
        </div>
      </section>

      {attention.length > 0 && (
        <section className="card notice-card">
          <h2>Needs your attention</h2>
          {attention.map((a) => (
            <p key={a.text}>
              {a.text}{' '}
              <button className="link" onClick={() => go(a.screen, a.params)}>
                Review →
              </button>
            </p>
          ))}
        </section>
      )}

      <CompletenessMeter profile={me} go={go} compact />

      <section className="card tip">
        <h2>💡 Tip of the day</h2>
        <p>{tipOfTheDay()}</p>
      </section>

      <section className="tiles">
        {NAV.filter((t) => t.id !== 'home').map((t) => {
          const n = badgeCount(t, counts)
          return (
            <button key={t.id} className="tile" onClick={() => go(t.id)}>
              <span className="tile-icon">{t.icon}</span>
              <span className="tile-label">
                {t.label}
                {n > 0 && <span className="count">{n}</span>}
              </span>
              <span className="tile-note">{t.note}</span>
            </button>
          )
        })}
      </section>
    </>
  )
}
