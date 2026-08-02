/**
 * Shared layout for routes whose feature is built in a later issue.
 * Pure Tailwind utility classes — replaces these pages in Issues 24-26.
 */
export default function Placeholder({ title, description, note }) {
  return (
    <section className="w-full max-w-[600px] rounded-2xl border border-stone-200 bg-white p-5 text-center shadow-card sm:p-8">
      <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-indigo-600 uppercase">
        Coming soon
      </p>
      <h1 className="mb-3 text-2xl leading-tight font-semibold tracking-tight sm:text-[28px]">
        {title}
      </h1>
      <p className="mx-auto max-w-[46ch] text-[15px] text-stone-600">{description}</p>
      {note && <p className="mt-4 text-[13px] font-medium text-stone-400">{note}</p>}
    </section>
  )
}
