import { useState } from 'react'
import { rpc, useRpc } from '../api.js'
import { PageHeader } from '../ui.jsx'

// OKR 1 ("more students connected") as four numbers, from admin_okr_stats.
// Everyone counts, demo students and team accounts included.
function CommunityStats({ stats }) {
  const share = (n) => (stats.students ? `${Math.round((100 * n) / stats.students)}%` : '0%')
  const tiles = [
    ['Students with a meeting set up', stats.students_with_meeting, `of ${stats.students} students (${share(stats.students_with_meeting)})`],
    ['Connections', stats.connections, 'accepted friend connections'],
    ['Students with a friend', stats.students_with_friend, `of ${stats.students} students (${share(stats.students_with_friend)})`],
    ['Calendar synced', stats.calendar_synced, `of ${stats.calendar_links} calendar link${stats.calendar_links === 1 ? '' : 's'} turned on`],
  ]
  return (
    <dl className="okr-tiles">
      {tiles.map(([label, value, detail]) => (
        <div key={label} className="okr-tile">
          <dt>{label}</dt>
          <dd className="okr-value">{value}</dd>
          <dd className="okr-detail">{detail}</dd>
        </div>
      ))}
    </dl>
  )
}

// Admins only: OKR 1 numbers, then reports of students and study guides.
// Make someone an admin with `npm run make-admin -- <username>`.
export default function Reports({ me }) {
  const stats = useRpc('admin_okr_stats', {}, [me.id])
  const reports = useRpc('admin_reports', {}, [me.id])
  const [showResolved, setShowResolved] = useState(false)
  const [error, setError] = useState(null)

  async function act(fn, args) {
    setError(null)
    try {
      await rpc(fn, args)
      await reports.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const open = (reports.data ?? []).filter((r) => !r.resolved_at)
  const shown = showResolved ? (reports.data ?? []) : open

  return (
    <>
      <PageHeader title="Reports" text="How connected students are (OKR 1), and reports of students and study guides to review." />

      <section className="okr">
        <h2>Community (OKR 1)</h2>
        <p className="muted">Objective: more students connected. Counts everyone, including demo students and team accounts.</p>
        {stats.error && <p className="error">{stats.error}</p>}
        {!stats.data && !stats.error && <p className="muted">Loading…</p>}
        {stats.data && <CommunityStats stats={stats.data} />}
      </section>

      <section>
        <h2>Reports to review</h2>
        {reports.error && <p className="error">{reports.error}</p>}
        {!reports.data && !reports.error && <p className="muted">Loading reports…</p>}
        {reports.data && (
          <>
            <p className="muted">
              {open.length} open report{open.length === 1 ? '' : 's'}. Reported students are already blocked by the person who reported them.
            </p>
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
        )}
      </section>
    </>
  )
}
