import React, { useState, useCallback } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import { printTable } from '../utils/downloadUtils';
import { useLiveData } from '../hooks/useLiveData';

/**
 * DepartmentReports
 * Director-facing "Reports & Analytics".
 *
 * This view never asks the API for a department: it calls exactly the same
 * report-generation endpoints the institutional Reports page uses
 * (jobs/reports/attachees/, jobs/reports/fill-rates/, jobs/reports/analytics/,
 * jobs/reports/export-csv/), but the server derives the department scope from
 * the signed-in Director's own account and rejects any foreign department with
 * 403. So there is no department picker here on purpose — a Director has
 * nothing to select, and nothing to manipulate.
 *
 * Content is limited to metrics that are meaningful for a single department:
 * deployed attachees, clearance status, requisition history and fulfilment, and
 * vacancy fill rates. System-wide institutional statistics are not included.
 */
export default function DepartmentReports({ embedded = false }) {
    const user = useAuthStore(state => state.user);
    const userRole = user?.role || '';
    const isDirector = ['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole);

    const [clearanceStatus, setClearanceStatus] = useState('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activeTab, setActiveTab] = useState('attachees');
    const [exporting, setExporting] = useState(false);

    // Reloaded on the shared poll interval and on tab focus, so clearance
    // decisions recorded elsewhere show up without a manual reload. Filters
    // still drive the query as before.
    const loadAll = useCallback(async () => {
        const params = new URLSearchParams();
        if (clearanceStatus !== 'ALL') params.append('status', clearanceStatus);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        const query = params.toString();

        const [analyticsRes, attacheesRes, vacanciesRes] = await Promise.all([
            api.get('jobs/reports/analytics/'),
            api.get(`jobs/reports/attachees/${query ? `?${query}` : ''}`),
            api.get('jobs/reports/fill-rates/'),
        ]);

        return {
            analytics: analyticsRes.data,
            attachees: attacheesRes.data?.attachees || [],
            vacancies: vacanciesRes.data?.vacancies || [],
        };
    }, [clearanceStatus, startDate, endDate]);

    const {
        data: loaded,
        error: loadError,
        loading,
        refreshing,
        lastUpdatedAt,
        refresh,
    } = useLiveData(loadAll, { enabled: isDirector });

    const analytics = loaded?.analytics || null;
    const attachees = loaded?.attachees || [];
    const vacancies = loaded?.vacancies || [];
    // A load failure and an export failure are different problems, so the export
    // message is kept separate rather than overwriting the load error.
    const [actionError, setActionError] = useState('');
    const error =
        actionError ||
        loadError?.response?.data?.detail ||
        (loadError ? 'Unable to load department reports.' : '');

    const handleExportCSV = async (reportType) => {
        setActionError('');
        try {
            setExporting(true);
            const params = new URLSearchParams({ report_type: reportType });
            if (reportType === 'attachees') {
                if (clearanceStatus !== 'ALL') params.append('status', clearanceStatus);
                if (startDate) params.append('start_date', startDate);
                if (endDate) params.append('end_date', endDate);
            }
            const res = await api.get(`jobs/reports/export-csv/?${params.toString()}`, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = blobUrl;
            const deptSlug = (analytics?.department_info?.name || 'department').replace(/\s+/g, '_').toLowerCase();
            link.setAttribute('download', `${deptSlug}_${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (err) {
            console.error('CSV export failed:', err);
            setActionError('Failed to export the department report.');
        } finally {
            setExporting(false);
        }
    };

    if (!isDirector) {
        return (
            <div className="text-center p-10 font-bold text-red-500 text-xl border border-red-200 bg-red-50 rounded-2xl">
                Access Denied. Department Director Privileges Required.
            </div>
        );
    }

    const departmentName = analytics?.department_info?.name || 'Your Department';
    const requisitions = analytics?.requisitions_summary || {};
    const stats = analytics?.statistical_quality_metrics || {};

    const totalVacancies = vacancies.length;
    const totalSlots = vacancies.reduce((sum, v) => sum + (v.slots_required || 0), 0);
    const totalFilled = vacancies.reduce((sum, v) => sum + (v.slots_filled || 0), 0);
    const overallFillRate = totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0;

    const clearedCount = attachees.filter(a => a.clearance_status === 'CLEARED').length;
    const awaitingHrCount = attachees.filter(a => a.clearance_status === 'PENDING_HR').length;
    const pendingDeptCount = attachees.filter(a => a.clearance_status === 'PENDING_DEPARTMENT').length;

    const requisitionApprovalRate = requisitions.total > 0
        ? Math.round(((requisitions.approved + requisitions.fulfilled) / requisitions.total) * 100)
        : 0;

    const header = (
        <PageGuideHeader
            title="Department Reports & Analytics"
            subtitle={`${departmentName} attachment metrics: deployed attachees, clearance status, requisition history and vacancy fill rates.`}
            badge="Department Director"
            workflowKey="director-workflow"
            currentStep={4}
            roleTips={{
                DEPARTMENT_DIRECTOR: "These reports cover your department only. Clearance sign-off for your attachees happens in the Stage 1 Clearance Queue.",
            }}
            actions={
                <div className="flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm text-xs font-bold">
                    <button
                        onClick={() => setActiveTab('attachees')}
                        className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'attachees' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Attachees &amp; Clearance
                    </button>
                    <button
                        onClick={() => setActiveTab('fill_rates')}
                        className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'fill_rates' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /></svg>
                        Vacancy Fill Rates
                    </button>
                </div>
            }
        />
    );

    const body = (
        <div className="space-y-6">
            {error && (
                <div className="p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-900 border border-rose-200">
                    {error}
                </div>
            )}

            {/* Polling keeps this fresh while the tab is open; this covers the case
                where a poll failed and the last good figures are still on screen. */}
            <div className="flex items-center justify-end gap-3">
                <span className="text-2xs text-slate-500 font-medium">
                    {refreshing
                        ? 'Refreshing…'
                        : lastUpdatedAt
                            ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
                            : null}
                </span>
                <button
                    type="button"
                    onClick={refresh}
                    disabled={refreshing}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                    Refresh
                </button>
            </div>

            {/* Department summary tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Attachees Deployed</p>
                    <h3 className="text-3xl font-black text-slate-900 mt-1">{analytics?.active_attachees_count ?? 0}</h3>
                    <p className="text-2xs text-slate-500 font-medium mt-1">
                        {analytics?.exited_attachees_count ?? 0} completed attachment
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Clearance Pending</p>
                    <h3 className="text-3xl font-black text-amber-700 mt-1">
                        {(analytics?.pending_stage1_clearances ?? 0) + (analytics?.approved_stage1_clearances ?? 0)}
                    </h3>
                    <p className="text-2xs text-slate-500 font-medium mt-1">
                        {analytics?.approved_stage1_clearances ?? 0} with HR &middot; {analytics?.pending_stage1_clearances ?? 0} awaiting your sign-off
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Requisitions</p>
                    <h3 className="text-3xl font-black text-slate-900 mt-1">{requisitions.total ?? 0}</h3>
                    <p className="text-2xs text-slate-500 font-medium mt-1">
                        {requisitions.pending ?? 0} pending &middot; {requisitionApprovalRate}% approved
                    </p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Average ATS Score</p>
                    <h3 className="text-3xl font-black text-primary-700 mt-1">{stats.mean ?? analytics?.average_ats_score ?? 0}</h3>
                    <p className="text-2xs text-slate-500 font-medium mt-1">
                        {analytics?.total_applications ?? 0} application(s) received
                    </p>
                </div>
            </div>

            {/* Requisition history & clearance breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-black text-slate-900 mb-4">Requisition History &amp; Fulfilment</h3>
                    <dl className="space-y-2.5 text-xs">
                        {[
                            ['Total submitted', requisitions.total],
                            ['Pending HR review', requisitions.pending],
                            ['Approved', requisitions.approved],
                            ['Fulfilled', requisitions.fulfilled],
                            ['Rejected', requisitions.rejected],
                            ['Candidates requested', requisitions.candidates_requested],
                        ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                                <dt className="text-slate-600 font-semibold">{label}</dt>
                                <dd className="text-slate-900 font-black">{value ?? 0}</dd>
                            </div>
                        ))}
                    </dl>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-black text-slate-900 mb-4">Clearance Status Breakdown</h3>
                    <dl className="space-y-2.5 text-xs">
                        {[
                            ['Fully cleared', clearedCount, 'text-emerald-700'],
                            ['Awaiting HR review', awaitingHrCount, 'text-amber-700'],
                            ['Awaiting your sign-off', pendingDeptCount, 'text-primary-600'],
                            ['Total tracked attachees', attachees.length, 'text-slate-900'],
                        ].map(([label, value, tone]) => (
                            <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                                <dt className="text-slate-600 font-semibold">{label}</dt>
                                <dd className={`font-black ${tone}`}>{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-2xs text-slate-500 font-medium mt-4 leading-relaxed">
                        Stage 1 sign-off velocity: <strong className="text-slate-800">{analytics?.stage1_velocity_rate ?? 0}%</strong> of your department's clearance records carry your sign-off.
                    </p>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                    <h3 className="text-sm font-black text-slate-900 mb-4">Capacity &amp; Fill Rate</h3>
                    <dl className="space-y-2.5 text-xs">
                        {[
                            ['Active vacancies', analytics?.total_vacancies ?? 0],
                            ['Slots required', analytics?.total_slots_required ?? 0],
                            ['Slots filled', analytics?.total_slots_filled ?? 0],
                            ['Available headroom', analytics?.available_headroom ?? 0],
                        ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                                <dt className="text-slate-600 font-semibold">{label}</dt>
                                <dd className="text-slate-900 font-black">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="mt-4">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-slate-600 font-semibold">Fill rate</span>
                            <span className="text-slate-900 font-black">{analytics?.fill_rate ?? 0}%</span>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-primary-600 h-2.5 rounded-full transition-all"
                                style={{ width: `${Math.min(analytics?.fill_rate ?? 0, 100)}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {activeTab === 'attachees' ? (
                <div className="space-y-4">
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-end justify-between gap-4">
                        <div className="flex flex-wrap items-end gap-4">
                            <div>
                                <label htmlFor="dept-clearance-status" className="block text-xs font-bold uppercase text-slate-700 mb-1.5">Clearance Status</label>
                                <select
                                    id="dept-clearance-status"
                                    value={clearanceStatus}
                                    onChange={(e) => setClearanceStatus(e.target.value)}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                                >
                                    <option value="ALL">All Statuses</option>
                                    <option value="NOT_STARTED">Not Started</option>
                                    <option value="PENDING_DEPARTMENT">Pending Department Review</option>
                                    <option value="PENDING_HR">Pending HR Review</option>
                                    <option value="CLEARED">Cleared</option>
                                    <option value="REJECTED">Revision / Rejected</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="dept-start-date" className="block text-xs font-bold uppercase text-slate-700 mb-1.5">From Date</label>
                                <input
                                    id="dept-start-date"
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                                />
                            </div>
                            <div>
                                <label htmlFor="dept-end-date" className="block text-xs font-bold uppercase text-slate-700 mb-1.5">To Date</label>
                                <input
                                    id="dept-end-date"
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => printTable(
                                    `${departmentName} — Attachee Clearance Report`,
                                    'Successful attachees in your department with clearance status and HR review details',
                                    ['Attachee Name', 'Email', 'Vacancy', 'Application Date', 'Clearance Status', 'HR Cleared By'],
                                    attachees.map(a => [
                                        a.applicant_name, a.applicant_email, a.job_title,
                                        a.application_date ? new Date(a.application_date).toLocaleDateString() : 'N/A',
                                        (a.clearance_status || 'NOT_STARTED').replace(/_/g, ' '),
                                        a.hr_cleared_by || '—'
                                    ])
                                )}
                                className="px-5 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 016 0h6V5z" />
                                </svg>
                                Print Report
                            </button>
                            <button
                                onClick={() => handleExportCSV('attachees')}
                                disabled={exporting}
                                className="px-5 py-3 bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                {exporting ? 'Exporting...' : 'Export CSV'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading ? (
                            <div className="p-16 flex justify-center items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
                            </div>
                        ) : attachees.length === 0 ? (
                            <div className="p-16 text-center text-slate-600">
                                <p className="text-base font-bold text-slate-800">No attachees match the selected filters.</p>
                                <p className="text-xs text-slate-500 mt-1">Only {departmentName} records are included in this report.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-primary-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Attachee</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Position</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Application Date</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">ATS Score</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Clearance Status</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">HR Cleared By</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                        {attachees.map(a => (
                                            <tr key={a.application_id} className="hover:bg-amber-50/40 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-extrabold text-slate-900">{a.applicant_name}</div>
                                                    <div className="text-xs text-slate-600 font-medium">{a.applicant_email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-900">{a.job_title}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-bold">
                                                    {a.application_date ? new Date(a.application_date).toLocaleDateString() : 'N/A'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs font-black text-slate-800">{a.ats_score}%</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-3 py-1 text-xs font-extrabold uppercase rounded-full border ${
                                                        a.clearance_status === 'CLEARED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                                        a.clearance_status === 'PENDING_HR' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                                                        a.clearance_status === 'REJECTED' ? 'bg-red-50 text-red-800 border-red-300' :
                                                        'bg-slate-100 text-slate-700 border-slate-300'
                                                    }`}>
                                                        {(a.clearance_status || 'NOT_STARTED').replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700">
                                                    {a.hr_cleared_by ? (
                                                        <div>
                                                            <div className="font-bold text-slate-900">{a.hr_cleared_by}</div>
                                                            {a.hr_cleared_at && (
                                                                <div className="text-2xs text-slate-600 font-medium">{new Date(a.hr_cleared_at).toLocaleDateString()}</div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 font-bold italic">&mdash;</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                        {[
                            ['Total Vacancies', totalVacancies, 'text-slate-900'],
                            ['Capacity Slots', totalSlots, 'text-primary-700'],
                            ['Slots Filled', totalFilled, 'text-emerald-700'],
                            ['Overall Fill Rate', `${overallFillRate}%`, 'text-slate-900'],
                        ].map(([label, value, tone]) => (
                            <div key={label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{label}</p>
                                <h3 className={`text-3xl font-black mt-1 ${tone}`}>{value}</h3>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-end">
                        <button
                            onClick={() => handleExportCSV('fill_rates')}
                            disabled={exporting}
                            className="px-5 py-3 bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            {exporting ? 'Exporting...' : 'Export CSV'}
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading ? (
                            <div className="p-16 flex justify-center items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
                            </div>
                        ) : vacancies.length === 0 ? (
                            <div className="p-16 text-center text-slate-600">
                                <p className="text-base font-bold text-slate-800">No vacancy fill-rate data available.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-primary-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Vacancy</th>
                                            <th className="px-6 py-4 text-center text-xs font-black text-slate-800 uppercase tracking-wider">Required</th>
                                            <th className="px-6 py-4 text-center text-xs font-black text-slate-800 uppercase tracking-wider">Filled</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Fill Rate</th>
                                            <th className="px-6 py-4 text-right text-xs font-black text-slate-800 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                        {vacancies.map(v => (
                                            <tr key={v.job_id} className="hover:bg-amber-50/40 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap font-extrabold text-slate-900">{v.title}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center font-black text-slate-800">{v.slots_required}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center font-black text-emerald-700">{v.slots_filled}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-24 bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                                            <div
                                                                className={`h-2.5 rounded-full ${v.fill_rate >= 100 ? 'bg-red-500' : 'bg-primary-600'}`}
                                                                style={{ width: `${Math.min(v.fill_rate || 0, 100)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-black text-slate-800">{v.fill_rate}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                    <span className={`px-3 py-1 text-xs font-black uppercase rounded-full border ${
                                                        v.is_archived ? 'bg-amber-50 text-amber-800 border-amber-300' :
                                                        v.is_full ? 'bg-red-50 text-red-800 border-red-300' :
                                                        'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                    }`}>
                                                        {v.is_archived ? 'Archived' : v.is_full ? 'Capacity Full' : 'Open'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    if (embedded) return body;

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            {header}
            {body}
        </div>
    );
}
