import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import { exportToCSV, printTable } from '../utils/downloadUtils';
import { archiveHeaders, archiveRows, formatArchiveCell } from '../utils/archiveUtils';

export default function Archives() {
    const userRole = useAuthStore(state => state.user?.role || '');
    const isAdmin = userRole === 'ADMIN';

    const [loading, setLoading] = useState(true);
    const [archivedData, setArchivedData] = useState({ counts: {}, results: [] });
    const [selectedType, setSelectedType] = useState('ALL');
    const [selectedDepartment, setSelectedDepartment] = useState('ALL');
    const [departments, setDepartments] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);

    // Modal States
    const [restoreModal, setRestoreModal] = useState({ open: false, item: null });
    const [purgeModal, setPurgeModal] = useState({ open: false, item: null, confirmInput: '' });
    const [detailModal, setDetailModal] = useState({ open: false, item: null });

    const hasActiveFilters = Boolean(
        selectedType !== 'ALL' || selectedDepartment !== 'ALL' ||
        searchQuery.trim() || dateFrom || dateTo
    );

    const clearFilters = () => {
        setSelectedType('ALL');
        setSelectedDepartment('ALL');
        setSearchQuery('');
        setDateFrom('');
        setDateTo('');
    };

    const fetchArchives = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedType !== 'ALL') params.append('type', selectedType);
            if (selectedDepartment !== 'ALL') params.append('department', selectedDepartment);
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);

            const res = await api.get(`jobs/archives/?${params.toString()}`);
            setArchivedData(res.data);
            setFeedback(null);
        } catch (err) {
            console.error('Failed to load archives:', err);
            const status = err?.response?.status;
            if (status === 400) {
                setFeedback({ type: 'error', text: err.response?.data?.detail || 'The archive filters are not valid.' });
            } else {
                setFeedback({ type: 'error', text: 'Failed to fetch archived records.' });
            }
        } finally {
            setLoading(false);
        }
    }, [selectedType, selectedDepartment, searchQuery, dateFrom, dateTo]);

    const fetchDepartments = async () => {
        try {
            const res = await api.get('jobs/departments/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setDepartments(data);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    useEffect(() => {
        fetchArchives();
    }, [fetchArchives]);

    const handleRestore = async () => {
        if (!restoreModal.item) return;
        setActionLoading(true);
        try {
            const { entity_type, id } = restoreModal.item;
            const res = await api.post(`jobs/archives/${entity_type.toLowerCase()}/${id}/restore/`);
            setFeedback({ type: 'success', text: res.data.detail || 'Record successfully restored to active status.' });
            setRestoreModal({ open: false, item: null });
            fetchArchives();
        } catch (err) {
            console.error(err);
            setFeedback({ type: 'error', text: err.response?.data?.detail || 'Failed to restore record.' });
        } finally {
            setActionLoading(false);
        }
    };

    const handlePurge = async () => {
        if (!purgeModal.item) return;
        if (purgeModal.confirmInput !== 'PERMANENTLY DELETE') {
            alert("Please type 'PERMANENTLY DELETE' to confirm permanent purge.");
            return;
        }
        setActionLoading(true);
        try {
            const { entity_type, id } = purgeModal.item;
            const res = await api.delete(`jobs/archives/${entity_type.toLowerCase()}/${id}/purge/`);
            setFeedback({ type: 'success', text: res.data.detail || 'Record permanently deleted from database.' });
            setPurgeModal({ open: false, item: null, confirmInput: '' });
            fetchArchives();
        } catch (err) {
            console.error(err);
            setFeedback({ type: 'error', text: err.response?.data?.detail || 'Failed to purge record.' });
        } finally {
            setActionLoading(false);
        }
    };

    const getTypeBadge = (type) => {
        switch (type) {
            case 'VACANCY':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-accent-50 text-accent-800 border border-accent-200">Vacancy</span>;
            case 'APPLICATION':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-primary-50 text-primary-800 border border-primary-200">Application</span>;
            case 'ATTACHMENT':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">Completed Attachee</span>;
            case 'DEPARTMENT':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-300">Department</span>;
            default:
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-200">{type}</span>;
        }
    };

    // A completed attachee record is permanent institutional history: it can be
    // restored if it was archived in error, but never purged, because purging
    // would cascade away the deployment, clearance and uploaded final report.
    const isPurgeable = (item) => item?.entity_type !== 'ATTACHMENT';

    const archiveTableRows = () => archiveRows(archivedData.results);

    const ATTACHMENT_DETAIL_FIELDS = [
        ['Attachee', 'attachee_name'],
        ['Email', 'email'],
        ['Phone', 'phone_number'],
        ['National ID', 'id_number'],
        ['Institution', 'institution_name'],
        ['Qualification', 'qualification'],
        ['Field of Study', 'field_of_study'],
        ['Vacancy / Placement', 'job_title'],
        ['Duration (Weeks)', 'duration_weeks'],
        ['Application Date', 'application_date'],
        ['Deployment Start Date', 'deployment_start_date'],
        ['Deployment End Date', 'deployment_end_date'],
        ['Department Clearance Date', 'department_cleared_at'],
        ['HR Clearance Date', 'clearance_date'],
        ['Completion Date', 'completion_date'],
        ['Final Report Submitted', 'final_report_submitted'],
        ['Recommendation Letter', 'recommendation_letter'],
    ];

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="System Archives & Records Management"
                subtitle="Centralized management of archived vacancies, closed applications, completed attachees, and retired department profiles. Restore records or securely purge old data."
                badge="Administration & HR"
                workflowKey="hr-workflow"
                currentStep={4}
                roleTips={{
                    ADMIN: "Archived records are strictly excluded from public listings and active queues. Restoring will return them to active circulation.",
                    HR: "Review archived candidate submissions and past attachment rounds. Contact Admin for permanent purge."
                }}
            />

            {/* Metrics Overview — counts reflect the active filters so the tiles
                and the table can never disagree. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 mb-8">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Archived Records</div>
                    <div className="text-3xl font-black text-slate-900">{archivedData.counts?.total || 0}</div>
                    <div className="text-2xs text-slate-400 font-medium mt-1">
                        {hasActiveFilters ? 'Matching the active filters' : 'Across all entity categories'}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Archived Vacancies</div>
                    <div className="text-3xl font-black text-accent-800">{archivedData.counts?.vacancies || 0}</div>
                    <div className="text-2xs text-slate-400 font-medium mt-1">Past deadline / closed postings</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Archived Applications</div>
                    <div className="text-3xl font-black text-primary-700">{archivedData.counts?.applications || 0}</div>
                    <div className="text-2xs text-slate-400 font-medium mt-1">Archived candidate dossiers</div>
                </div>
                <button
                    type="button"
                    onClick={() => { setSelectedType('ATTACHMENT'); setSelectedDepartment('ALL'); }}
                    className="bg-white p-6 rounded-3xl border border-emerald-200 shadow-sm text-left hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
                    title="Filter the archive to completed attachees"
                >
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1">Completed Attachees</div>
                    <div className="text-3xl font-black text-emerald-700">{archivedData.counts?.attachments || 0}</div>
                    <div className="text-2xs text-emerald-600/70 font-medium mt-1">Finished &amp; cleared — click to filter</div>
                </button>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Archived Departments</div>
                    <div className="text-3xl font-black text-amber-700">{archivedData.counts?.departments || 0}</div>
                    <div className="text-2xs text-slate-400 font-medium mt-1">Retired ministerial departments</div>
                </div>
            </div>

            {feedback && (
                <div className={`p-4 mb-6 rounded-2xl text-sm font-bold flex items-center justify-between ${
                    feedback.type === 'success' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-rose-50 text-rose-900 border border-rose-200'
                }`}>
                    <span>{feedback.text}</span>
                    <button onClick={() => setFeedback(null)} className="text-lg leading-none hover:opacity-75">&times;</button>
                </div>
            )}

            {/* Filter & Search Bar */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-8 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="archive-type" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Filter By Entity Type</label>
                        <select
                            id="archive-type"
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value="ALL">All Entity Types</option>
                            <option value="VACANCY">Vacancies / Job Postings</option>
                            <option value="APPLICATION">Student Applications</option>
                            <option value="ATTACHMENT">Completed Attachees</option>
                            <option value="DEPARTMENT">Departments</option>
                        </select>
                    </div>

                    <div>
                        <label htmlFor="archive-department" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Filter By Department</label>
                        <select
                            id="archive-department"
                            value={selectedDepartment}
                            onChange={(e) => setSelectedDepartment(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value="ALL">All Departments</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="archive-search" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Search Records</label>
                        <div className="relative">
                            <input
                                id="archive-search"
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by title, name, applicant..."
                                className="w-full p-3 pl-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Archiving Date Range */}
                <div className="pt-4 border-t border-slate-100">
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <label htmlFor="archive-date-from" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Date From</label>
                            <input
                                id="archive-date-from"
                                type="date"
                                value={dateFrom}
                                max={dateTo || undefined}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-full sm:w-52 p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>
                        <div>
                            <label htmlFor="archive-date-to" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Date To</label>
                            <input
                                id="archive-date-to"
                                type="date"
                                value={dateTo}
                                min={dateFrom || undefined}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-full sm:w-52 p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>
                        <span className="text-2xs text-slate-500 font-medium pb-3">
                            Filters by the date a record was archived.
                        </span>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="ml-auto mb-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Clear All Filters
                            </button>
                        )}
                    </div>

                    {dateFrom && dateTo && dateFrom > dateTo && (
                        <p className="mt-3 text-2xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                            &quot;Date From&quot; is later than &quot;Date To&quot;. No records can match this range.
                        </p>
                    )}
                </div>
            </div>

            {/* Archives Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 text-base">Archived Records Repository</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-bold mr-2">{archivedData.results?.length || 0} record(s) found</span>
                        {(archivedData.results?.length > 0) && (
                            <>
                                <button
                                    onClick={() => exportToCSV(
                                        'system_archives',
                                        archiveHeaders(),
                                        archiveTableRows(),
                                        {
                                            reportTitle: 'System Archives — Archived Records',
                                            subtitle: 'Archived vacancies, applications, completed attachees, and department profiles'
                                        }
                                    )}
                                    className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Export CSV
                                </button>
                                <button
                                    onClick={() => printTable(
                                        'System Archives — Archived Records',
                                        'Archived vacancies, applications, completed attachees, and retired department profiles',
                                        archiveHeaders(),
                                        archiveTableRows()
                                    )}
                                    className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    Print
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="p-16 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                    </div>
                ) : archivedData.results?.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                        </div>
                        <h4 className="text-base font-black text-slate-900 mb-1">No Archived Records Found</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            No records match the current filters. Active records can be archived from their respective management modules.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-black tracking-wider">
                                <tr>
                                    <th className="px-6 py-3.5">Type</th>
                                    <th className="px-6 py-3.5">Record Title / Identifier</th>
                                    <th className="px-6 py-3.5">Department</th>
                                    <th className="px-6 py-3.5">Archived Details</th>
                                    <th className="px-6 py-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {archivedData.results.map((item) => (
                                    <tr key={`${item.entity_type}-${item.id}`} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getTypeBadge(item.entity_type)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                                            <div className="text-2xs text-slate-500 mt-0.5">{item.details}</div>
                                            {item.entity_type === 'ATTACHMENT' && (
                                                <div className="text-2xs text-emerald-700 font-semibold mt-1">
                                                    Completed {formatArchiveCell(item.completion_date, { dateOnly: true })}
                                                    {item.institution_name ? ` — ${item.institution_name}` : ''}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="font-semibold text-slate-700">{item.department_name}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                                            <div>{new Date(item.archived_at).toLocaleDateString()}</div>
                                            <div className="text-2xs text-slate-400">By: {item.archived_by}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                            <button
                                                onClick={() => setDetailModal({ open: true, item })}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                                            >
                                                Details
                                            </button>
                                            <button
                                                onClick={() => setRestoreModal({ open: true, item })}
                                                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all shadow-xs"
                                            >
                                                Restore
                                            </button>
                                            {isAdmin && isPurgeable(item) && (
                                                <button
                                                    onClick={() => setPurgeModal({ open: true, item, confirmInput: '' })}
                                                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold transition-all"
                                                >
                                                    Purge
                                                </button>
                                            )}
                                            {isAdmin && !isPurgeable(item) && (
                                                <span
                                                    className="inline-block px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold"
                                                    title="Completed attachee records are permanent institutional history and cannot be purged."
                                                >
                                                    Permanent
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Restore Confirmation Modal */}
            {restoreModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 sm:p-8 animate-scale-up">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 mb-1">Confirm Record Restoration</h3>
                        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                            Are you sure you want to restore <strong>{restoreModal.item?.title}</strong>? This action will return the {restoreModal.item?.entity_type.toLowerCase()} to active status and make it visible on public and internal listings.
                        </p>
                        <div className="flex justify-end gap-2.5">
                            <button
                                onClick={() => setRestoreModal({ open: false, item: null })}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRestore}
                                disabled={actionLoading}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-sm flex items-center gap-1.5"
                            >
                                {actionLoading ? 'Restoring...' : 'Confirm Restore'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Permanent Purge Confirmation Modal */}
            {purgeModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 sm:p-8 animate-scale-up">
                        <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-black text-rose-900 mb-1">Permanent Data Purge</h3>
                        <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                            This action <strong>CANNOT</strong> be undone. The {purgeModal.item?.entity_type.toLowerCase()} <strong>{purgeModal.item?.title}</strong> and all associated database records will be permanently deleted.
                        </p>
                        <div className="mb-4">
                            <label className="block text-2xs font-bold text-slate-700 mb-1">
                                Type <span className="font-mono text-rose-600 font-black">PERMANENTLY DELETE</span> to confirm:
                            </label>
                            <input
                                type="text"
                                value={purgeModal.confirmInput}
                                onChange={(e) => setPurgeModal(prev => ({ ...prev, confirmInput: e.target.value }))}
                                placeholder="PERMANENTLY DELETE"
                                className="w-full p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs font-mono font-bold text-rose-900 outline-none"
                            />
                        </div>
                        <div className="flex justify-end gap-2.5">
                            <button
                                onClick={() => setPurgeModal({ open: false, item: null, confirmInput: '' })}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePurge}
                                disabled={actionLoading || purgeModal.confirmInput !== 'PERMANENTLY DELETE'}
                                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black transition-all shadow-sm disabled:opacity-50"
                            >
                                {actionLoading ? 'Purging...' : 'Permanently Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Read-only Detail Modal */}
            {detailModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 sm:p-8 animate-scale-up">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900">Archived Record Details</h3>
                                {getTypeBadge(detailModal.item?.entity_type)}
                            </div>
                            <button onClick={() => setDetailModal({ open: false, item: null })} className="text-slate-400 hover:text-slate-700 text-lg">&times;</button>
                        </div>
                        <div className="space-y-3 text-xs">
                            <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Record Title:</span>
                                <span className="text-slate-900 font-black text-sm">{detailModal.item?.title}</span>
                            </div>
                            <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Department:</span>
                                <span className="text-slate-800 font-semibold">{detailModal.item?.department_name}</span>
                            </div>
                            <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Additional Details:</span>
                                <span className="text-slate-800 font-medium">{detailModal.item?.details}</span>
                            </div>
                            {detailModal.item?.entity_type === 'ATTACHMENT' && (
                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                    {ATTACHMENT_DETAIL_FIELDS.map(([label, key]) => (
                                        <div key={key}>
                                            <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">{label}:</span>
                                            <span className="text-slate-800 font-semibold">
                                                {formatArchiveCell(detailModal.item?.[key], { dateOnly: /date/i.test(key) })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                <div>
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Date Archived:</span>
                                    <span className="text-slate-700 font-semibold">{new Date(detailModal.item?.archived_at).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Archived By:</span>
                                    <span className="text-slate-700 font-semibold">{detailModal.item?.archived_by}</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setDetailModal({ open: false, item: null })}
                                className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-bold transition-all shadow-xs"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
