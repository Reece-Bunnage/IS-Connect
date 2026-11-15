import { useState } from 'react'
import { rpc, useRpc } from '../api.js'
import { PageHeader } from '../ui.jsx'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Our two objectives and their key results, from admin_okr_stats.
// Everyone counts, demo students and team accounts included.
function OkrStats({ stats: s }) {
  const share = (n) => (s.students ? Math.round((100 * n) / s.students) : 0)
  const gain = s.confidence_gain
  const objectives = [
    {
      title: 'Objective 1: More students connected',
      results: [
        ['KR1 · Students with a friend', `${share(s.students_with_friend)}%`, `${s.students_with_friend} of ${s.students} students · ${plural(s.connections, 'connection')}`],
        ['KR2 · Meetings set up', s.meetings, `both people agreed · ${s.students_with_meeting} students (${share(s.students_with_meeting)}%)`],
      ],
    },
    {
      title: "Objective 2: Students' knowledge increased",
      results: [
        ['KR1 · Study guides shared', s.resources_shared, `shared by ${plural(s.resource_sharers, 'student')}`],
        [
          'KR2 · Confidence gain after a study session',
          gain === null ? '–' : `${gain > 0 ? '+' : ''}${gain}`,
          gain === null
            ? 'No surveys yet. Students rate their confidence (1–5) after a meetup.'
            : `points on a 1–5 scale (${s.confidence_before} → ${s.confidence_after}) from ${plural(s.surveys, 'survey')}`,
        ],
      ],
    },
  ]
  return objectives.map((o) => (
    <div key={o.title} className="okr-objective">
      <h3>{o.title}</h3>
      <dl className="okr-tiles">
        {o.results.map(([label, value, detail]) => (
          <div key={label} className="okr-tile">
            <dt>{label}</dt>
            <dd className="okr-value">{value}</dd>
            <dd className="okr-detail">{detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  ))
}

// Do students come back? Real students only, from admin_okr_stats.
function RetentionStats({ stats: s }) {
  const rate = (n, of) => (of ? `${Math.round((100 * n) / of)}%` : '–')
  const tiles = [
    ['Active in the last 7 days', rate(s.active_7d, s.real_students), `${s.active_7d} of ${s.real_students} students`],
    [
      'Week-1 retention',
      rate(s.week1_retained, s.week1_eligible),
      s.week1_eligible
        ? `${s.week1_retained} of ${s.week1_eligible} students who joined 2+ weeks ago came back in their second week`
        : 'No one has been here 2 weeks yet',
    ],
    [
      'Returning students',
      rate(s.returning, s.returning_eligible),
      s.returning_eligible
        ? `${s.returning} of ${s.returning_eligible} students came back a week or more after joining`
        : 'No one has been here a week yet',
    ],
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

// Admins only: OKR and retention numbers, then reports of students and study guides.
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
      <PageHeader title="Reports" text="Progress on our OKRs, and reports of students and study guides to review." />

      <section className="okr">
        <h2>OKRs</h2>
        <p className="muted">Live numbers. Counts everyone, including demo students and team accounts.</p>
        {stats.error && <p className="error">{stats.error}</p>}
        {!stats.data && !stats.error && <p className="muted">Loading…</p>}
        {stats.data && <OkrStats stats={stats.data} />}
      </section>

      {stats.data && (
        <section className="okr">
          <h2>Retention</h2>
          <p className="muted">
            Do students come back? Real students only (demo students can't). Active means they messaged, posted, sent a request, shared or liked a
            guide, or filled in a survey{stats.data.visits_since ? `, or opened the app (counted since ${new Date(`${stats.data.visits_since}T12:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})` : ''}.
          </p>
          <RetentionStats stats={stats.data} />
        </section>
      )}

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
