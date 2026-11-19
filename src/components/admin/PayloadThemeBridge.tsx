'use client'

import { useTheme } from 'next-themes'
import React from 'react'

export default function PayloadThemeBridge() {
  const { resolvedTheme, setTheme } = useTheme()
  const isSyncingRef = React.useRef(false)

  // On mount / resolvedTheme change from frontend, align Payload's data-theme if needed
  React.useEffect(() => {
    if (!resolvedTheme) return
    const html = document.documentElement
    const currentPayloadTheme = html.getAttribute('data-theme')
    if (currentPayloadTheme !== resolvedTheme) {
      isSyncingRef.current = true
      html.setAttribute('data-theme', resolvedTheme)
      window.localStorage.setItem('payload-theme', resolvedTheme)
      document.cookie = `payload-theme=${resolvedTheme}; path=/; max-age=31536000; SameSite=Lax`
      queueMicrotask(() => {
        isSyncingRef.current = false
      })
    }
  }, [resolvedTheme])

  // When Payload's theme switcher mutates data-theme, sync back to next-themes
  React.useEffect(() => {
    const html = document.documentElement

    const observer = new MutationObserver(() => {
      if (isSyncingRef.current) return
      const theme = html.getAttribute('data-theme')
      if (theme === 'light' || theme === 'dark') {
        setTheme(theme)
      }
    })

    observer.observe(html, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => observer.disconnect()
  }, [setTheme])

  return null
}
