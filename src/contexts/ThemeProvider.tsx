'use client'

import type { ComponentProps } from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import PayloadThemeBridge from '@/components/admin/PayloadThemeBridge'

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      <PayloadThemeBridge />
      {children}
    </NextThemesProvider>
  )
}
