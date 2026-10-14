import { useEffect } from 'react'
import { rpc, useRpc } from '../api.js'
import { formatWhen } from '../time.js'
import { PageHeader } from '../ui.jsx'

const ICONS = {
  message_request: '💬',
  message_accepted: '💬',
  friend_request: '🤝',
  friend_accepted: '🤝',
  meetup_requested: '📍',
  meetup_confirmed: '✅',
  meetup_cancelled: '❌',
  meetup_new_time: '🕒',
  meetup_reminder: '⏰',
  match_found: '✨',
}

function timeAgo(value) {
  const minutes = Math.round((Date.now() - new Date(value)) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  return new Date(value).toLocaleDateString()
}

// Everything that happened involving you. Opening this screen marks them read.
export default function Notifications({ go, me, refreshCounts }) {
  const notes = useRpc('my_notifications', {}, [me.id])

  useEffect(() => {
    if (notes.data?.some((n) => !n.read_at && n.kind !== 'meetup_reminder')) {
      rpc('mark_notifications_read').then(refreshCounts)
    }
  }, [notes.data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (notes.error) return <p className="error">Could not load notifications: {notes.error}</p>
  if (!notes.data) return <p className="muted">Loading…</p>

  return (
    <>
      <PageHeader title="What's new." text="Requests, replies, matches and reminders for upcoming study sessions." />
      {notes.data.length === 0 && (
        <section className="card empty">
          <h2>You're all caught up</h2>
          <p className="muted">When someone messages you, sends a request or gets matched with you, it shows up here.</p>
        </section>
      )}
      <div className="list">
        {notes.data.map((n) => (
          <button key={n.id} className={`card notification ${n.read_at || n.kind === 'meetup_reminder' ? '' : 'unread'} ${n.kind === 'meetup_reminder' ? 'reminder' : ''}`} onClick={() => go(n.screen || 'home', n.params ?? {})}>
            <span className="notification-icon" aria-hidden="true">
              {ICONS[n.kind] ?? '🔔'}
            </span>
            <span className="notification-text">
              <span>{n.body}</span>
              <span className="muted small-text">{n.kind === 'meetup_reminder' ? `Starts ${formatWhen(n.at)}` : timeAgo(n.created_at)}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
