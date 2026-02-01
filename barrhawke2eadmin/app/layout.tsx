import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BarrHawk Admin',
  description: 'Internal administration panel',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-gray-100 antialiased">
        {children}
      </body>
    </html>
  )
}
