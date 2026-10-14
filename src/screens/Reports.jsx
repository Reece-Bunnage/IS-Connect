import { useState } from 'react'
import { rpc, useRpc } from '../api.js'
import { PageHeader } from '../ui.jsx'

// Admins only: reports of students and study guides.
// Make someone an admin with `npm run make-admin -- <username>`.
export default function Reports({ me }) {
  const reports = useRpc('admin_reports', {}, [me.id])
  const [showResolved, setShowResolved] = useState(false)
  const [error, setError] = useState(null)

  if (reports.error) return <p className="error">{reports.error}</p>
  if (!reports.data) return <p className="muted">Loading reports…</p>

  const open = reports.data.filter((r) => !r.resolved_at)
  const shown = showResolved ? reports.data : open

  async function act(fn, args) {
    setError(null)
    try {
      await rpc(fn, args)
      await reports.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <PageHeader title="Reports" text={`${open.length} open report${open.length === 1 ? '' : 's'}. Reported students are already blocked by the person who reported them.`} />
      <label className="check">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Show resolved
      </label>
      {error && <p className="error">{error}</p>}
      {shown.length === 0 && <p className="muted">Nothing to review. 🎉</p>}
      <div className="list">
        {shown.map((r) => (
          <article key={r.id} className={`card ${r.resolved_at ? 'resolved' : ''}`}>
            <h3>
              {r.student_name ? `Student: ${r.student_name}` : `Study guide: ${r.resource_title ?? '(deleted)'}`}{' '}
              {r.resolved_at && <span className="badge">Resolved</span>}
            </h3>
            <p>“{r.reason}”</p>
            <p className="muted">
              Reported by {r.reporter} · {new Date(r.created_at).toLocaleString()}
            </p>
            <div className="row actions">
              {r.resource_url && (
                <a className="secondary small button-link" href={r.resource_url} target="_blank" rel="noreferrer">
                  Open link ↗
                </a>
              )}
              {r.resource_id && !r.resolved_at && (
                <button className="secondary small danger" onClick={() => act('admin_delete_resource', { p_resource_id: r.resource_id })}>
                  Delete study guide
                </button>
              )}
              {!r.resolved_at && (
                <button className="primary small" onClick={() => act('resolve_report', { p_report_id: r.id })}>
                  Mark resolved
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
