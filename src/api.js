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

// Run a read and keep its result. reload() re-runs it without blanking the
// current data, so lists don't flicker after an action. `run` returns a
// Supabase response ({ data, error }) or a promise of the data itself.
export function useQuery(run, deps) {
  const [state, setState] = useState({ data: null, error: null })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    try {
      const result = await run()
      if (result && typeof result === 'object' && 'error' in result && 'data' in result) {
        setState({ data: result.error ? null : result.data, error: result.error?.message ?? null })
      } else {
        setState({ data: result, error: null })
      }
    } catch (err) {
      setState((s) => ({ data: s.data, error: err.message }))
    }
  }, deps)
  useEffect(() => {
    reload()
  }, [reload])
  return { ...state, reload }
}

// A database function's result, as a query.
export function useRpc(fn, args, deps) {
  return useQuery(() => rpc(fn, args), deps)
}

// Students hidden from you because either of you blocked the other.
export function useHiddenIds(meId) {
  const { data, reload } = useQuery(() => (meId ? rpc('my_hidden_ids') : Promise.resolve([])), [meId])
  return { hidden: new Set(data ?? []), reload }
}

// Re-run `fn` every `ms` while the screen is open.
export function usePolling(fn, ms) {
  useEffect(() => {
    const timer = setInterval(fn, ms)
    return () => clearInterval(timer)
  }, [fn, ms])
}
