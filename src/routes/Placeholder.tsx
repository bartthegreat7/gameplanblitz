export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <section className="border-line bg-card rounded-3xl border p-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-ink-2 mt-2">{note}</p>
    </section>
  )
}
