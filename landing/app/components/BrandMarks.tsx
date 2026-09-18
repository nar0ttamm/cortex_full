type MarkProps = { className?: string; title?: string };

export function WhatsAppMark({ className = "h-6 w-6", title = "WhatsApp" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <path
        fill="#25D366"
        d="M12.04 2c-5.46 0-9.91 4.44-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.44 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.8a8.1 8.1 0 0 1 8.1 8.11c0 4.47-3.64 8.11-8.11 8.11-1.42 0-2.8-.37-4.01-1.06l-.29-.17-3.12.82.83-3.04-.19-.31a8.07 8.07 0 0 1-1.23-4.35 8.1 8.1 0 0 1 8.02-8.11zm-2.7 4.32c-.17 0-.5.06-.76.37-.26.31-1 1-.1 2.44.9 1.44 1.04 1.51 2.47 2.4 1.2.75 1.46.67 1.73.62.4-.07 1.29-.53 1.47-1.04.18-.51.18-.95.13-1.04-.06-.09-.22-.15-.46-.26-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.61.78-.75.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.64-1.19-1.42-1.33-1.66-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.4z"
      />
    </svg>
  );
}

export function GmailMark({ className = "h-6 w-6", title = "Gmail" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <path fill="#EA4335" d="M2 6.5v11A2.5 2.5 0 0 0 4.5 20H7V9.2L2 6.5z" />
      <path fill="#34A853" d="M22 6.5v11a2.5 2.5 0 0 1-2.5 2.5H17V9.2l5-2.7z" />
      <path fill="#FBBC05" d="M17 20V9.2l-5 3.4-5-3.4V20h10z" />
      <path fill="#4285F4" d="M2 6.5 12 12.6l10-6.1-2.2-1.2L12 9.8 4.2 5.3 2 6.5z" />
    </svg>
  );
}

export function CalendarMark({ className = "h-6 w-6", title = "Google Calendar" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" stroke="#188038" strokeWidth="1.4" />
      <path fill="#188038" d="M3 4h18v5H3z" />
      <path fill="#188038" d="M8 2.5h1.6v4H8zM14.4 2.5H16v4h-1.6z" />
      <text x="12" y="17.2" textAnchor="middle" fontSize="8" fontWeight="700" fill="#188038" fontFamily="Arial">
        31
      </text>
    </svg>
  );
}

export function SheetsMark({ className = "h-6 w-6", title = "Google Sheets" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <path fill="#0F9D58" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path fill="#87CEAC" d="M14 2v6h6" />
      <path fill="#fff" d="M7.2 11h9.6v1.2H7.2zm0 2.4h9.6v1.2H7.2zm0 2.4h9.6V17H7.2zM10 11v6h1.2v-6z" />
    </svg>
  );
}

export function ExcelMark({ className = "h-6 w-6", title = "Excel" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <rect x="3" y="3" width="18" height="18" rx="3" fill="#185C37" />
      <path fill="#21A366" d="M3 3h9v18H3z" />
      <path fill="#fff" d="M8.2 8.2 10.4 12 8.2 15.8h1.7L11.2 13l1.3 2.8h1.7L12 12l2.2-3.8h-1.7L11.2 11 9.9 8.2z" />
    </svg>
  );
}

export function OutlookMark({ className = "h-6 w-6", title = "Outlook" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <rect x="8" y="5" width="13" height="14" rx="1.5" fill="#0078D4" />
      <path fill="#28A8EA" d="M8 8.2 21 13v6a1.5 1.5 0 0 1-1.5 1.5H9.5A1.5 1.5 0 0 1 8 19z" />
      <rect x="2.5" y="7" width="10" height="10" rx="2" fill="#0A5EA8" />
      <path fill="#fff" d="M7.5 14.7c-1.7 0-2.9-1.2-2.9-2.9S5.8 8.9 7.5 8.9s2.9 1.2 2.9 2.9-1.2 2.9-2.9 2.9zm0-4.5c-.8 0-1.3.7-1.3 1.6s.5 1.6 1.3 1.6 1.3-.7 1.3-1.6-.5-1.6-1.3-1.6z" />
    </svg>
  );
}

export function DriveMark({ className = "h-6 w-6", title = "Google Drive" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <path fill="#FFBA00" d="m8.3 4 5.4 0 5.4 9.4H13.7z" />
      <path fill="#0F9D58" d="M2.5 18.4 8.3 8.4 13.7 13.4 8 18.4z" />
      <path fill="#2684FC" d="m8 18.4 5.7-5 7.4 0L15.5 18.4z" />
    </svg>
  );
}

export function SlackMark({ className = "h-6 w-6", title = "Slack" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <path fill="#E01E5A" d="M8.2 14.4a1.6 1.6 0 1 1-1.6 1.6v-1.6h1.6zm.8 0h4.2a1.6 1.6 0 1 0 0-3.2H9v3.2z" />
      <path fill="#36C5F0" d="M9.6 8.2A1.6 1.6 0 1 1 8 6.6v1.6h1.6zm0 .8v4.2a1.6 1.6 0 1 0 3.2 0V9h-3.2z" />
      <path fill="#2EB67D" d="M15.8 9.6a1.6 1.6 0 1 1 1.6-1.6v1.6h-1.6zm-.8 0H10.8a1.6 1.6 0 1 0 0 3.2H15v-3.2z" />
      <path fill="#ECB22E" d="M14.4 15.8a1.6 1.6 0 1 1 1.6 1.6h-1.6v-1.6zm0-.8V10.8a1.6 1.6 0 1 0-3.2 0V15h3.2z" />
    </svg>
  );
}

export function ZapierMark({ className = "h-6 w-6", title = "Zapier" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <circle cx="12" cy="12" r="10" fill="#FF4A00" />
      <path fill="#fff" d="M7 10.2h5.2L8.4 16h2.3l3.8-5.8H19l-1.6-2.4H7z" />
    </svg>
  );
}

export function TeamsMark({ className = "h-6 w-6", title = "Microsoft Teams" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <rect x="3" y="6" width="11" height="12" rx="2" fill="#5059C9" />
      <circle cx="17.5" cy="8.2" r="2.2" fill="#7B83EB" />
      <rect x="14.5" y="11" width="6.2" height="7" rx="2" fill="#7B83EB" />
      <path fill="#fff" d="M8.5 14.8V9.4H7.1v1.3H6v1.2h1.1v2.9h1.4z" />
    </svg>
  );
}

export function CsvMark({ className = "h-6 w-6", title = "CSV" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <path fill="#C4841D" d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path fill="#F8ECD3" d="M14 2v6h6" />
      <text x="12" y="17" textAnchor="middle" fontSize="6.2" fontWeight="800" fill="#fff" fontFamily="Arial">
        CSV
      </text>
    </svg>
  );
}

export function TelnyxMark({ className = "h-6 w-6", title = "Telnyx" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <rect width="24" height="24" rx="6" fill="#1A1A2E" />
      <path fill="#00E3C2" d="M6 8h12v2.2H13.4V16h-2.8V10.2H6z" />
    </svg>
  );
}

export function PhoneMark({ className = "h-6 w-6", title = "Voice" }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label={title} role="img">
      <circle cx="12" cy="12" r="10" fill="#E24B1B" />
      <path
        fill="#fff"
        d="M16.6 14.7c-.3-.2-.8-.4-1.2-.2l-1 .5c-.2.1-.4 0-.6-.1-1-.6-1.9-1.5-2.5-2.5-.1-.2-.1-.4.1-.6l.5-1c.2-.4 0-.9-.2-1.2l-.8-1.3c-.3-.4-.8-.5-1.2-.3l-1.1.5c-.5.2-.8.8-.7 1.4.3 2.3 1.4 4.4 3.1 6.1 1.7 1.7 3.8 2.8 6.1 3.1.6.1 1.2-.2 1.4-.7l.5-1.1c.2-.4 0-.9-.3-1.2z"
      />
    </svg>
  );
}
