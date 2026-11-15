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

// "Forgot password?" requests. The admin contacts the student, checks it's
// really them, then sets a temporary password (shown here once) to pass on.
function PasswordResets({ me }) {
  const requests = useRpc('admin_password_resets', {}, [me.id])
  const [confirming, setConfirming] = useState(null) // request id
  const [issued, setIssued] = useState([]) // [{ id, username, temp }] shown until the page is left
  const [copied, setCopied] = useState(null)
  const [error, setError] = useState(null)

  async function run(fn, r) {
    setError(null)
    try {
      const temp = await rpc(fn, { p_request_id: r.id })
      if (fn === 'admin_set_temp_password') setIssued((list) => [{ id: r.id, username: r.username, temp }, ...list])
      setConfirming(null)
      await requests.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function copy(item) {
    try {
      await navigator.clipboard.writeText(item.temp)
      setCopied(item.id)
    } catch {
      // Clipboard blocked; it's on screen to copy by hand.
    }
  }

  const open = requests.data ?? []
  return (
    <section className="okr">
      <h2>Password reset requests</h2>
      <p className="muted">Contact the student and check it's really them (for example their name and classes) before setting a temporary password.</p>
      {requests.error && <p className="error">{requests.error}</p>}
      {error && <p className="error">{error}</p>}
      {issued.map((item) => (
        <article key={item.id} className="card notice-card" role="status">
          <h3>Temporary password for @{item.username}</h3>
          <p className="recovery-code">{item.temp}</p>
          <p>Give this to them directly. It works for 48 hours, and they'll choose a new password when they log in. It won't be shown again.</p>
          <button className="secondary small" onClick={() => copy(item)}>
            {copied === item.id ? 'Copied ✓' : 'Copy'}
          </button>
        </article>
      ))}
      {!requests.data && !requests.error && <p className="muted">Loading…</p>}
      {requests.data && open.length === 0 && <p className="muted">No open requests.</p>}
      <div className="list">
        {open.map((r) => (
          <article key={r.id} className="card">
            <h3>
              @{r.username}
              {r.full_name && <span className="muted"> · {r.full_name}</span>}
            </h3>
            <p>
              <strong>Reach them:</strong> {r.contact}
            </p>
            {r.note && <p>“{r.note}”</p>}
            <p className="muted">Asked {new Date(r.created_at).toLocaleString()}</p>
            {confirming === r.id ? (
              <div className="row actions">
                <span>Reset @{r.username}'s password? Their current password stops working.</span>
                <button className="primary small" onClick={() => run('admin_set_temp_password', r)}>
                  Yes, set temporary password
                </button>
                <button className="secondary small" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="row actions">
                <button className="primary small" onClick={() => setConfirming(r.id)}>
                  Set temporary password
                </button>
                <button className="secondary small" onClick={() => run('admin_dismiss_password_reset', r)}>
                  Dismiss
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

// Admins only: password reset requests, OKR and retention numbers, then
// reports of students and study guides.
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
      <PageHeader title="Reports" text="Password reset requests, progress on our OKRs, and reports of students and study guides to review." />

      <PasswordResets me={me} />

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
