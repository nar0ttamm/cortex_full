import { redirect } from 'next/navigation';

/** Analytics KPIs and charts live only on the Dashboard — this URL keeps bookmarks working. */
export default function AnalyticsRedirectPage() {
  redirect('/?dashboard=insights');
}
