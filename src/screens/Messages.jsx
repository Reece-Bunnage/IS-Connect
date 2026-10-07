import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function Messages() {
  const [messages, setMessages] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('messages')
      .select('id, body, sent_at, sender:sender_id(full_name), recipient:recipient_id(full_name)')
      .order('sent_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setMessages(data)
      })
  }, [])

  return (
    <>
      <h1>Messages</h1>
      <p className="notice">Read-only sample conversations. Sending messages is coming next.</p>
      {error && <p className="error">{error}</p>}
      {!messages && !error && <p className="muted">Loading…</p>}
      <div className="list">
        {messages?.map((m) => (
          <article key={m.id} className="card">
            <p className="muted">
              {m.sender.full_name} → {m.recipient.full_name} · {new Date(m.sent_at).toLocaleString()}
            </p>
            <p>{m.body}</p>
          </article>
        ))}
      </div>
    </>
  )
}
