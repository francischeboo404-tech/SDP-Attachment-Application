import React, { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import { useLiveData } from '../hooks/useLiveData';

// Import the actual page components — we render them directly inside tabs
import Departments from './Departments';
import RequisitionQueue from './RequisitionQueue';

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
    return (
        <div className="flex items-end gap-0 border-b border-slate-200 mb-6 overflow-x-auto" role="tablist">
            {tabs.map((tab) => {
                const isActive = active === tab.key;
                return (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tab.key}`}
                        id={`tab-${tab.key}`}
                        onClick={() => onChange(tab.key)}
                        className={`relative flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-inset ${
                            isActive
                                ? 'text-primary-800 font-extrabold'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        {tab.icon && <span className="shrink-0">{tab.icon}</span>}
                        <span>{tab.label}</span>
                        {/* Active underline */}
                        {isActive && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-t-full" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ── Staffing Overview Tab ─────────────────────────────────────────────────────
function DeptStaffingTab() {
    // The figures are computed on the server and served from one endpoint.
    // They used to be assembled here from three separate list endpoints, which
    // counted a Deployment status that does not exist ("ACTIVE" -- the real
    // value is "DEPLOYED", so the active column was always zero) and divided by
    // the hand-edited typical_intake_capacity instead of open advertised
    // capacity, so departments with no vacancies still reported headroom. See
    // backend/jobs/staffing.py for the full account.
    const fetchStaffing = useCallback(async () => {
        const res = await api.get('jobs/staffing/');
        return res.data;
    }, []);

    const { data, error, loading, refreshing, lastUpdatedAt, refresh } = useLiveData(fetchStaffing);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
            </div>
        );
    }

    // Without this, a failed first load renders an empty table that reads as
    // "no departments have staff" rather than "the request failed".
    if (error && !data) {
        return (
            <div className="space-y-4">
                <div className="p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-900 border border-rose-200">
                    {error.response?.data?.detail || 'Unable to load staffing figures.'}
                </div>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    {refreshing ? 'Retrying…' : 'Try again'}
                </button>
            </div>
        );
    }

    const summary = data?.summary || {};
    const departments = data?.departments || [];

    return (
        <div className="space-y-6">
            {/* Roll-up tiles. Summed from the same rows as the table below, so
                the tiles and the table cannot disagree. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Open Vacancies', value: summary.open_vacancies ?? '—' },
                    { label: 'Advertised Slots', value: summary.total_capacity ?? '—' },
                    { label: 'Slots Filled', value: summary.total_filled ?? '—' },
                    { label: 'Attachees In Progress', value: summary.active_deployments ?? '—' },
                ].map((tile) => (
                    <div key={tile.label} className="bg-white border border-slate-200 rounded-2xl shadow-sm px-5 py-4">
                        <div className="text-2xs font-black uppercase tracking-wider text-slate-500">{tile.label}</div>
                        <div className="text-2xl font-black text-slate-900 mt-1">{tile.value}</div>
                    </div>
                ))}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-4">
                    <div>
                        <h3 className="text-sm font-extrabold text-slate-900">Department Staffing Overview</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Live summary of requisitions and deployments per department
                        </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                        {/* Says how fresh the numbers are, so a reader can tell
                            current data from data held since last poll. */}
                        <span className="text-2xs text-slate-500" aria-live="polite">
                            {refreshing
                                ? 'Refreshing…'
                                : lastUpdatedAt
                                    ? `Updated ${lastUpdatedAt.toLocaleTimeString()}`
                                    : ''}
                        </span>
                        <button
                            type="button"
                            onClick={refresh}
                            className="px-3 py-1.5 text-2xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        >
                            Refresh
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="text-left px-6 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Department</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Open Vacancies</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Capacity</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Filled</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Pending Reqs</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Approved Reqs</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">In Progress</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Completed</th>
                                <th className="text-center px-4 py-3 text-2xs font-black uppercase tracking-wider text-slate-500">Fill Rate</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {departments.map((dept) => {
                                // fill_rate is null, not 0, when a department has
                                // no open vacancy. Rendering that as "0%" would
                                // imply unfilled slots that were never posted.
                                const hasCapacity = Number.isFinite(dept.fill_rate);

                                return (
                                    <tr key={dept.department_id} className="hover:bg-slate-50/60 transition-colors">
                                        <td className="px-6 py-3.5">
                                            <div className="font-bold text-slate-900 text-xs">{dept.department_name}</div>
                                            {dept.director_name && (
                                                <div className="text-2xs text-slate-500 mt-0.5">Dir: {dept.director_name}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="text-xs font-bold text-slate-700">{dept.open_vacancies || '—'}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="text-xs font-bold text-slate-700">{dept.capacity || '—'}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="text-xs font-bold text-slate-700">{dept.filled || '—'}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-2xs font-bold ${dept.pending_requisitions > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'text-slate-400'}`}>
                                                {dept.pending_requisitions || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-2xs font-bold ${dept.approved_requisitions > 0 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'text-slate-400'}`}>
                                                {dept.approved_requisitions || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="text-xs font-bold text-slate-700">{dept.active_deployments}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            <span className="text-xs font-bold text-slate-700">{dept.completed_deployments}</span>
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {hasCapacity ? (
                                                <div className="flex items-center gap-2 justify-center">
                                                    <div className="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                                        <div
                                                            className={`h-1.5 rounded-full ${dept.fill_rate >= 90 ? 'bg-rose-500' : dept.fill_rate >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                                            style={{ width: `${dept.fill_rate}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-2xs font-bold text-slate-600">{dept.fill_rate}%</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-2xs">No open vacancies</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {departments.length === 0 && (
                        <div className="px-6 py-12 text-center text-slate-500 text-sm">No departments configured yet.</div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── DepartmentsHub ────────────────────────────────────────────────────────────
export default function DepartmentsHub() {
    const userRole = useAuthStore(state => state.user?.role || 'APPLICANT');
    const [searchParams, setSearchParams] = useSearchParams();

    const isAdmin = userRole === 'ADMIN';
    const isHR = userRole === 'HR';

    // Build tab list based on role
    const allTabs = [
        isAdmin && {
            key: 'governance',
            label: 'Dept Management & Governance',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            ),
        },
        isAdmin && {
            key: 'staffing',
            label: 'Dept Staffing & Requisitions',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            ),
        },
        (isAdmin || isHR) && {
            key: 'requisitions',
            label: 'HR Requisition Review',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
            ),
        },
    ].filter(Boolean);

    // Determine default tab
    const defaultTab = isAdmin ? 'governance' : 'requisitions';
    const rawTab = searchParams.get('tab') || defaultTab;
    // Ensure the tab is valid for this role
    const activeTab = allTabs.find(t => t.key === rawTab) ? rawTab : defaultTab;

    const handleTabChange = (key) => {
        setSearchParams({ tab: key }, { replace: true });
    };

    if (!isAdmin && !isHR) {
        return (
            <div className="text-center py-16 text-slate-500">
                <p className="font-semibold">You do not have access to this section.</p>
            </div>
        );
    }

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto pb-16">
            {/* Page header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-primary-600 text-[var(--color-primary-on)] rounded-xl">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900">Departments</h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {isAdmin
                                ? 'Manage department governance, staffing levels, and HR requisition approvals'
                                : 'Review and action department requisition submissions'}
                        </p>
                    </div>
                </div>
            </div>

            <TabBar tabs={allTabs} active={activeTab} onChange={handleTabChange} />

            {/* Tab panels */}
            <div
                role="tabpanel"
                id={`tabpanel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
            >
                {activeTab === 'governance' && isAdmin && <Departments />}
                {activeTab === 'staffing' && isAdmin && <DeptStaffingTab />}
                {activeTab === 'requisitions' && <RequisitionQueue />}
            </div>
        </div>
    );
}
