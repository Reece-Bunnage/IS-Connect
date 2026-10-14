import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import { getToken } from './auth.js'

// Call one of the database functions in supabase/functions.sql as the
// logged-in user. Throws an Error with the database's message on failure.
export async function rpc(fn, args = {}) {
  const { data, error } = await supabase.rpc(fn, { p_token: getToken(), ...args })
  if (error) throw new Error(error.message)
  return data
}

// Run a Supabase read and keep its result. reload() re-runs it without
// blanking the current data, so lists don't flicker after an action.
export function useQuery(run, deps) {
  const [state, setState] = useState({ data: null, error: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    const { data, error } = await run()
    setState({ data: error ? null : data, error: error?.message ?? null })
  }, deps)
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

// Students hidden from you because either of you blocked the other.
export function useHiddenIds(meId) {
  const { data, reload } = useQuery(
    () =>
      supabase
        .from('user_blocks')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${meId},blocked_id.eq.${meId}`),
    [meId],
  )
  const hidden = new Set((data ?? []).map((b) => (b.blocker_id === meId ? b.blocked_id : b.blocker_id)))
  return { hidden, reload }
}
