'use client';

import { useEffect, useState } from 'react';
import { getBackendAuthHeaders } from '@/lib/backendAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type Platform = {
  google_calendar_ready: boolean;
  google_redirect_uri: string;
  meta_ready: boolean;
  meta_redirect_uri: string;
  meta_webhook_url: string;
  meta_verify_token_set: boolean;
  backend_url: string;
};

export function NativeConnections({ tenantId }: { tenantId: string }) {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [calendar, setCalendar] = useState<{ connected?: boolean; calendar_id?: string } | null>(null);
  const [calendars, setCalendars] = useState<{ id: string; summary: string; primary: boolean }[]>([]);
  const [meta, setMeta] = useState<{ connected?: boolean; pages?: { integration_key: string; label: string }[]; webhook_url?: string } | null>(null);
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [selectedForms, setSelectedForms] = useState<string[]>([]);
  const [activePage, setActivePage] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const [googleWebhook, setGoogleWebhook] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!API_URL || !tenantId) return;
    const headers = await getBackendAuthHeaders();
    const [platformRes, calendarRes, metaRes] = await Promise.all([
      fetch(`${API_URL}/v1/integrations/platform`, { headers }),
      fetch(`${API_URL}/v1/google-calendar/status`, { headers }),
      fetch(`${API_URL}/v1/meta/status`, { headers }),
    ]);
    if (platformRes.ok) setPlatform(await platformRes.json());
    if (calendarRes.ok) setCalendar(await calendarRes.json());
    if (metaRes.ok) setMeta(await metaRes.json());
  }

  useEffect(() => { void load(); }, [tenantId]);

  async function start(path: string) {
    setError(null);
    const response = await fetch(`${API_URL}${path}`, { headers: await getBackendAuthHeaders() });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.url) {
      setError(data.error || 'This connection is not ready yet');
      return;
    }
    window.location.href = data.url;
  }

  async function saveGoogleKey() {
    setError(null);
    const response = await fetch(`${API_URL}/v1/integrations/${tenantId}/google-ads/key`, {
      method: 'POST',
      headers: { ...(await getBackendAuthHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ google_key: googleKey }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || 'Could not save the Google Ads key');
      return;
    }
    setGoogleWebhook(data.webhook_url);
    setGoogleKey('');
    setMessage('Google Ads webhook key saved. Paste the URL and the same key into the lead form.');
  }

  return (
    <section className="mb-6 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Native connections</h2>
        <p className="text-xs text-slate-500 mt-1">OAuth stays on the server. The browser never receives a refresh token or page token.</p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-teal-700">{message}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <article className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-sm font-semibold">Google Calendar</h3>
          <p className="mt-1 text-xs text-slate-500">{calendar?.connected ? `Connected. Calendar: ${calendar.calendar_id || 'primary'}` : 'One Google account for this business.'}</p>
          {!platform?.google_calendar_ready && (
            <p className="mt-2 text-xs text-amber-700">Waiting for GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI on the API.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void start('/v1/google-calendar/auth')} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white">Connect Google</button>
            {calendar?.connected && (
              <button type="button" onClick={async () => {
                const response = await fetch(`${API_URL}/v1/google-calendar/calendars`, { headers: await getBackendAuthHeaders() });
                const data = await response.json();
                if (response.ok) setCalendars(data.calendars || []);
                else setError(data.error || 'Could not list calendars');
              }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">Choose calendar</button>
            )}
          </div>
          {calendars.length > 0 && (
            <select className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" defaultValue="" onChange={async (event) => {
              if (!event.target.value) return;
              await fetch(`${API_URL}/v1/google-calendar/calendar`, {
                method: 'POST',
                headers: { ...(await getBackendAuthHeaders()), 'Content-Type': 'application/json' },
                body: JSON.stringify({ calendarId: event.target.value }),
              });
              setMessage('Primary business calendar saved.');
              void load();
            }}>
              <option value="">Select a calendar</option>
              {calendars.map((item) => <option key={item.id} value={item.id}>{item.summary}{item.primary ? ' (primary)' : ''}</option>)}
            </select>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
          <h3 className="text-sm font-semibold">Meta Lead Ads</h3>
          <p className="mt-1 text-xs text-slate-500">{meta?.connected ? `${meta.pages?.length || 0} pages selected` : 'Connect a Facebook account, then choose Pages and forms.'}</p>
          {!platform?.meta_ready && <p className="mt-2 text-xs text-amber-700">Waiting for META_APP_ID, META_APP_SECRET, and META_WEBHOOK_VERIFY_TOKEN on the API.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void start('/v1/meta/auth')} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white">Connect Meta</button>
            {meta?.connected && (
              <button type="button" onClick={async () => {
                const response = await fetch(`${API_URL}/v1/meta/pages`, { headers: await getBackendAuthHeaders() });
                const data = await response.json();
                if (response.ok) setPages(data.pages || []);
                else setError(data.error || 'Could not list Pages');
              }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs">Load Pages</button>
            )}
          </div>
          {pages.length > 0 && (
            <div className="mt-3 space-y-2">
              {pages.map((page) => (
                <label key={page.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedPages.includes(page.id)} onChange={(event) => {
                    setSelectedPages(event.target.checked ? [...selectedPages, page.id] : selectedPages.filter((id) => id !== page.id));
                  }} />
                  {page.name}
                </label>
              ))}
              <button type="button" onClick={async () => {
                const response = await fetch(`${API_URL}/v1/meta/pages`, {
                  method: 'POST',
                  headers: { ...(await getBackendAuthHeaders()), 'Content-Type': 'application/json' },
                  body: JSON.stringify({ pageIds: selectedPages }),
                });
                const data = await response.json();
                if (!response.ok) setError(data.error || 'Could not save Pages');
                else { setMessage('Selected Pages are subscribed to lead ads.'); void load(); }
              }} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Save Pages</button>
            </div>
          )}
          {(meta?.pages || []).length > 0 && (
            <div className="mt-3">
              <select className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={activePage} onChange={async (event) => {
                const pageId = event.target.value.replace('meta_page_', '');
                setActivePage(event.target.value);
                if (!pageId) return;
                const response = await fetch(`${API_URL}/v1/meta/forms?pageId=${pageId}`, { headers: await getBackendAuthHeaders() });
                const data = await response.json();
                if (response.ok) {
                  setForms(data.forms || []);
                  setSelectedForms(data.selected_form_ids || []);
                }
              }}>
                <option value="">Choose a saved Page to filter forms</option>
                {(meta?.pages || []).map((page) => <option key={page.integration_key} value={page.integration_key}>{page.label}</option>)}
              </select>
              {forms.map((form) => (
                <label key={form.id} className="mt-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selectedForms.includes(form.id)} onChange={(event) => {
                    setSelectedForms(event.target.checked ? [...selectedForms, form.id] : selectedForms.filter((id) => id !== form.id));
                  }} />
                  {form.name}
                </label>
              ))}
              {forms.length > 0 && (
                <button type="button" className="mt-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white" onClick={async () => {
                  const pageId = activePage.replace('meta_page_', '');
                  await fetch(`${API_URL}/v1/meta/forms`, {
                    method: 'POST',
                    headers: { ...(await getBackendAuthHeaders()), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pageId, formIds: selectedForms }),
                  });
                  setMessage('Form filter saved. An empty selection accepts every form on that Page.');
                }}>Save form filter</button>
              )}
            </div>
          )}
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
        <h3 className="text-sm font-semibold">Google Ads lead forms</h3>
        <p className="mt-1 text-xs text-slate-500">This is Google’s lead-form webhook, not a generic CRM webhook. Create a private key here, then paste the same key into the lead form in Google Ads.</p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <input type="password" value={googleKey} onChange={(event) => setGoogleKey(event.target.value)} placeholder="Webhook key, at least 8 characters" className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <button type="button" onClick={() => void saveGoogleKey()} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white">Save key</button>
        </div>
        {googleWebhook && <p className="mt-2 break-all text-xs font-mono text-teal-700">{googleWebhook}</p>}
      </article>
    </section>
  );
}
