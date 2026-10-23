import { useEffect, useRef, useState } from 'react'
import { CallController, initialState } from './rtc/CallController.js'

export function useCall() {
  const controller = useRef(null)
  const [state, setState] = useState(initialState)
  const [logs, setLogs] = useState([])

  useEffect(() => {
    const call = new CallController(setState, (entry) =>
      setLogs((previous) => [...previous.slice(-199), entry])
    )
    controller.current = call
    // Dev-only inspection for learning and browser tests. No credentials in the snapshot.
    if (import.meta.env.DEV)
      window.__rtcDemo = { snapshot: () => call.debugSnapshot() }
    return () => {
      controller.current = null
      if (import.meta.env.DEV) delete window.__rtcDemo
      call.dispose()
    }
  }, [])

  async function perform(method) {
    const call = controller.current
    if (!call) return
    try {
      await call[method]()
    } catch (error) {
      call.reportError(error)
    }
  }

  return { state, logs, perform, clearLogs: () => setLogs([]) }
}
