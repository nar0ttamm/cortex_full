'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';

type UserProfile = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: 'admin' | 'manager' | 'executive';
  position?: string;
  is_active: boolean;
  team_name?: string;
  team_id?: string;
  created_at: string;
};

type Team = {
  id: string;
  name: string;
  manager_name?: string;
  member_count: number;
  description?: string;
  created_at: string;
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  manager: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  executive: 'bg-slate-700/50 text-slate-400 border-slate-600',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  executive: 'Executive',
};

function CreateUserModal({
  open, onClose, onCreated, tenantId, teams,
}: {
  open: boolean; onClose: () => void; onCreated: () => void;
  tenantId: string; teams: Team[];
}) {
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', phone: '',
    role: 'executive', position: '', teamId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API = process.env.NEXT_PUBLIC_API_URL || '';

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName || !form.email || !form.password) {
      setError('Name, email and password are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/v1/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-5">Add Team Member</h3>
        {error && <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-3">
          {[
            { label: 'Full Name *', field: 'fullName', type: 'text', placeholder: 'Rahul Sharma' },
            { label: 'Email *', field: 'email', type: 'email', placeholder: 'rahul@company.com' },
            { label: 'Password *', field: 'password', type: 'password', placeholder: '••••••••' },
            { label: 'Phone', field: 'phone', type: 'tel', placeholder: '+91 98765 43210' },
            { label: 'Position / Role', field: 'position', type: 'text', placeholder: 'Sales Executive' },
          ].map(({ label, field, type, placeholder }) => (
            <div key={field}>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
              <input
                type={type}
                value={(form as any)[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500/50"
              />
            </div>
          ))}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Role *</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-teal-500/50">
              <option value="manager">Manager</option>
              <option value="executive">Executive</option>
            </select>
          </div>
          {teams.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Assign to Team</label>
              <select value={form.teamId} onChange={e => setForm(f => ({ ...f, teamId: e.target.value }))} className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-teal-500/50">
                <option value="">No team yet</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-slate-700 text-slate-400 rounded-xl text-sm hover:border-slate-600 transition">Cancel</button>
            <button type="submit" disabled={loading} className="flex-[2] py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
              {loading ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [activeTab, setActiveTab] = useState<'members' | 'teams'>('members');

  const API = process.env.NEXT_PUBLIC_API_URL || '';

  const fetchData = useCallback(async () => {
    try {
      const meRes = await fetch('/api/me');
      if (!meRes.ok) return;
      const me = await meRes.json();
      const tid = me.tenantId;
      setTenantId(tid);

      const [usersRes, teamsRes] = await Promise.all([
        fetch(`${API}/v1/users?tenantId=${tid}`),
        fetch(`${API}/v1/teams?tenantId=${tid}`),
      ]);

      if (usersRes.ok) setUsers((await usersRes.json()).users || []);
      if (teamsRes.ok) setTeams((await teamsRes.json()).teams || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [API]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const actions = (
    <button
      onClick={() => setShowCreateUser(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 rounded-lg text-xs font-semibold transition-colors border border-teal-500/20"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      Add Member
    </button>
  );

  return (
    <AppShell title="Team" actions={actions}>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit mb-6">
          {(['members', 'teams'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                activeTab === tab
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {tab === 'members' ? `Members (${users.length})` : `Teams (${teams.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === 'members' ? (
          <div className="space-y-2">
            {users.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
                </svg>
                <p className="text-sm">No team members yet.</p>
                <button onClick={() => setShowCreateUser(true)} className="mt-3 text-teal-400 text-sm hover:underline">Add your first member →</button>
              </div>
            ) : (
              users.map(user => (
                <div key={user.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-800 hover:border-teal-500/30 transition-all">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-400/20 to-cyan-500/20 flex items-center justify-center shrink-0">
                    <span className="text-teal-400 font-bold text-sm">{user.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{user.full_name}</p>
                      {!user.is_active && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded border border-red-500/20">Inactive</span>}
                    </div>
                    <p className="text-xs text-slate-400">{user.email}</p>
                    {user.position && <p className="text-xs text-slate-500 mt-0.5">{user.position}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {user.team_name && (
                      <span className="hidden sm:block text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg">
                        {user.team_name}
                      </span>
                    )}
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border ${ROLE_COLORS[user.role] || ROLE_COLORS.executive}`}>
                      {ROLE_LABELS[user.role] || user.role}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {teams.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <p className="text-sm">No teams created yet. Create a project to auto-create a team.</p>
              </div>
            ) : (
              teams.map(team => (
                <div key={team.id} className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-800 hover:border-teal-500/30 transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{team.name}</p>
                      {team.manager_name && <p className="text-xs text-slate-400 mt-0.5">Manager: {team.manager_name}</p>}
                      {team.description && <p className="text-xs text-slate-500 mt-1">{team.description}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-teal-400">{team.member_count}</p>
                      <p className="text-[10px] text-slate-400">members</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <CreateUserModal
        open={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        onCreated={() => { fetchData(); }}
        tenantId={tenantId}
        teams={teams}
      />
    </AppShell>
  );
}
