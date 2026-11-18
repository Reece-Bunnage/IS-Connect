import { useState } from 'react'
import { rpc, useRpc } from '../api.js'
import { PageHeader } from '../ui.jsx'

const blank = { title: '', course: '', url: '' }

export default function AdminMaintenance({ me }) {
  const [section, setSection] = useState('users')
  const users = useRpc('admin_users', {}, [me.id])
  const resources = useRpc('admin_resources', {}, [me.id])
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [issuedPassword, setIssuedPassword] = useState('')

  async function act(fn, args, reload) {
    setBusy(true); setError('')
    try { await rpc(fn, args); setDraft(null); await reload() }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function saveResource(e) {
    e.preventDefault()
    await act('admin_save_resource', { p_resource_id: draft.id ?? null, p_title: draft.title, p_course: draft.course, p_url: draft.resource_url }, resources.reload)
  }

  return <>
    <PageHeader title="Admin maintenance" text="Manage app users and study guide records." />
    <div className="row" role="group" aria-label="Maintenance sections">
      <button className={section === 'users' ? 'primary' : 'secondary'} onClick={() => { setSection('users'); setDraft(null) }}>Maintain Users</button>
      <button className={section === 'records' ? 'primary' : 'secondary'} onClick={() => { setSection('records'); setDraft(null) }}>Maintain Records</button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {section === 'users' ? <section>
      <h2>Users</h2>
      <form className="card form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); setIssuedPassword(''); try { const created = await rpc('admin_create_user', { p_username: newUsername }); setIssuedPassword(created.temp_password); setNewUsername(''); await users.reload() } catch (err) { setError(err.message) } finally { setBusy(false) } }}>
        <h3>Add user</h3>
        <p className="muted">A temporary password will be shown once. Give it to the user so they can set their own password at first login.</p>
        <label>Username<input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_.]+" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} /></label>
        <button className="primary" disabled={busy}>Create user</button>
        {issuedPassword && <p className="notice" role="status">Temporary password: <strong>{issuedPassword}</strong></p>}
      </form>
      {users.error && <p className="error">{users.error}</p>}
      {!users.data && !users.error && <p className="muted">Loading users…</p>}
      {users.data?.map((u) => <article className="card" key={u.id}>
        <h3>{u.full_name || u.username}</h3>
        <p className="muted">Joined {new Date(u.created_at).toLocaleDateString()} · @{u.username}</p>
        {draft?.id === u.id ? <form className="form" onSubmit={(e) => { e.preventDefault(); act('admin_update_user', { p_user_id: u.id, p_username: draft.username, p_is_admin: draft.is_admin }, users.reload) }}>
          <label>Username<input required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_.]+" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={draft.is_admin} onChange={(e) => setDraft({ ...draft, is_admin: e.target.checked })} /> Admin access</label>
          <div className="row"><button className="primary" disabled={busy}>Save</button><button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button></div>
        </form> : <>
          <p>@{u.username} {u.is_admin && <span className="badge">Admin</span>}</p>
          <div className="row"><button className="secondary small" onClick={() => setDraft({ ...u })}>Edit</button><button className="secondary small danger" disabled={u.id === me.id || busy} onClick={() => { if (window.confirm(`Delete @${u.username} and their account data?`)) act('admin_delete_user', { p_user_id: u.id }, users.reload) }}>Delete</button></div>
        </>}
      </article>)}
    </section> : <section>
      <h2>Study guides</h2>
      {resources.error && <p className="error">{resources.error}</p>}
      <button className="primary" onClick={() => setDraft({ ...blank })}>+ Add study guide</button>
      {draft && <form className="card form" onSubmit={saveResource}>
        <h3>{draft.id ? 'Edit study guide' : 'Add study guide'}</h3>
        <label>Title<input required maxLength={160} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
        <label>Class<input value={draft.course || ''} onChange={(e) => setDraft({ ...draft, course: e.target.value })} placeholder="General / no specific class" /></label>
        <label>URL<input type="url" required value={draft.resource_url || ''} onChange={(e) => setDraft({ ...draft, resource_url: e.target.value })} /></label>
        <div className="row"><button className="primary" disabled={busy}>Save record</button><button type="button" className="secondary" onClick={() => setDraft(null)}>Cancel</button></div>
      </form>}
      {resources.data?.map((r) => <article className="card" key={r.id}>
        <h3>{r.title}</h3><p className="muted">{r.course || 'General'} · {r.uploader || 'Unknown uploader'}</p>
        <a href={r.resource_url} target="_blank" rel="noreferrer">Open guide ↗</a>
        <div className="row"><button className="secondary small" onClick={() => setDraft({ ...r })}>Edit</button><button className="secondary small danger" disabled={busy} onClick={() => { if (window.confirm(`Delete “${r.title}”?`)) act('admin_delete_resource', { p_resource_id: r.id }, resources.reload) }}>Delete</button></div>
      </article>)}
    </section>}
  </>
}
