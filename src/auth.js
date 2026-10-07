import { supabase } from './supabaseClient.js'

// Username + password login backed by the sign_up / log_in / get_session
// functions in supabase/schema.sql. The session token is kept in
// localStorage so a refresh stays logged in.

const TOKEN_KEY = 'is-connect-token'

function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable; you'll just need to log in again after a refresh.
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

export async function signUp(username, password) {
  const session = await call('sign_up', { p_username: username, p_password: password })
  saveToken(session.token)
  return session
}

export async function logIn(username, password) {
  const session = await call('log_in', { p_username: username, p_password: password })
  saveToken(session.token)
  return session
}

// The saved login, checked against the database (null if none or expired).
export async function restoreSession() {
  const token = getToken()
  if (!token) return null
  const session = await call('get_session', { p_token: token })
  if (!session) saveToken(null)
  return session
}

export async function logOut() {
  const token = getToken()
  saveToken(null)
  if (token) await call('log_out', { p_token: token }).catch(() => {})
}
