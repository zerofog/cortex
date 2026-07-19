import { CortexDevScripts } from 'cortex-editor/next'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CortexDevScripts />
        {children}
      </body>
    </html>
  )
}
