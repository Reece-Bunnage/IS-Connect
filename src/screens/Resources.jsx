import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery, useRpc } from '../api.js'
import { PageHeader } from '../ui.jsx'

const emptyForm = { title: '', course: '', url: '' }

export default function Resources({ me, showToast }) {
  const [course, setCourse] = useState('all')
  const [search, setSearch] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [reporting, setReporting] = useState(null) // { id, reason }

  const resources = useQuery(
    () =>
      supabase
        .from('study_resources')
        .select('id, title, course, resource_url, uploaded_at, uploader_id, uploader:uploader_id(full_name)')
        .order('uploaded_at', { ascending: false }),
    [],
  )
  const courses = useQuery(() => supabase.from('courses').select('code').order('code'), [])
  const saved = useRpc('my_saved_resource_ids', {}, [me.id])

  if (resources.error) return <p className="error">Could not load study resources: {resources.error}</p>
  if (!resources.data || !courses.data) return <p className="muted">Loading study resources…</p>

  const savedIds = new Set(saved.data ?? [])
  const myCourses = new Set(me.student_courses.map((c) => c.courses.code))
  const q = search.trim().toLowerCase()
  const shown = resources.data.filter(
    (r) =>
      (course === 'all' || (course === 'mine' ? myCourses.has(r.course) : r.course === course)) &&
      (!savedOnly || savedIds.has(r.id)) &&
      (!q || `${r.title} ${r.course ?? ''}`.toLowerCase().includes(q)),
  )

  async function run(fn, args, after) {
    setError(null)
    try {
      await rpc(fn, args)
      await after?.()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  async function share(e) {
    e.preventDefault()
    setBusy(true)
    if (await run('add_resource', { p_title: form.title, p_course: form.course, p_url: form.url }, resources.reload)) {
      setForm(emptyForm)
      setSharing(false)
      showToast({ text: 'Thanks for sharing! 📚' })
    }
    setBusy(false)
  }

  async function report(e) {
    e.preventDefault()
    if (await run('report_resource', { p_resource_id: reporting.id, p_reason: reporting.reason })) {
      setReporting(null)
      showToast({ text: 'Thanks. An admin will review it.' })
    }
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  return (
    <>
      <PageHeader title="Learn from each other." text="Study guides, notes and practice sets made by students, for students." />

      {!sharing && (
        <div className="row">
          <button className="primary" onClick={() => setSharing(true)}>
            + Share a study guide
          </button>
        </div>
      )}

      {sharing && (
        <section className="card">
          <h2>Share a study guide</h2>
          <p className="muted">Paste a link to a Google Doc, Drive file, Canva, Quizlet, or anything others can open.</p>
          <form className="form" onSubmit={share}>
            <label>
              Title
              <input value={form.title} onChange={update('title')} placeholder="e.g. IS 201 Exam 2 Review" required />
            </label>
            <label>
              Class
              <select value={form.course} onChange={update('course')}>
                <option value="">General / no specific class</option>
                {courses.data.map((c) => (
                  <option key={c.code}>{c.code}</option>
                ))}
              </select>
            </label>
            <label>
              Link
              <input type="url" value={form.url} onChange={update('url')} placeholder="https://docs.google.com/…" required />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Sharing…' : 'Share'}
              </button>
              <button type="button" className="secondary" onClick={() => setSharing(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="filters">
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Class filter">
          <option value="all">All classes</option>
          {myCourses.size > 0 && <option value="mine">My classes</option>}
          {courses.data.map((c) => (
            <option key={c.code}>{c.code}</option>
          ))}
        </select>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guides…" aria-label="Search" />
        <label className="check">
          <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
          Saved ({savedIds.size})
        </label>
      </div>

      {!sharing && error && <p className="error">{error}</p>}
      {shown.length === 0 && <p className="muted">{savedOnly ? "You haven't saved any study guides yet." : 'No study guides match.'}</p>}

      <div className="list">
        {shown.map((r) => (
          <article key={r.id} className="card resource">
            <div>
              <h3>📄 {r.title}</h3>
              <p className="muted">
                {r.course && `${r.course} · `}shared by {r.uploader_id === me.id ? 'you' : r.uploader.full_name} · {new Date(r.uploaded_at).toLocaleDateString()}
              </p>
              {reporting?.id === r.id && (
                <form className="row reschedule" onSubmit={report}>
                  <input value={reporting.reason} onChange={(e) => setReporting({ ...reporting, reason: e.target.value })} placeholder="What's wrong? e.g. broken link, spam" aria-label="Reason" required />
                  <button type="submit" className="primary small">
                    Send report
                  </button>
                  <button type="button" className="secondary small" onClick={() => setReporting(null)}>
                    Cancel
                  </button>
                </form>
              )}
            </div>
            <div className="row">
              <a className="secondary small button-link" href={r.resource_url} target="_blank" rel="noreferrer">
                Open ↗
              </a>
              <button
                className={`secondary small ${savedIds.has(r.id) ? 'on' : ''}`}
                aria-pressed={savedIds.has(r.id)}
                onClick={() => run('toggle_saved_resource', { p_resource_id: r.id }, saved.reload)}
              >
                {savedIds.has(r.id) ? '★ Saved' : '☆ Save'}
              </button>
              {r.uploader_id === me.id ? (
                <button className="link small" onClick={() => run('delete_resource', { p_resource_id: r.id }, resources.reload)}>
                  Delete
                </button>
              ) : (
                reporting?.id !== r.id && (
                  <button className="link small muted-link" onClick={() => setReporting({ id: r.id, reason: '' })}>
                    Report
                  </button>
                )
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
