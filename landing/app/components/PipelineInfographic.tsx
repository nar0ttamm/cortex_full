const STAGES = [
  { label: "Leads imported", value: 1000, width: 100, note: "CSV / Sheets / API" },
  { label: "Reached by AI", value: 820, width: 82, note: "Under 2 minutes" },
  { label: "Qualified intent", value: 340, width: 41, note: "Budget + timeline" },
  { label: "Appointments booked", value: 180, width: 18, note: "Calendar + reminders" },
];

export function PipelineInfographic() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="eyebrow">Pipeline physics</p>
        <h2 className="mt-3 font-serif text-4xl leading-tight md:text-5xl">
          From first ring
          <span className="italic text-[var(--accent)]"> to booked visit.</span>
        </h2>
        <p className="mt-4 max-w-xl text-[var(--fg-muted)]">
          Most teams lose the deal in the first hour. CortexFlow compresses outreach,
          qualification, and scheduling into one visible funnel — so you can see
          exactly where revenue is leaking.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ["<2 min", "First call"],
            ["24/7", "Coverage"],
            ["4", "Channels"],
            ["0", "Missed follow-ups"],
          ].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-white/80 px-3 py-4 text-center">
              <p className="font-serif text-2xl text-[var(--accent)]">{v}</p>
              <p className="mt-1 text-xs font-semibold text-[var(--fg-muted)]">{l}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[1.8rem] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-md)]">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm font-bold">Typical 1,000-lead week</p>
          <span className="rounded-full bg-[var(--teal-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--teal)]">
            Illustrative
          </span>
        </div>
        <div className="space-y-5">
          {STAGES.map((stage) => (
            <div key={stage.label}>
              <div className="mb-2 flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-bold">{stage.label}</p>
                  <p className="text-xs text-[var(--fg-muted)]">{stage.note}</p>
                </div>
                <p className="font-serif text-2xl">{stage.value.toLocaleString()}</p>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-[var(--bg)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),#f08a62)]"
                  style={{ width: `${stage.width}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
