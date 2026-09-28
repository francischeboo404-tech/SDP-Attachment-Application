import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { useLiveData } from '../hooks/useLiveData';

// Recharts cannot consume Tailwind theme tokens (it needs literal colour
// strings), so these mirror the @theme palette in index.css. The first entry is
// the exact brand value #bf7d2a so the primary series always uses it. If the
// brand gold is ever corrected again, index.css and this array must be changed
// together or the charts will silently drift from the rest of the UI.
const PETROLEUM_COLORS = [
  '#bf7d2a', // Exact brand primary (--color-primary-600)
  '#117A8B', // Petroleum Deep Teal
  '#28B8DC', // Petroleum Cyan Accent
  '#996322', // Brand shade (--color-primary-700), readable against white
  '#15803d', // Functional success (--color-status-success, 5.02:1 on white)
  '#D97706', // Amber
  '#475569', // Slate
  '#0284C7', // Sky Blue
  '#DC2626', // Functional error (--color-status-error, 4.83:1 on white)
];

export default function AdminAnalytics() {
    const navigate = useNavigate();
    const user = useAuthStore(state => state.user);
    const userRole = user?.role || 'ADMIN';

    // Default: Last 30 Days
    const defaultEnd = new Date().toISOString().split('T')[0];
    const defaultStart = new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(defaultStart);
    const [endDate, setEndDate] = useState(defaultEnd);

    // Polls, and refetches on tab focus, so a status change made by someone
    // else is reflected without a reload. Previously this fetched only when the
    // date range changed, which meant a decision recorded a moment ago left the
    // funnel and fill-rate charts showing figures that no longer existed.
    const fetchAnalytics = useCallback(async () => {
        const response = await api.get(`/jobs/reports/analytics/?start_date=${startDate}&end_date=${endDate}`);
        return response.data;
    }, [startDate, endDate]);

    const { data: stats, error, loading, refreshing, refresh, lastUpdatedAt } = useLiveData(fetchAnalytics);

    const handleStartDateChange = (e) => {
        if (e.target.value > endDate) {
            setEndDate(e.target.value);
        }
        setStartDate(e.target.value);
    };

    const handleEndDateChange = (e) => {
        if (e.target.value < startDate) {
            setStartDate(e.target.value);
        }
        setEndDate(e.target.value);
    };

    if (loading && !stats) {
        return (
            <div className="flex flex-col justify-center items-center h-80 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                <p className="text-sm font-bold text-slate-600 animate-pulse">Aggregating real-time system intelligence...</p>
            </div>
        );
    }

    // =========================================================================
    // 1. DEPARTMENT DIRECTOR DASHBOARD
    // =========================================================================
    if (['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole)) {
        const dept = stats?.department_info;
        const reqs = stats?.requisitions_summary || { total: 0, pending: 0, approved: 0, fulfilled: 0, candidates_requested: 0 };
        const activeAttachees = stats?.active_attachees || [];
        const pendingClearances = stats?.pending_clearances || [];
        const deptStats = stats?.statistical_quality_metrics || { mean: 0, median: 0, std_dev: 0, qualification_rate: 0, min_score: 0, max_score: 0, distribution_buckets: [] };
        // The benchmark is Admin-configurable, so it is read from the payload.
        // Hardcoding "70%" here meant the caption contradicted the number
        // above it as soon as the configured benchmark was changed.
        const deptBenchmark = stats?.qualification_benchmark ?? 70;

        return (
            <div className="animation-fade-in max-w-7xl mx-auto space-y-8 pb-16 text-slate-900">
                {/* Header & Live Status Bar */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl md:rounded-3xl border border-slate-200/90 shadow-sm">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="px-3 py-1 bg-primary-100 text-primary-900 border border-primary-300 rounded-full text-xs font-black uppercase tracking-wider">
                                Department Director Operations
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                Live Real-Time
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                            {dept?.name ? `${dept.name} Command Center` : 'Department Director Intelligence'}
                        </h1>
                        <p className="text-slate-600 text-sm mt-1">
                            Real-time tracking of department capacity, active student deployments, attachment requisitions, and Stage 1 clearance reviews.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={refresh}
                            disabled={refreshing}
                            className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-black transition-all shadow-xs"
                            title="Refresh real-time data"
                        >
                            <svg className={`w-4 h-4 text-primary-600 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>{refreshing ? 'Syncing...' : 'Sync Live'}</span>
                        </button>
                        <button
                            onClick={() => navigate('/director-portal')}
                            className="bg-accent-500 hover:bg-accent-600 text-white px-5 py-2.5 rounded-xl font-black text-xs shadow-md transition-all flex items-center gap-1.5"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Submit Requisition</span>
                        </button>
                    </div>
                </div>

                {/* Department Capacity & KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {/* Active Attachees */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-primary-600">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Active Attachees</span>
                            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center font-bold text-sm">
                                👥
                            </div>
                        </div>
                        <p className="text-3xl font-black text-slate-900 mt-3">{stats?.active_attachees_count || 0}</p>
                        <p className="text-xs text-slate-500 font-medium mt-1">Currently stationed in department</p>
                    </div>

                    {/* Department Slot Fill Rate & Headroom */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-cyan-600">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Slot Capacity Filled</span>
                            <span className="text-xs font-black text-cyan-800 bg-cyan-50 px-2 py-0.5 rounded-md border border-cyan-200">
                                {/* No fallback to the department's declared intake here. A
                                    director with no open vacancies has nothing advertised to
                                    fill, so "0 / 10" would report unfilled slots for posts
                                    that were never posted. */}
                                {stats?.total_slots_filled || 0} / {stats?.total_slots_required || 0}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between mt-3">
                            <p className="text-3xl font-black text-slate-900">{stats?.fill_rate || 0}%</p>
                            <span className="text-xs font-bold text-slate-500">
                                Headroom: <strong>{stats?.available_headroom || 0} slots</strong>
                            </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                            <div className="bg-cyan-600 h-2 rounded-full transition-all" style={{ width: `${Math.min(stats?.fill_rate || 0, 100)}%` }} />
                        </div>
                    </div>

                    {/* Pending Stage 1 Clearances */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Pending Stage 1 Exit</span>
                            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-sm">
                                ⏳
                            </div>
                        </div>
                        <p className="text-3xl font-black text-amber-900 mt-3">{stats?.pending_stage1_clearances || 0}</p>
                        <p className="text-xs text-amber-800 font-bold mt-1">
                            {stats?.pending_stage1_clearances ? 'Requires supervisor sign-off' : 'Queue up to date'}
                        </p>
                    </div>

                    {/* Attachment Requisitions */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-600">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Approved Requisitions</span>
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm">
                                ✅
                            </div>
                        </div>
                        <p className="text-3xl font-black text-slate-900 mt-3">{reqs.approved}</p>
                        <p className="text-xs text-slate-500 font-medium mt-1">{reqs.pending} pending HR review</p>
                    </div>
                </div>

                {/* Department Statistical ATS Distribution Profile */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary-600"></span>
                                <h3 className="text-base font-black text-slate-900">Department Applicant Quality Profile & Statistical Distribution</h3>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                                Actuarial & descriptive statistics computed across candidates applying to {dept?.name || 'this department'}.
                            </p>
                        </div>
                        <span className="text-xs font-bold px-3 py-1 bg-primary-50 text-primary-900 border border-primary-200 rounded-full">
                            Total Candidates: <strong>{deptStats.count}</strong>
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Mean (μ)</span>
                            <p className="text-xl font-black text-primary-900 mt-1">{deptStats.mean}%</p>
                            <span className="text-2xs text-slate-400">Average ATS</span>
                        </div>
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Median (Q₂)</span>
                            <p className="text-xl font-black text-primary-900 mt-1">{deptStats.median}%</p>
                            <span className="text-2xs text-slate-400">50th Percentile</span>
                        </div>
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Std Deviation (σ)</span>
                            <p className="text-xl font-black text-primary-900 mt-1">{deptStats.std_dev}%</p>
                            <span className="text-2xs text-slate-400">Score Dispersion</span>
                        </div>
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Qualification Rate</span>
                            <p className="text-xl font-black text-emerald-700 mt-1">{deptStats.qualification_rate}%</p>
                            <span className="text-2xs text-slate-400">Benchmark ≥{deptBenchmark}%</span>
                        </div>
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Min Score</span>
                            <p className="text-xl font-black text-slate-700 mt-1">{deptStats.min_score}%</p>
                            <span className="text-2xs text-slate-400">Lowest candidate</span>
                        </div>
                        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                            <span className="text-2xs font-bold text-slate-500 uppercase">Max Score</span>
                            <p className="text-xl font-black text-slate-700 mt-1">{deptStats.max_score}%</p>
                            <span className="text-2xs text-slate-400">Highest candidate</span>
                        </div>
                    </div>

                    {/* Tier Distribution Bars */}
                    {deptStats.distribution_buckets && deptStats.distribution_buckets.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-2">
                                Candidate Qualification Tiers
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                {deptStats.distribution_buckets.map((b, idx) => (
                                    <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                        <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
                                            <span className="truncate">{b.tier}</span>
                                            <span className="font-black text-primary-900">{b.count}</span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className="h-1.5 rounded-full bg-primary-600" 
                                                style={{ width: `${clampPercent(b.percentage)}%` }}
                                            />
                                        </div>
                                        <span className="text-2xs text-slate-500 mt-1 block text-right font-semibold">{clampPercent(b.percentage)}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Operations Grid: Pending Clearance Queue & Active Attachees Roster */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Stage 1 Clearance Action Box */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                                    Stage 1: Pending Supervisor Clearance
                                </h3>
                                <button
                                    onClick={() => navigate('/department-clearance')}
                                    className="text-xs font-black text-primary-700 hover:text-primary-800 hover:underline"
                                >
                                    Open Full Queue &rarr;
                                </button>
                            </div>
                            <p className="text-xs text-slate-600 mb-4">
                                Attachees who have completed their attachment period and uploaded their final logbook/project deliverable.
                            </p>

                            {pendingClearances.length === 0 ? (
                                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    <svg className="w-10 h-10 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="text-sm font-bold text-slate-800">No Pending Department Sign-offs</p>
                                    <p className="text-xs text-slate-500 mt-1">All attachee exit reviews for your department are currently cleared.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                                    {pendingClearances.map(item => (
                                        <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-amber-50/40 transition-colors">
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{item.name}</p>
                                                <p className="text-xs text-slate-500">
                                                    Submitted: {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : 'Awaiting file'}
                                                    {item.has_report && <span className="ml-2 text-emerald-700 font-bold">📄 Final Report Attached</span>}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => navigate('/department-clearance')}
                                                className="px-3 py-1.5 bg-primary-50 hover:bg-primary-100 text-primary-900 border border-primary-200 text-xs font-bold rounded-lg transition-all"
                                            >
                                                Review
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                            <span>Stage 1 Clearance is verified before advancing to HR Stage 2.</span>
                            <button
                                onClick={() => navigate('/department-clearance')}
                                className="font-bold text-primary-700 hover:underline"
                            >
                                Process Queue
                            </button>
                        </div>
                    </div>

                    {/* Active Attachees in Department Roster */}
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-primary-600"></span>
                                    Active Department Attachees Roster
                                </h3>
                                <button
                                    onClick={() => navigate('/deployments')}
                                    className="text-xs font-black text-primary-700 hover:text-primary-800 hover:underline"
                                >
                                    View All &rarr;
                                </button>
                            </div>
                            <p className="text-xs text-slate-600 mb-4">
                                Students currently deployed in {dept?.name || 'your department'}.
                            </p>

                            {activeAttachees.length === 0 ? (
                                <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    <p className="text-sm font-bold text-slate-800">No Active Attachees Stationed</p>
                                    <p className="text-xs text-slate-500 mt-1">Submit a staffing requisition to request attachee allocations from HR.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                                    {activeAttachees.map(att => (
                                        <div key={att.id} className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                            <div>
                                                <p className="text-sm font-black text-slate-900">{att.name}</p>
                                                <p className="text-xs text-slate-500">{att.email}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="px-2 py-1 rounded-md text-2xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                    Active
                                                </span>
                                                <p className="text-2xs text-slate-400 mt-0.5">Ends {att.planned_end_date}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-xs text-slate-500">Need more attachment staffing?</span>
                            <button
                                onClick={() => navigate('/director-portal')}
                                className="text-xs font-bold text-accent-700 hover:text-accent-800 hover:underline"
                            >
                                Submit Requisition &rarr;
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // 2. ADMIN & HR CONSOLIDATED DASHBOARDS
    // =========================================================================
    const isHR = userRole === 'HR';
    const usersSummary = stats?.users_summary || { total_users: 0, applicants: 0, hr: 0, directors: 0, admins: 0 };
    const deptSummary = stats?.departments_summary || { total: 0, active: 0, total_capacity: 0, total_filled: 0, available_headroom: 0, overall_fill_rate: 0 };
    const reqSummary = stats?.requisitions_summary || { total: 0, pending: 0, approved: 0, fulfilled: 0, rejected: 0, candidates_requested: 0, approval_rate: 0 };
    const depSummary = stats?.deployments_summary || { total: 0, active: 0, exited: 0, pending_deployment: 0 };
    const clearSummary = stats?.clearances_summary || { total: 0, pending_department: 0, pending_hr: 0, cleared: 0, rejected: 0 };
    const recSummary = stats?.recommendations_summary || { total_issued: 0 };
    const deptFillRates = stats?.department_fill_rates || [];
    const recentActivity = stats?.recent_activity || [];
    const statsMetrics = stats?.statistical_quality_metrics || { mean: 0, median: 0, std_dev: 0, variance: 0, q1: 0, q3: 0, iqr: 0, qualification_rate: 0, min_score: 0, max_score: 0, distribution_buckets: [] };
    const conversionFunnel = stats?.conversion_funnel || { funnel_stages: [], metrics: {} };
    // Admin-configurable; see the note in the director branch above.
    const benchmark = stats?.qualification_benchmark ?? 70;

    const pieData = (stats?.status_distribution || []).map(s => ({
        name: s.status,
        value: s.count
    }));

    // Every summary above defaults to zeros, so a failed first load would render
    // a complete dashboard of confident zeroes. Say so instead.
    if (error && !stats) {
        return (
            <div className="max-w-2xl mx-auto mt-10 space-y-4">
                <div className="p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-900 border border-rose-200">
                    {error.response?.data?.detail || 'Unable to load analytics.'}
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

    return (
        <div className="animation-fade-in max-w-7xl mx-auto space-y-8 pb-16 text-slate-900">
            {/* Command Bar: Title, Date Filter & Live Sync */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl md:rounded-3xl border border-slate-200/90 shadow-sm">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-3 py-1 bg-primary-100 text-primary-900 border border-primary-300 rounded-full text-xs font-black uppercase tracking-wider">
                            {isHR ? 'HR Operations Command Center' : 'System Administration & Intelligence'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live Sync Active
                        </span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                        {isHR ? 'Industrial Attachment Operations Dashboard' : 'Institutional Governance Dashboard'}
                    </h1>
                    <p className="text-slate-600 text-sm mt-1">
                        Consolidated real-time analytics across requisitions, applications, deployments, dual clearances, and recommendation letters.
                    </p>
                </div>

                {/* Filter and Refresh Controls */}
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1.5 gap-2 text-xs font-bold shadow-xs">
                        <span className="text-slate-500 uppercase px-1.5 text-2xs">Period:</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={handleStartDateChange}
                            className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2 py-1 font-bold focus:ring-primary focus:border-primary"
                        />
                        <span className="text-slate-400">to</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={handleEndDateChange}
                            max={new Date().toISOString().split('T')[0]}
                            className="bg-white border border-slate-300 text-slate-800 text-xs rounded-lg px-2 py-1 font-bold focus:ring-primary focus:border-primary"
                        />
                    </div>

                    <button
                        onClick={refresh}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 bg-primary-50 hover:bg-primary-100 text-primary-900 border border-primary-300 px-4 py-2 rounded-xl text-xs font-black transition-all shadow-xs"
                    >
                        <svg className={`w-4 h-4 text-primary-700 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>{refreshing ? 'Syncing...' : 'Sync Live'}</span>
                    </button>
                </div>
            </div>

            {/* Operational Lifecycle Pipeline Cards */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-black uppercase tracking-wider text-slate-600 flex items-center gap-2">
                        <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        End-to-End Operational Lifecycle Pipeline
                    </h2>
                    <span className="text-xs text-slate-500 font-bold">Real-time throughput counts</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                    {/* 1. Requisitions */}
                    <div 
                        onClick={() => navigate('/requisition-queue')}
                        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-primary-300 transition-all cursor-pointer group"
                    >
                        <span className="text-2xs font-black uppercase tracking-wider text-slate-500 block mb-1">1. Requisitions</span>
                        <p className="text-2xl font-black text-slate-900 group-hover:text-primary-700 transition-colors">{reqSummary.total}</p>
                        <div className="mt-2 flex items-center justify-between text-2xs">
                            <span className="text-amber-700 font-bold">{reqSummary.pending} Pending</span>
                            <span className="text-emerald-700 font-bold">{reqSummary.approved} Approved</span>
                        </div>
                    </div>

                    {/* 2. Vacancies */}
                    <div 
                        onClick={() => navigate('/vacancies')}
                        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-primary-300 transition-all cursor-pointer group"
                    >
                        <span className="text-2xs font-black uppercase tracking-wider text-slate-500 block mb-1">2. Vacancies</span>
                        <p className="text-2xl font-black text-slate-900 group-hover:text-primary-700 transition-colors">{stats?.total_jobs || 0}</p>
                        <div className="mt-2 text-2xs text-slate-500">
                            <span>{deptSummary.total_capacity} total slots</span>
                        </div>
                    </div>

                    {/* 3. Applications */}
                    <div 
                        onClick={() => navigate('/manage-jobs')}
                        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-primary-300 transition-all cursor-pointer group"
                    >
                        <span className="text-2xs font-black uppercase tracking-wider text-slate-500 block mb-1">3. Applications</span>
                        <p className="text-2xl font-black text-slate-900 group-hover:text-primary-700 transition-colors">{stats?.total_applications || 0}</p>
                        <div className="mt-2 text-2xs text-slate-500">
                            <span>Avg ATS: <strong>{statsMetrics.mean}%</strong></span>
                        </div>
                    </div>

                    {/* 4. Deployments */}
                    <div 
                        onClick={() => navigate('/deployments')}
                        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-primary-300 transition-all cursor-pointer group"
                    >
                        <span className="text-2xs font-black uppercase tracking-wider text-slate-500 block mb-1">4. Deployments</span>
                        <p className="text-2xl font-black text-slate-900 group-hover:text-primary-700 transition-colors">{depSummary.active}</p>
                        <div className="mt-2 text-2xs text-slate-500">
                            <span>{depSummary.total} total deployed</span>
                        </div>
                    </div>

                    {/* 5. Dual Clearances */}
                    <div 
                        onClick={() => navigate('/clearance-queue')}
                        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-primary-300 transition-all cursor-pointer group"
                    >
                        <span className="text-2xs font-black uppercase tracking-wider text-slate-500 block mb-1">5. Clearances</span>
                        <p className="text-2xl font-black text-slate-900 group-hover:text-primary-700 transition-colors">{clearSummary.total}</p>
                        <div className="mt-2 text-2xs text-amber-700 font-bold">
                            <span>{clearSummary.pending_hr} awaiting HR</span>
                        </div>
                    </div>

                    {/* 6. Letters Issued */}
                    <div 
                        onClick={() => navigate('/letter-templates')}
                        className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:shadow-md hover:border-primary-300 transition-all cursor-pointer group"
                    >
                        <span className="text-2xs font-black uppercase tracking-wider text-slate-500 block mb-1">6. Rec. Letters</span>
                        <p className="text-2xl font-black text-emerald-800 group-hover:text-emerald-900 transition-colors">{recSummary.total_issued}</p>
                        <div className="mt-2 text-2xs text-emerald-700 font-bold">
                            <span>Official Documents</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actuarial Yield Conversion Funnel */}
            {conversionFunnel.funnel_stages && conversionFunnel.funnel_stages.length > 0 && (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                                <h3 className="text-base font-black text-slate-900">Actuarial Conversion & Yield Funnel</h3>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                                End-to-end yield progression and candidate throughput across all lifecycle gating stages.
                            </p>
                        </div>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                            Placement Yield: <strong>{conversionFunnel.metrics?.placement_yield_rate || 0}%</strong>
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {conversionFunnel.funnel_stages.map((stage, idx) => (
                            <div key={idx} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 relative flex flex-col justify-between">
                                <div>
                                    <span className="text-2xs font-black uppercase tracking-wider text-slate-500 block mb-1 truncate">
                                        {stage.stage}
                                    </span>
                                    <p className="text-2xl font-black text-slate-900">{stage.count}</p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-slate-200">
                                    <div className="flex items-center justify-between text-2xs font-bold">
                                        <span className="text-primary-800">{clampPercent(stage.rate)}%</span>
                                        <span className="text-2xs font-semibold text-slate-400">of applicants</span>
                                    </div>
                                    <span className="text-2xs text-slate-500 block truncate mt-0.5" title={stage.benchmark}>
                                        {stage.benchmark}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Statistical Quality Metrics Engine */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-primary-600"></span>
                            <h3 className="text-base font-black text-slate-900">Applicant Quality Distribution & Statistical Dispersion Profile</h3>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                            Rigorous descriptive statistics and variance metrics computed across applicant ATS scoring distributions.
                        </p>
                    </div>
                    <span className="text-xs font-bold px-3 py-1 bg-primary-50 text-primary-900 border border-primary-200 rounded-full">
                        Sample Size: <strong>{statsMetrics.count} applications</strong>
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Mean Score (μ)</span>
                        <p className="text-xl font-black text-primary-900 mt-1">{statsMetrics.mean}%</p>
                        <span className="text-2xs text-slate-400">Average Performance</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Median (Q₂)</span>
                        <p className="text-xl font-black text-primary-900 mt-1">{statsMetrics.median}%</p>
                        <span className="text-2xs text-slate-400">50th Percentile</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Std Deviation (σ)</span>
                        <p className="text-xl font-black text-primary-900 mt-1">{statsMetrics.std_dev}%</p>
                        <span className="text-2xs text-slate-400">Variance: {statsMetrics.variance}</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-2xs font-bold text-slate-500 uppercase">IQR (Q₃ - Q₁)</span>
                        <p className="text-xl font-black text-primary-900 mt-1">{statsMetrics.iqr}%</p>
                        <span className="text-2xs text-slate-400">Q₁: {statsMetrics.q1}% | Q₃: {statsMetrics.q3}%</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Qualification Rate</span>
                        <p className="text-xl font-black text-emerald-700 mt-1">{statsMetrics.qualification_rate}%</p>
                            <span className="text-2xs text-slate-400">Scoring ≥ {benchmark}%</span>
                    </div>
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                        <span className="text-2xs font-bold text-slate-500 uppercase">Range (Min - Max)</span>
                        <p className="text-xl font-black text-slate-800 mt-1">{statsMetrics.min_score}% - {statsMetrics.max_score}%</p>
                        <span className="text-2xs text-slate-400">Spread: {roundNum(statsMetrics.max_score - statsMetrics.min_score)}%</span>
                    </div>
                </div>

                {/* Score Quality Tiers */}
                {statsMetrics.distribution_buckets && statsMetrics.distribution_buckets.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-500 block mb-2">
                            Quality Tier Stratification
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {statsMetrics.distribution_buckets.map((b, idx) => (
                                <div key={idx} className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                                    <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-1">
                                        <span className="truncate">{b.tier}</span>
                                        <span className="font-black text-primary-900">{b.count}</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                        <div 
                                            className="h-1.5 rounded-full bg-primary-600" 
                                            style={{ width: `${clampPercent(b.percentage)}%` }}
                                        />
                                    </div>
                                    <span className="text-2xs text-slate-500 mt-1 block text-right font-semibold">{clampPercent(b.percentage)}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Main Interactive Charts & Department Capacity Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Department Capacity & Fill Rates Ranking Table */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-cyan-600"></span>
                                Department Slot Capacity & Utilization
                            </h3>
                            <button
                                onClick={() => navigate('/reports')}
                                className="text-xs font-black text-primary-700 hover:underline"
                            >
                                Full Report &rarr;
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 mb-4">
                            Real-time tracking of slot capacity utilization and active attachee headcount per technical department.
                        </p>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-black uppercase tracking-wider">
                                        <th className="py-2.5 px-3">Department</th>
                                        <th className="py-2.5 px-3 text-center">Required Slots</th>
                                        <th className="py-2.5 px-3 text-center">Filled</th>
                                        <th className="py-2.5 px-3 text-center">Headroom</th>
                                        <th className="py-2.5 px-3 text-center">Active Now</th>
                                        <th className="py-2.5 px-3">Utilization Rate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {deptFillRates.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="py-6 text-center text-slate-500 font-medium">No active departments configured</td>
                                        </tr>
                                    ) : (
                                        deptFillRates.map(dept => (
                                            <tr key={dept.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="py-3 px-3 font-bold text-slate-900">{dept.name}</td>
                                                <td className="py-3 px-3 text-center font-bold text-slate-700">{dept.slots_required}</td>
                                                <td className="py-3 px-3 text-center font-bold text-slate-700">{dept.slots_filled}</td>
                                                <td className="py-3 px-3 text-center font-bold text-slate-500">{dept.available_headroom ?? Math.max(dept.slots_required - dept.slots_filled, 0)}</td>
                                                <td className="py-3 px-3 text-center">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                                                        {dept.active_attachees}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                                                            <div 
                                                                className={`h-2 rounded-full ${
                                                                    dept.fill_rate >= 100 ? 'bg-emerald-600' :
                                                                    dept.fill_rate >= 60  ? 'bg-cyan-600' :
                                                                                            'bg-amber-500'
                                                                }`} 
                                                                style={{ width: `${Math.min(dept.fill_rate, 100)}%` }} 
                                                            />
                                                        </div>
                                                        <span className="font-black text-slate-800 text-2xs w-9 text-right">{dept.fill_rate}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Overall Ministry Fill Rate: <strong>{deptSummary.overall_fill_rate}%</strong> (Available Headroom: <strong>{deptSummary.available_headroom}</strong>)</span>
                        <span>{deptSummary.active} Active Departments</span>
                    </div>
                </div>

                {/* Application Status Breakdown Donut Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                    <div>
                        <h3 className="text-base font-black text-slate-900 mb-2">Application Screening Status</h3>
                        <p className="text-xs text-slate-600 mb-4">Distribution across candidate hiring stages.</p>
                        
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height={256}>
                                <PieChart>
                                    <Pie
                                        data={pieData.length ? pieData : [{name: 'No Data', value: 1}]}
                                        cx="50%"
                                        cy="50%"
                                        stroke="none"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {pieData.length ? pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={PETROLEUM_COLORS[index % PETROLEUM_COLORS.length]} />
                                        )) : <Cell fill="#E5E7EB" />}
                                    </Pie>
                                    {pieData.length > 0 && (
                                        <>
                                            <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                            <Legend iconType="circle" />
                                        </>
                                    )}
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Total: <strong>{stats?.total_applications || 0}</strong> candidates</span>
                        <button onClick={() => navigate('/manage-jobs')} className="font-bold text-primary-700 hover:underline">
                            Manage &rarr;
                        </button>
                    </div>
                </div>
            </div>

            {/* Application Submissions Trend Over Time (Area Chart) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-6">
                    <div>
                        <h3 className="text-base font-black text-slate-900">
                            {stats?.period_label || 'Chronological'} Application Submission & Scoring Trends
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                            Volume of student applications submitted alongside average ATS qualification scores over time.
                        </p>
                    </div>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                        {startDate} to {endDate}
                    </span>
                </div>

                <div className="h-72">
                    <ResponsiveContainer width="100%" height={288}>
                        <AreaChart data={stats?.trend?.length ? stats.trend : [{date: 'No Data', applications: 0}]}>
                            <defs>
                                <linearGradient id="colorApps" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#bf7d2a" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#bf7d2a" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                            {stats?.trend?.length > 0 && <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />}
                            <Area type="monotone" dataKey="applications" stroke="#bf7d2a" strokeWidth={3} fillOpacity={1} fill="url(#colorApps)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Bottom Row: User Role Distribution & System Live Audit Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* User Roles & Access Breakdown */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-primary-600"></span>
                                User Accounts & Role Governance
                            </h3>
                            {!isHR && (
                                <button onClick={() => navigate('/manage-users')} className="text-xs font-black text-primary-700 hover:underline">
                                    Manage Users &rarr;
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-slate-600 mb-4">
                            Registered accounts across Applicant, HR Staff, Department Director, and Administrator tiers.
                        </p>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                <span className="text-2xs font-bold text-slate-500 uppercase">Applicants</span>
                                <p className="text-xl font-black text-slate-900 mt-1">{usersSummary.applicants}</p>
                            </div>
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                <span className="text-2xs font-bold text-slate-500 uppercase">Directors</span>
                                <p className="text-xl font-black text-slate-900 mt-1">{usersSummary.directors}</p>
                            </div>
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                <span className="text-2xs font-bold text-slate-500 uppercase">HR Staff</span>
                                <p className="text-xl font-black text-slate-900 mt-1">{usersSummary.hr}</p>
                            </div>
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                <span className="text-2xs font-bold text-slate-500 uppercase">Admins</span>
                                <p className="text-xl font-black text-slate-900 mt-1">{usersSummary.admins}</p>
                            </div>
                        </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Total Registered Users: <strong>{usersSummary.total_users}</strong></span>
                        <span className="text-emerald-700 font-bold">100% RBAC Secured</span>
                    </div>
                </div>

                {/* System Activity & Audit Trail Stream */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                                Real-Time System Audit Trail
                            </h3>
                            {!isHR && (
                                <button onClick={() => navigate('/audit-logs')} className="text-xs font-black text-primary-700 hover:underline">
                                    Full Audit Logs &rarr;
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-slate-600 mb-4">
                            Live chronological activity log of administrative events, clearances, and role actions.
                        </p>

                        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                            {recentActivity.length === 0 ? (
                                <div className="p-4 text-center text-slate-500 text-xs">No recent audit records</div>
                            ) : (
                                recentActivity.map(act => (
                                    <div key={act.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                                        <div className="pr-2">
                                            <p className="font-bold text-slate-900 line-clamp-1">{act.description}</p>
                                            <p className="text-2xs text-slate-500 mt-0.5">By {act.user} • {act.action}</p>
                                        </div>
                                        <span className="text-2xs text-slate-400 whitespace-nowrap">
                                            {new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>Immutable audit logs</span>
                        <span className="text-slate-400">Last updated {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : '--'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Constrains a percentage to a displayable 0-100 range.
 *
 * Used for the tier distribution bars and their captions. A value outside the
 * range would produce an invalid CSS width (an over-wide bar) or a negative
 * one, so it is clamped at the single point where the number becomes a
 * displayed measurement rather than raw data.
 */
function clampPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(100, Math.max(0, num));
}

function roundNum(num) {
    if (isNaN(num)) return 0;
    return Math.round(num * 10) / 10;
}
