export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[540px]">
      <div className="absolute -left-4 top-8 hidden items-center gap-2 rounded-2xl border border-[var(--border)] bg-white px-3 py-2 shadow-[var(--shadow-md)] sm:flex">
        <img
          src="https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=80&h=80&q=80"
          alt=""
          className="h-8 w-8 rounded-full object-cover"
        />
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--teal)]">Live call</p>
          <p className="text-sm font-semibold">Vikram Iyer · Pune</p>
        </div>
      </div>
      <div className="absolute -right-2 bottom-16 hidden rounded-2xl border border-[var(--border)] bg-white px-3 py-2 shadow-[var(--shadow-md)] sm:block">
        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--accent)]">Booked</p>
        <p className="text-sm font-semibold">Site visit · 4:30 pm</p>
      </div>

      <div className="surface-card overflow-hidden p-4 md:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--fg-muted)]">Today&apos;s floor</p>
            <p className="mt-1 text-lg font-extrabold">AI calling desk</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--teal-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--teal)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
            12 live
          </span>
        </div>

        <div className="mt-4 rounded-2xl bg-[var(--bg)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=96&h=96&q=80"
                alt="Ananya Krishnan"
                className="h-11 w-11 rounded-full object-cover"
              />
              <div>
                <p className="font-bold">Ananya Krishnan</p>
                <p className="text-xs text-[var(--fg-muted)]">Inbound · Education</p>
              </div>
            </div>
            <p className="text-sm font-bold text-[var(--teal)]">01:24</p>
          </div>

          <div className="mt-4 flex h-12 items-end justify-center gap-1">
            {WAVE.map((h, i) => (
              <span
                key={i}
                className="animate-wave w-1.5 rounded-full bg-[var(--accent)]"
                style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["Intent", "High"],
              ["Budget", "Yes"],
              ["Next", "Visit"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white px-2 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">{k}</p>
                <p className="text-sm font-bold">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[var(--border)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Pipeline</p>
            <div className="mt-3 space-y-2">
              {[
                ["New", 86, "var(--accent)"],
                ["Qualified", 41, "var(--gold)"],
                ["Booked", 18, "var(--teal)"],
              ].map(([label, width, color]) => (
                <div key={String(label)}>
                  <div className="mb-1 flex justify-between text-[11px] font-semibold">
                    <span>{label}</span>
                    <span className="text-[var(--fg-muted)]">{width}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-warm)]">
                    <div className="h-full rounded-full" style={{ width: `${width}%`, background: String(color) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--border)] p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--fg-muted)]">Timeline</p>
            <ul className="mt-3 space-y-2.5 text-xs">
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--accent)]" />
                <span>AI call answered</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--gold)]" />
                <span>WhatsApp recap sent</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-[var(--teal)]" />
                <span>Calendar locked</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const WAVE = [36, 58, 74, 92, 64, 80, 48, 88, 70, 54, 76, 42, 90, 62, 50, 72];
