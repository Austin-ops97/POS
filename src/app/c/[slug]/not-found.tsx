export default function CardUnavailable() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-white">
      <div className="max-w-sm rounded-[1.75rem] border border-white/20 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Digital card</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">This card is not available</h1>
        <p className="mt-2 text-sm leading-6 text-white/75">
          The link may be unpublished. Ask the sender for an updated card.
        </p>
      </div>
    </main>
  );
}
