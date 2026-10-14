import { supabase } from '../supabaseClient.js'
import { useQuery } from '../api.js'
import { tipOfTheDay } from '../tips.js'
import { NAV } from '../ui.jsx'

// Things waiting on you: friend requests and meetup requests sent to you.
function usePending(meId) {
  const { data } = useQuery(async () => {
    if (!meId) return { data: null }
    const [friends, meetups] = await Promise.all([
      supabase.from('friendships').select('id', { count: 'exact', head: true }).eq('addressee_id', meId).eq('status', 'pending'),
      supabase
        .from('meetups')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', meId)
        .eq('status', 'requested')
        .gte('scheduled_at', new Date().toISOString()),
    ])
    return { data: { findFriends: friends.count ?? 0, meetups: meetups.count ?? 0 } }
  }, [meId])
  return data ?? {}
}

export default function Home({ go, me }) {
  const pending = usePending(me?.id)

  return (
    <>
      <section className="hero">
        <p className="eyebrow">A little support goes a long way</p>
        {me ? (
          <>
            <h1>Welcome back, {me.full_name.split(' ')[0]}!</h1>
            <p>Pick up where you left off: find a study partner or check your messages.</p>
            <div className="row">
              <button className="primary" onClick={() => go('findFriends')}>
                Find your study partner →
              </button>
              <button className="secondary" onClick={() => go('myProfile')}>
                My profile
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>You don't have to figure it out alone.</h1>
            <p>Find a study partner, ask your questions, and take your next step in IS.</p>
            <button className="primary" onClick={() => go('createProfile')}>
              Create your profile →
            </button>
          </>
        )}
      </section>

      {(pending.findFriends > 0 || pending.meetups > 0) && (
        <section className="card notice-card">
          {pending.findFriends > 0 && (
            <p>
              🤝 You have {pending.findFriends} friend request{pending.findFriends > 1 && 's'}.{' '}
              <button className="link" onClick={() => go('findFriends', { show: 'requests' })}>
                Review →
              </button>
            </p>
          )}
          {pending.meetups > 0 && (
            <p>
              📍 {pending.meetups} student{pending.meetups > 1 && 's'} asked to meet you.{' '}
              <button className="link" onClick={() => go('meetups')}>
                Review →
              </button>
            </p>
          )}
        </section>
      )}

      <section className="card tip">
        <h2>💡 Tip of the day</h2>
        <p>{tipOfTheDay()}</p>
      </section>

      <section className="tiles">
        {NAV.filter((t) => t.id !== 'home').map((t) => (
          <button key={t.id} className="tile" onClick={() => go(t.id)}>
            <span className="tile-icon">{t.icon}</span>
            <span className="tile-label">
              {t.label}
              {pending[t.id] > 0 && <span className="count">{pending[t.id]}</span>}
            </span>
            <span className="tile-note">{t.note}</span>
          </button>
        ))}
      </section>
    </>
  )
}
