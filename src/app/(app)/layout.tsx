import type { Metadata } from 'next'
import './globals.css'
import { getPayloadWithUser } from '@/lib/payload-auth'
import { Navbar } from '@/components/layout/Navbar'
import { ThemeProvider } from '@/contexts/ThemeProvider'
import { QueryProvider } from '@/contexts/QueryProvider'
import { FooterProvider } from '@/contexts/FooterProvider'
import { IntroProvider } from '@/contexts/IntroProvider'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'PLU Analyzer — Urban-Planning Feasibility Platform',
  description:
    'French PLU/PLUi feasibility intelligence powered by Payload CMS, PostgreSQL, IGN API Carto, Métropole Aix-Marseille-Provence, and Ollama.',
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await getPayloadWithUser()

  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <FooterProvider>
              <Navbar user={user} />
              <IntroProvider>{children}</IntroProvider>
            </FooterProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
