import { useCallback, useEffect, useEffectEvent, useState } from 'react'

export function useLoad(fetchData, key = '') {
  const [state, set] = useState({ data: null, error: '', key: null, revision: -1 })
  const [revision, setRevision] = useState(0)
  const load = useEffectEvent(fetchData)
  const reload = useCallback(() => setRevision(previous => previous + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(data => {
      if (!controller.signal.aborted) set({ data, error: '', key, revision })
    }).catch(error => {
      if (!controller.signal.aborted) set({ data: null, error: error.message, key, revision })
    })
    return () => controller.abort()
  }, [key, revision])
  return { data: state.key === key ? state.data : null, error: state.key === key ? state.error : '',
    loading: state.key !== key || state.revision !== revision, reload }
}

export function useAction() {
  const [state, set] = useState({ busy: false, error: '', message: '' })
  async function run(action, message = '') {
    set({ busy: true, error: '', message: '' })
    try {
      const result = await action()
      set({ busy: false, error: '', message: typeof message === 'function' ? message(result) : message })
      return result
    } catch (error) {
      set({ busy: false, error: error.shortMessage || error.message, message: '' })
      return undefined
    }
  }
  return { ...state, run }
}
