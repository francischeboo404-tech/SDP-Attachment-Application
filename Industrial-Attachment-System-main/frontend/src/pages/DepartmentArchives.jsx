import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import { exportToCSV, printTable } from '../utils/downloadUtils';
import { archiveHeaders, archiveRows, formatArchiveCell } from '../utils/archiveUtils';

/**
 * DepartmentArchives
 * Director-facing, strictly READ-ONLY view of the department's own archived
 * vacancies and applications.
 *
 * The department scope is applied server-side from the signed-in Director's
 * account, so there is deliberately no department picker here. Restore and
 * permanent purge remain Admin/HR-only on the backend (ArchiveRestoreView /
 * ArchivePurgeView), which is why this page exposes no mutating action at all.
 */
export default function DepartmentArchives() {
    const user = useAuthStore(state => state.user);
    const userRole = user?.role || '';
    const isDirector = ['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole);

    const [loading, setLoading] = useState(true);
    const [archivedData, setArchivedData] = useState({ counts: {}, results: [] });
    const [selectedType, setSelectedType] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [detailItem, setDetailItem] = useState(null);
    const [error, setError] = useState('');

    const hasActiveFilters = Boolean(selectedType !== 'ALL' || searchQuery.trim() || dateFrom || dateTo);

    const clearFilters = () => {
        setSelectedType('ALL');
        setSearchQuery('');
        setDateFrom('');
        setDateTo('');
    };

    const fetchArchives = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams();
            if (selectedType !== 'ALL') params.append('type', selectedType);
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);

            const res = await api.get(`jobs/archives/?${params.toString()}`);
            setArchivedData(res.data);
        } catch (err) {
            console.error('Failed to load department archives:', err);
            setArchivedData({ counts: {}, results: [] });
            setError(err.response?.data?.detail || 'Failed to fetch archived department records.');
        } finally {
            setLoading(false);
        }
    }, [selectedType, searchQuery, dateFrom, dateTo]);

    useEffect(() => {
        if (isDirector) fetchArchives();
        else setLoading(false);
    }, [isDirector, fetchArchives]);

    if (!isDirector) {
        return (
            <div className="text-center p-10 font-bold text-red-500 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10">
                Access Denied. Department Director Privileges Required.
            </div>
        );
    }

    const results = archivedData.results || [];
    const counts = archivedData.counts || {};
    const departmentName = archivedData.department?.name || 'Your Department';

    const getTypeBadge = (type) => {
        switch (type) {
            case 'VACANCY':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-accent-50 text-accent-800 border border-accent-200">Vacancy</span>;
            case 'APPLICATION':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-primary-50 text-primary-800 border border-primary-200">Application</span>;
            case 'ATTACHMENT':
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-50 text-emerald-800 border border-emerald-200">Completed Attachee</span>;
            default:
                return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-200">{type}</span>;
        }
    };

    const archiveTableRows = () => archiveRows(results);

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
                title="Department Archives"
                subtitle={`Read-only history of ${departmentName} closed vacancies, archived candidate dossiers, and attachees who completed their attachment here. Restoring or permanently deleting archived records is reserved for Admin and HR.`}
                badge="Department Director"
                workflowKey="director-workflow"
                currentStep={5}
                roleTips={{
                    DEPARTMENT_DIRECTOR: "This archive is limited to your own department and cannot be edited. Contact HR if an archived record needs to be restored.",
                }}
            />

            {error && (
                <div className="p-4 rounded-2xl text-sm font-bold bg-rose-50 text-rose-900 border border-rose-200">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Archived Records</div>
                    <div className="text-3xl font-black text-slate-900">{counts.total || 0}</div>
                    <div className="text-2xs text-slate-400 font-medium mt-1">
                        {hasActiveFilters ? `Matching filters in ${departmentName}` : `In ${departmentName}`}
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Archived Vacancies</div>
                    <div className="text-3xl font-black text-accent-800">{counts.vacancies || 0}</div>
                    <div className="text-2xs text-slate-400 font-medium mt-1">Closed postings</div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Archived Applications</div>
                    <div className="text-3xl font-black text-primary-700">{counts.applications || 0}</div>
                    <div className="text-2xs text-slate-400 font-medium mt-1">Closed candidate dossiers</div>
                </div>
                <button
                    type="button"
                    onClick={() => { setSelectedType('ATTACHMENT'); setSearchQuery(''); }}
                    className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm text-left hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors"
                    title="Filter the archive to attachees who completed their attachment in your department"
                >
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1">Completed Attachees</div>
                    <div className="text-3xl font-black text-emerald-700">{counts.attachments || 0}</div>
                    <div className="text-2xs text-emerald-600/70 font-medium mt-1">Finished &amp; cleared — click to filter</div>
                </button>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-end gap-4">
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
                    </select>
                </div>

                <div className="flex-1 min-w-[220px]">
                    <label htmlFor="archive-search" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Search Records</label>
                    <div className="relative">
                        <input
                            id="archive-search"
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by title or applicant..."
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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 text-base">Archived Department Records</h3>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 font-bold mr-2">{results.length} record(s) found</span>
                        {results.length > 0 && (
                            <>
                                <button
                                    onClick={() => exportToCSV(
                                        'department_archives',
                                        archiveHeaders(),
                                        archiveTableRows(),
                                        {
                                            reportTitle: `${departmentName} — Department Archives`,
                                            subtitle: 'Archived vacancies, candidate dossiers and completed attachees (read-only)'
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
                                        `${departmentName} — Department Archives`,
                                        'Archived vacancies, candidate dossiers and completed attachees (read-only)',
                                        archiveHeaders(),
                                        archiveTableRows()
                                    )}
                                    className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 016 0h6V5z" />
                                    </svg>
                                    Print
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {loading ? (
                    <div className="p-16 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
                    </div>
                ) : results.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                        </div>
                        <h4 className="text-base font-black text-slate-900 mb-1">No Archived Records Found</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            No archived {departmentName} records match the current filters.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-black tracking-wider">
                                <tr>
                                    <th className="px-6 py-3.5">Type</th>
                                    <th className="px-6 py-3.5">Record Title / Identifier</th>
                                    <th className="px-6 py-3.5">Archived Details</th>
                                    <th className="px-6 py-3.5">Date Archived</th>
                                    <th className="px-6 py-3.5 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {results.map(item => (
                                    <tr key={`${item.entity_type}-${item.id}`} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">{getTypeBadge(item.entity_type)}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900 text-sm">{item.title}</div>
                                            <div className="text-2xs text-slate-500 mt-0.5">{item.department_name}</div>
                                            {item.entity_type === 'ATTACHMENT' && (
                                                <div className="text-2xs text-emerald-700 font-semibold mt-1">
                                                    Completed {formatArchiveCell(item.completion_date, { dateOnly: true })}
                                                    {item.institution_name ? ` — ${item.institution_name}` : ''}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-500">{item.details}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                                            <div>{new Date(item.archived_at).toLocaleDateString()}</div>
                                            <div className="text-2xs text-slate-400">By: {item.archived_by}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <button
                                                onClick={() => setDetailItem(item)}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                                            >
                                                Details
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Read-only detail modal */}
            {detailItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 sm:p-8 animate-scale-up">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black text-slate-900">Archived Record Details</h3>
                                {getTypeBadge(detailItem.entity_type)}
                            </div>
                            <button onClick={() => setDetailItem(null)} className="text-slate-400 hover:text-slate-700 text-lg" aria-label="Close details">&times;</button>
                        </div>
                        <div className="space-y-3 text-xs">
                            <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Record Title:</span>
                                <span className="text-slate-900 font-black text-sm">{detailItem.title}</span>
                            </div>
                            <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Department:</span>
                                <span className="text-slate-800 font-semibold">{detailItem.department_name}</span>
                            </div>
                            <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Additional Details:</span>
                                <span className="text-slate-800 font-medium">{detailItem.details}</span>
                            </div>
                            {detailItem.entity_type === 'ATTACHMENT' && (
                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                    {ATTACHMENT_DETAIL_FIELDS.map(([label, key]) => (
                                        <div key={key}>
                                            <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">{label}:</span>
                                            <span className="text-slate-800 font-semibold">
                                                {formatArchiveCell(detailItem[key], { dateOnly: /date/i.test(key) })}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                <div>
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Date Archived:</span>
                                    <span className="text-slate-700 font-semibold">{new Date(detailItem.archived_at).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Archived By:</span>
                                    <span className="text-slate-700 font-semibold">{detailItem.archived_by}</span>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                            <p className="text-2xs text-slate-500 font-medium m-0">
                                Restoring this record requires HR or Admin privileges.
                            </p>
                            <button
                                onClick={() => setDetailItem(null)}
                                className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-bold transition-all shadow-xs shrink-0"
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
