import {
  CalendarMark,
  CsvMark,
  DriveMark,
  ExcelMark,
  GmailMark,
  OutlookMark,
  PhoneMark,
  SheetsMark,
  SlackMark,
  TeamsMark,
  TelnyxMark,
  WhatsAppMark,
  ZapierMark,
} from "./BrandMarks";
import { IconChart, IconLayers, IconUsers } from "./icons";

const ITEMS = [
  { label: "WhatsApp", Icon: WhatsAppMark },
  { label: "Gmail", Icon: GmailMark },
  { label: "Google Calendar", Icon: CalendarMark },
  { label: "Google Sheets", Icon: SheetsMark },
  { label: "Excel", Icon: ExcelMark },
  { label: "Outlook", Icon: OutlookMark },
  { label: "Google Drive", Icon: DriveMark },
  { label: "Voice", Icon: PhoneMark },
  { label: "CSV import", Icon: CsvMark },
  { label: "Slack", Icon: SlackMark },
  { label: "Teams", Icon: TeamsMark },
  { label: "Zapier", Icon: ZapierMark },
  { label: "Telnyx", Icon: TelnyxMark },
  { label: "Pipeline", Icon: IconChart },
  { label: "CRM desk", Icon: IconLayers },
  { label: "Team inbox", Icon: IconUsers },
];

export function LogoMarquee() {
  const loop = [...ITEMS, ...ITEMS];
  return (
    <section className="border-y border-[var(--border)] bg-[var(--bg-elevated)] py-6">
      <p className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
        Works with the stack your floor already uses
      </p>
      <div className="overflow-hidden">
        <div className="flex w-max animate-marquee items-center gap-3 px-4 hover:[animation-play-state:paused]">
          {loop.map((item, i) => (
            <div
              key={`${item.label}-${i}`}
              className="flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--border)] bg-white px-4 py-2 shadow-[var(--shadow-sm)]"
            >
              <item.Icon className="h-5 w-5" />
              <span className="text-sm font-bold text-[var(--fg)]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function IntegrationsGrid() {
  const brands = ITEMS.slice(0, 12);
  return (
    <div className="rounded-[1.8rem] border border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Integrations</p>
          <h2 className="mt-3 font-serif text-3xl md:text-4xl">
            Plug in. Don&apos;t rebuild the stack.
          </h2>
        </div>
        <p className="max-w-sm text-sm text-[var(--fg-muted)]">
          Import lists, send recaps, and drop holds on the calendar — through tools sales teams already live in.
        </p>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {brands.map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-3 py-5 text-center"
          >
            <item.Icon className="h-8 w-8" />
            <span className="text-xs font-bold">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
