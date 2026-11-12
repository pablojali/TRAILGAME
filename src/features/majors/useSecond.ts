import { useEffect, useState } from 'react'

/** The time now, updated every second (countdowns). */
export function useSecond(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
