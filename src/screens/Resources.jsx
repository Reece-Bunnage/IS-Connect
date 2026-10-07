import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function Resources() {
  const [resources, setResources] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('study_resources')
      .select('id, title, course, resource_url, uploaded_at, uploader:uploader_id(full_name)')
      .order('uploaded_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setResources(data)
      })
  }, [])

  return (
    <>
      <h1>Study Resources</h1>
      <p className="notice">Read-only sample study guides. Uploading is coming next.</p>
      {error && <p className="error">{error}</p>}
      {!resources && !error && <p className="muted">Loading…</p>}
      <div className="list">
        {resources?.map((r) => (
          <article key={r.id} className="card">
            <h3>{r.title}</h3>
            <p className="muted">
              {r.course} · shared by {r.uploader.full_name}
            </p>
          </article>
        ))}
      </div>
    </>
  )
}
