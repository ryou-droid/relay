export default function RouteSkeleton({ form = false }: { form?: boolean }) {
  return <section className="route-skeleton" role="status" aria-busy="true" aria-label="画面を読み込み中">
    <p className="muted">読み込み中…</p>
    <div aria-hidden="true">
      <div className="skeleton skeleton-title" />
      {form ? <div className="panel skeleton-form">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton skeleton-field" />)}</div>
        : <div className="post-grid">{[0, 1, 2].map(i => <div key={i} className="post-card"><div className="skeleton skeleton-label" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>)}</div>}
    </div>
  </section>;
}
