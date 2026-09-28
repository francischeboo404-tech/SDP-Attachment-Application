import React, { useState, useEffect } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import { printTable } from '../utils/downloadUtils';

/**
 * Print/CSV column set for the attachee report.
 *
 * These keys mirror `ATTACHEE_REPORT_COLUMNS` in the backend, which is the same
 * definition the CSV export is generated from. Keeping them in step means a
 * printed report is never a narrower view of the exported one — previously the
 * print view dropped phone, national ID, institution, qualification, ATS score
 * and both clearance timestamps, so a printed copy was missing information the
 * CSV had.
 */
const ATTACHEE_PRINT_KEYS = [
    'applicant_name', 'username', 'applicant_email', 'phone_number', 'id_number',
    'county_of_residence', 'institution_name', 'qualification', 'field_of_study',
    'opportunity_type', 'job_title', 'department_name', 'job_location', 'duration_weeks',
    'application_date', 'deployment_start_date', 'deployment_end_date', 'ats_score',
    'clearance_status', 'department_cleared', 'department_cleared_at',
    'hr_cleared', 'hr_cleared_by', 'hr_cleared_at', 'final_report_submitted',
    'recommendation_letter', 'is_completed', 'completion_date', 'is_archived',
];

const ATTACHEE_PRINT_HEADERS = [
    'Attachee Name', 'Username', 'Email', 'Phone', 'National ID', 'County',
    'Institution', 'Qualification', 'Field of Study', 'Opportunity Type',
    'Vacancy Title', 'Department', 'Location', 'Duration (Weeks)',
    'Application Date', 'Deployment Start', 'Deployment End', 'ATS Score (%)',
    'Clearance Status', 'Department Cleared', 'Department Clearance Date',
    'HR Approved', 'HR Cleared By', 'HR Clearance Date', 'Final Report',
    'Recommendation Letter', 'Completed', 'Completion Date', 'Archived',
];

const FILL_RATE_PRINT_KEYS = [
    'title', 'department_name', 'opportunity_type', 'location', 'slots_required',
    'slots_filled', 'slots_remaining', 'fill_rate', 'duration_weeks', 'created_at',
    'deadline', 'is_full', 'is_archived',
];

const FILL_RATE_PRINT_HEADERS = [
    'Vacancy Title', 'Department', 'Opportunity Type', 'Location', 'Slots Required',
    'Slots Filled', 'Slots Remaining', 'Fill Rate (%)', 'Duration (Weeks)',
    'Posted On', 'Deadline', 'Capacity Full', 'Archived',
];

export default function Reports() {
    const userRole = useAuthStore(state => state.user?.role);
    const [activeTab, setActiveTab] = useState('attachees'); // 'attachees' | 'fill_rates'
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Attachees Report State & Filters
    const [attacheesData, setAttacheesData] = useState([]);
    const [attacheeDept, setAttacheeDept] = useState('ALL');
    const [attacheeStatus, setAttacheeStatus] = useState('ALL');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Fill Rates Report State & Filters
    const [fillRatesData, setFillRatesData] = useState([]);
    const [fillDept, setFillDept] = useState('ALL');

    useEffect(() => {
        if (['ADMIN', 'HR'].includes(userRole)) {
            fetchDepartments();
        } else {
            setLoading(false);
        }
    }, [userRole]);

    useEffect(() => {
        if (!['ADMIN', 'HR'].includes(userRole)) return;
        if (activeTab === 'attachees') {
            fetchAttacheesReport();
        } else {
            fetchFillRatesReport();
        }
    }, [activeTab, attacheeDept, attacheeStatus, startDate, endDate, fillDept, userRole]);

    const fetchDepartments = async () => {
        try {
            const res = await api.get('jobs/departments/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setDepartments(data);
        } catch (err) {
            console.error('Failed to load departments:', err);
        }
    };

    const fetchAttacheesReport = async () => {
        try {
            setLoading(true);
            let url = 'jobs/reports/attachees/?';
            if (attacheeDept !== 'ALL') url += `department=${attacheeDept}&`;
            if (attacheeStatus !== 'ALL') url += `status=${attacheeStatus}&`;
            if (startDate) url += `start_date=${startDate}&`;
            if (endDate) url += `end_date=${endDate}&`;

            const res = await api.get(url);
            setAttacheesData(res.data?.attachees || []);
        } catch (err) {
            console.error('Failed to load attachees report:', err);
            setAttacheesData([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchFillRatesReport = async () => {
        try {
            setLoading(true);
            let url = 'jobs/reports/fill-rates/?';
            if (fillDept !== 'ALL') url += `department=${fillDept}&`;

            const res = await api.get(url);
            setFillRatesData(res.data?.vacancies || []);
        } catch (err) {
            console.error('Failed to load fill rates report:', err);
            setFillRatesData([]);
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = async (reportType) => {
        try {
            let url = `jobs/reports/export-csv/?report_type=${reportType}&`;
            if (reportType === 'attachees') {
                if (attacheeDept !== 'ALL') url += `department=${attacheeDept}&`;
                if (attacheeStatus !== 'ALL') url += `status=${attacheeStatus}&`;
                if (startDate) url += `start_date=${startDate}&`;
                if (endDate) url += `end_date=${endDate}&`;
            } else {
                if (fillDept !== 'ALL') url += `department=${fillDept}&`;
            }

            const res = await api.get(url, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.setAttribute('download', `${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (err) {
            console.error('CSV Export failed:', err);
            alert('Failed to export CSV report.');
        }
    };

    if (!['ADMIN', 'HR'].includes(userRole)) {
        return (
            <div className="text-center p-10 font-bold text-red-500 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10">
                Access Denied. HR or Admin Privileges Required.
            </div>
        );
    }

    // Computed metrics for Attachees
    const totalAttachees = attacheesData.length;
    const clearedAttachees = attacheesData.filter(a => a.clearance_status === 'CLEARED').length;
    // Clearance is a two-stage flow, so "pending" covers both review stages.
    // These were previously counted against 'PENDING_HR_REVIEW', which is not a
    // Clearance.STATUS_CHOICES value -- the real one is 'PENDING_HR' -- so this
    // figure was always zero. Backend staffings.clearance_bucket_counts counts
    // the same two statuses for the same reason.
    const pendingAttachees = attacheesData.filter(
        a => a.clearance_status === 'PENDING_HR' || a.clearance_status === 'PENDING_DEPARTMENT'
    ).length;

    // Computed metrics for Fill Rates
    const totalVacancies = fillRatesData.length;
    const totalSlots = fillRatesData.reduce((sum, v) => sum + (v.slots_required || 0), 0);
    const totalFilled = fillRatesData.reduce((sum, v) => sum + (v.slots_filled || 0), 0);
    const overallFillRate = totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0;

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="Institutional Reports & Analytics"
                subtitle="Track attachee clearance metrics, vacancy slot capacities, and export official CSV records."
                badge="Analytics & Audits"
                workflowKey="hr-workflow"
                currentStep={4}
                roleTips={{
                    ADMIN: "Monitor overall institutional attachment metrics, track department slot fill rates, and export CSV compliance logs.",
                    HR: "Review attachee clearance records across all departments, audit vacancy capacity utilization, and export official reports."
                }}
                actions={
                    <div className="flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm text-xs font-bold">
                        <button
                            onClick={() => setActiveTab('attachees')}
                            className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'attachees' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            Attachees & Clearance
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

            {/* TAB 1: Attachees Report */}
            {activeTab === 'attachees' && (
                <div className="space-y-6">
                    {/* Summary Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Successful Attachees</p>
                                <h3 className="text-3xl font-black text-slate-900 mt-1">{totalAttachees}</h3>
                            </div>
                            <div className="w-12 h-12 bg-primary-50 text-primary-700 border border-primary-200 rounded-xl flex items-center justify-center font-bold text-xl">
                                👥
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Fully Cleared</p>
                                <h3 className="text-3xl font-black text-emerald-700 mt-1">{clearedAttachees}</h3>
                            </div>
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center justify-center font-bold text-xl">
                                ✅
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                            <div>
                                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Awaiting HR Review</p>
                                <h3 className="text-3xl font-black text-primary-600 mt-1">{pendingAttachees}</h3>
                            </div>
                            <div className="w-12 h-12 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl flex items-center justify-center font-bold text-xl">
                                ⏳
                            </div>
                        </div>
                    </div>

                    {/* Filter Bar & Export */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">Department</label>
                                <select
                                    value={attacheeDept}
                                    onChange={(e) => setAttacheeDept(e.target.value)}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                                >
                                    <option value="ALL">All Departments</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">Clearance Status</label>
                                <select
                                    value={attacheeStatus}
                                    onChange={(e) => setAttacheeStatus(e.target.value)}
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
                                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">From Date</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3.5 py-2 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">To Date</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3.5 py-2 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => printTable(
                                    'Attachee Clearance Report',
                                    'Successful attachees with full placement, clearance and completion details',
                                    ATTACHEE_PRINT_HEADERS,
                                    attacheesData.map(a => ATTACHEE_PRINT_KEYS.map(key => a[key])),
                                    { emptyCell: 'Not recorded' }
                                )}
                                className="px-5 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print Report
                            </button>
                            <button
                                onClick={() => handleExportCSV('attachees')}
                                className="px-5 py-3 bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Attachees Data Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading ? (
                            <div className="p-16 flex justify-center items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                            </div>
                        ) : attacheesData.length === 0 ? (
                            <div className="p-16 text-center text-slate-600">
                                <p className="text-base font-bold text-slate-800">No attachees found for the selected filters.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-primary-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Attachee Name & Email</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Department</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Vacancy Title</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Application Date</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Clearance Status</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">HR Cleared By</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                        {attacheesData.map((a, idx) => (
                                            <tr key={idx} className="hover:bg-amber-50/40 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-extrabold text-slate-900">{a.applicant_name}</div>
                                                    <div className="text-xs text-slate-600 font-medium">{a.applicant_email}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-xs font-bold text-primary-800 bg-primary-50 px-3 py-1 rounded-md border border-primary-200">
                                                        {a.department_name}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap font-bold text-slate-900">
                                                    {a.job_title}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-bold">
                                                    {a.application_date ? new Date(a.application_date).toLocaleDateString() : 'N/A'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-3 py-1 text-xs font-extrabold uppercase rounded-full border ${
                                                        a.clearance_status === 'CLEARED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                                        (a.clearance_status === 'PENDING_HR' || a.clearance_status === 'PENDING_DEPARTMENT') ? 'bg-amber-50 text-amber-800 border-amber-300' :
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
                                                            <div className="text-2xs text-slate-600 font-medium">{new Date(a.hr_cleared_at).toLocaleDateString()}</div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 font-bold italic">—</span>
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
            )}

            {/* TAB 2: Fill Rates Report */}
            {activeTab === 'fill_rates' && (
                <div className="space-y-6">
                    {/* Summary Metric Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total Vacancies</p>
                            <h3 className="text-3xl font-black text-slate-900 mt-1">{totalVacancies}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total Capacity Slots</p>
                            <h3 className="text-3xl font-black text-primary-700 mt-1">{totalSlots}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total Slots Filled</p>
                            <h3 className="text-3xl font-black text-emerald-700 mt-1">{totalFilled}</h3>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Overall Fill Rate</p>
                            <h3 className="text-3xl font-black text-slate-900 mt-1">{overallFillRate}%</h3>
                        </div>
                    </div>

                    {/* Filter Bar & Export */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-700 mb-1.5">Department</label>
                                <select
                                    value={fillDept}
                                    onChange={(e) => setFillDept(e.target.value)}
                                    className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3.5 py-2.5 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/20"
                                >
                                    <option value="ALL">All Departments</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => printTable(
                                    'Vacancy Fill Rates Report',
                                    'Slot capacity utilization across all departments',
                                    FILL_RATE_PRINT_HEADERS,
                                    fillRatesData.map(v => FILL_RATE_PRINT_KEYS.map(key => v[key])),
                                    { emptyCell: 'Not recorded' }
                                )}
                                className="px-5 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print Report
                            </button>
                            <button
                                onClick={() => handleExportCSV('fill_rates')}
                                className="px-5 py-3 bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white text-xs font-extrabold rounded-xl shadow-md flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Fill Rates Data Table */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {loading ? (
                            <div className="p-16 flex justify-center items-center">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                            </div>
                        ) : fillRatesData.length === 0 ? (
                            <div className="p-16 text-center text-slate-600">
                                <p className="text-base font-bold text-slate-800">No vacancy fill rate data available.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-primary-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Department</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Vacancy Title</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Type</th>
                                            <th className="px-6 py-4 text-center text-xs font-black text-slate-800 uppercase tracking-wider">Required Slots</th>
                                            <th className="px-6 py-4 text-center text-xs font-black text-slate-800 uppercase tracking-wider">Filled Slots</th>
                                            <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Fill Rate %</th>
                                            <th className="px-6 py-4 text-right text-xs font-black text-slate-800 uppercase tracking-wider">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                        {fillRatesData.map((v, idx) => (
                                            <tr key={idx} className="hover:bg-amber-50/40 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-xs font-bold text-primary-800 bg-primary-50 px-3 py-1 rounded-md border border-primary-200">
                                                        {v.department_name}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap font-extrabold text-slate-900">
                                                    {v.title}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700 font-bold uppercase">
                                                    {v.job_type?.replace(/_/g, ' ')}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center font-black text-slate-800">
                                                    {v.slots_required}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-center font-black text-emerald-700">
                                                    {v.slots_filled}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-24 bg-slate-200 rounded-full h-2.5 overflow-hidden">
                                                            <div
                                                                className={`h-2.5 rounded-full ${v.fill_rate >= 100 ? 'bg-red-500' : 'bg-primary-600'}`}
                                                                style={{ width: `${Math.min(v.fill_rate || 0, 100)}%` }}
                                                            ></div>
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
}
