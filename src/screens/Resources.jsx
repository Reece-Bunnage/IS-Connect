import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { rpc, useQuery } from '../api.js'
import { PageHeader } from '../ui.jsx'

const emptyForm = { title: '', course: '', url: '' }

export default function Resources({ go, me }) {
  const [course, setCourse] = useState('all')
  const [search, setSearch] = useState('')
  const [sharing, setSharing] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const resources = useQuery(
    () =>
      supabase
        .from('study_resources')
        .select('id, title, course, resource_url, uploaded_at, uploader_id, uploader:uploader_id(full_name)')
        .order('uploaded_at', { ascending: false }),
    [],
  )

  if (resources.error) return <p className="error">Could not load study resources: {resources.error}</p>
  if (!resources.data) return <p className="muted">Loading study resources…</p>

  const courses = [...new Set(resources.data.map((r) => r.course).filter(Boolean))].sort()
  const q = search.trim().toLowerCase()
  const shown = resources.data.filter(
    (r) => (course === 'all' || r.course === course) && (!q || `${r.title} ${r.course ?? ''}`.toLowerCase().includes(q)),
  )

  async function share(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await rpc('add_resource', { p_title: form.title, p_course: form.course, p_url: form.url })
      setForm(emptyForm)
      setSharing(false)
      await resources.reload()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function remove(id) {
    setError(null)
    try {
      await rpc('delete_resource', { p_resource_id: id })
      await resources.reload()
    } catch (err) {
      setError(err.message)
    }
  }

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  return (
    <>
      <PageHeader title="Learn from each other." text="Study guides, notes and practice sets made by students, for students." />

      {!sharing && (
        <div className="row">
          <button className="primary" onClick={() => (me ? setSharing(true) : go('createProfile'))}>
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
              Course
              <input value={form.course} onChange={update('course')} placeholder="e.g. IS 201" list="course-options" />
              <datalist id="course-options">
                {courses.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label="Course filter">
          <option value="all">All courses</option>
          {courses.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search guides…" aria-label="Search" />
      </div>

      {!sharing && error && <p className="error">{error}</p>}
      {shown.length === 0 && <p className="muted">No study guides match.</p>}

      <div className="list">
        {shown.map((r) => (
          <article key={r.id} className="card resource">
            <div>
              <h3>📄 {r.title}</h3>
              <p className="muted">
                {r.course && `${r.course} · `}shared by {r.uploader_id === me?.id ? 'you' : r.uploader.full_name} ·{' '}
                {new Date(r.uploaded_at).toLocaleDateString()}
              </p>
            </div>
            <div className="row">
              <a className="secondary small button-link" href={r.resource_url} target="_blank" rel="noreferrer">
                Open ↗
              </a>
              {r.uploader_id === me?.id && (
                <button className="link small" onClick={() => remove(r.id)}>
                  Delete
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  )
}
