'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/AppShell';

export default function DataManagementPage() {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    inquiry: '',
    source: 'Manual Entry',
  });

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Import failed');
      }

      alert('Import successful!');
      window.location.reload();
    } catch (error) {
      alert('Import failed. Please check the file format.');
      console.error('Import error:', error);
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/crm-data?action=leads');
      const data = await response.json();
      const leads = data.leads || [];

      // Convert to CSV
      const headers = ['Name', 'Phone', 'Email', 'Inquiry', 'Source', 'Status'];
      const csvRows = [
        headers.join(','),
        ...leads.map((lead: any) =>
          [
            `"${lead.name || ''}"`,
            `"${lead.phone || ''}"`,
            `"${lead.email || ''}"`,
            `"${lead.inquiry || ''}"`,
            `"${lead.source || ''}"`,
            `"${lead.status || ''}"`,
          ].join(',')
        ),
      ];

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Export failed');
      console.error('Export error:', error);
    } finally {
      setExporting(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/crm-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'append',
          lead: formData,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add lead');
      }

      alert('Lead added successfully!');
      setFormData({
        name: '',
        phone: '',
        email: '',
        inquiry: '',
        source: 'Manual Entry',
      });
      setShowManualForm(false);
    } catch (error) {
      alert('Failed to add lead');
      console.error('Submit error:', error);
    }
  };

  const inputCls = "w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all text-sm text-slate-700 placeholder-slate-400 outline-none bg-white";

  return (
    <AppShell title="Data Management">
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {/* Import */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 bg-sky-50 border border-sky-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-slate-800 mb-1">Import Data</h2>
            <p className="text-xs text-slate-500 mb-4">Upload CSV or Excel to bulk import leads</p>
            <label className="block cursor-pointer">
              <span className={`inline-flex items-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-xl text-xs font-semibold hover:bg-sky-600 transition-colors ${importing ? 'opacity-50' : ''}`}>
                {importing ? 'Importing...' : 'Choose File'}
              </span>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileImport} disabled={importing} className="hidden" />
            </label>
          </div>

          {/* Export */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-slate-800 mb-1">Export Data</h2>
            <p className="text-xs text-slate-500 mb-4">Download all leads as a CSV file</p>
            <button onClick={handleExport} disabled={exporting} className="px-4 py-2 bg-teal-500 text-white rounded-xl text-xs font-semibold hover:bg-teal-600 disabled:opacity-50 transition-colors">
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>

          {/* Manual Entry */}
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 bg-violet-50 border border-violet-100 rounded-xl flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-sm font-bold text-slate-800 mb-1">Manual Entry</h2>
            <p className="text-xs text-slate-500 mb-4">Add a single lead manually</p>
            <button onClick={() => setShowManualForm(!showManualForm)} className="px-4 py-2 bg-violet-500 text-white rounded-xl text-xs font-semibold hover:bg-violet-600 transition-colors">
              {showManualForm ? 'Cancel' : 'Add Lead'}
            </button>
          </div>
        </div>

        {/* Manual form */}
        {showManualForm && (
          <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5 sm:p-6">
            <h2 className="text-sm font-bold text-slate-800 mb-5 flex items-center gap-2">
              <span className="w-1 h-4 bg-teal-500 rounded-full" />
              Add New Lead
            </h2>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Name *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputCls} placeholder="Full name" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Phone *</label>
                  <input type="tel" required value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputCls} placeholder="+91 XXXXX XXXXX" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
                  <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputCls} placeholder="email@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Inquiry *</label>
                <textarea required value={formData.inquiry} onChange={(e) => setFormData({ ...formData, inquiry: e.target.value })} rows={3} className={inputCls} placeholder="What is the lead interested in?" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Source</label>
                <input type="text" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })} className={inputCls} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" className="px-5 py-2.5 bg-teal-500 text-white rounded-xl text-sm font-semibold hover:bg-teal-600 shadow-sm transition-colors">Add Lead</button>
                <button type="button" onClick={() => setShowManualForm(false)} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">Cancel</button>
              </div>
            </form>
          </div>
        )}
      </div>
    </AppShell>
  );
}

