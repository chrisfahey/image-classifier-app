import './globals.css'

export const metadata = {
  title: 'Image Classifier App',
  description: 'Upload and classify images using OpenAI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
