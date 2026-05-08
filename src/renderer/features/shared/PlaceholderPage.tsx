import type { ReactElement } from 'react'

interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps): ReactElement {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Workspace</span>
          <h1>{title}</h1>
        </div>
      </header>
      <section className="empty-state">
        <h2>{title} flow</h2>
        <p>This route is ready for the next development phase.</p>
      </section>
    </div>
  )
}
