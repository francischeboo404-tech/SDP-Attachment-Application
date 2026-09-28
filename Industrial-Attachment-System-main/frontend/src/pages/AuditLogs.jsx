import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import PageGuideHeader from '../components/PageGuideHeader';
import { exportToCSV, printTable } from '../utils/downloadUtils';

const ACTION_LABELS = {
    DEPARTMENT_CREATED: { label: 'Department Created', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    DEPARTMENT_UPDATED: { label: 'Department Updated', bg: 'bg-accent-50', text: 'text-accent-800', border: 'border-accent-200' },
    DEPARTMENT_DEACTIVATED: { label: 'Department Deactivated', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    DEPARTMENT_DELETED: { label: 'Department Deleted', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
    ROLE_CHANGED: { label: 'User Role Changed', bg: 'bg-primary-50', text: 'text-primary-800', border: 'border-primary-200' },
    USER_ACTIVATED: { label: 'User Activated', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    USER_DEACTIVATED: { label: 'User Deactivated', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
    REQUISITION_APPROVED: { label: 'Requisition Approved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    REQUISITION_REJECTED: { label: 'Requisition Rejected', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
    DEPARTMENT_CLEARANCE_APPROVED: { label: 'Dept Clearance Approved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    HR_CLEARANCE_APPROVED: { label: 'HR Clearance Approved', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    DEPLOYMENT_CREATED: { label: 'Student Deployed', bg: 'bg-accent-50', text: 'text-accent-800', border: 'border-accent-200' },
    RECOMMENDATION_LETTER_GENERATED: { label: 'Letter Generated', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
    PASSWORD_CHANGED: { label: 'Password Changed', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    SETTINGS_VIEWED: { label: 'Settings Viewed', bg: 'bg-slate-50', text: 'text-slate-800', border: 'border-slate-200' },
    SETTINGS_CREATED: { label: 'Settings Created', bg: 'bg-accent-50', text: 'text-accent-800', border: 'border-accent-200' },
    SETTINGS_UPDATED: { label: 'Settings Updated', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
    SETTINGS_DELETED: { label: 'Settings Deleted', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
    RECORD_RESTORED: { label: 'Record Restored', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
    RECORD_PURGED: { label: 'Record Purged', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200' },
};

export default function AuditLogs() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAction, setSelectedAction] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selectedLog, setSelectedLog] = useState(null);

    const fetchAuditLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedAction !== 'ALL') params.append('action', selectedAction);
            if (searchQuery.trim()) params.append('search', searchQuery.trim());
            if (dateFrom) params.append('date_from', dateFrom);
            if (dateTo) params.append('date_to', dateTo);

            const res = await api.get(`accounts/audit-logs/?${params.toString()}`);
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setLogs(data);
        } catch (err) {
            console.error('Failed to load audit logs:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedAction, searchQuery, dateFrom, dateTo]);

    useEffect(() => {
        fetchAuditLogs();
    }, [fetchAuditLogs]);

    const getActionBadge = (action) => {
        const config = ACTION_LABELS[action] || { label: action.replace(/_/g, ' '), bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200' };
        return (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${config.bg} ${config.text} ${config.border}`}>
                {config.label}
            </span>
        );
    };

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="System Audit Trail & Security Logs"
                subtitle="Immutable compliance record of all administrative operations, role modifications, clearance approvals, and security events."
                badge="Compliance & Governance"
                workflowKey="hr-journey"
                currentStep={4}
                roleTips={{
                    ADMIN: "Audit logs are strictly read-only and immutable. Every sensitive state change and credential access is cryptographically tracked."
                }}
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchAuditLogs}
                            disabled={loading}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-4 py-2 rounded-xl transition-all shadow-xs"
                        >
                            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Refresh Trail</span>
                        </button>
                        {logs.length > 0 && (
                            <>
                                <button
                                    onClick={() => exportToCSV(
                                        'audit_trail',
                                        ['Timestamp', 'Action', 'Actor', 'Description', 'IP Address'],
                                        logs.map(l => [
                                            l.timestamp ? new Date(l.timestamp).toLocaleString() : '',
                                            (l.action || '').replace(/_/g, ' '),
                                            l.actor_username || l.actor_name || '',
                                            l.description || l.detail || '',
                                            l.ip_address || ''
                                        ]),
                                        {
                                            reportTitle: 'Industrial Attachment System — Audit Trail',
                                            subtitle: 'Immutable compliance log of all administrative operations, security events and role modifications'
                                        }
                                    )}
                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-4 py-2 rounded-xl transition-all shadow-xs"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    <span>Export CSV</span>
                                </button>
                                <button
                                    onClick={() => printTable(
                                        'System Audit Trail',
                                        'Immutable compliance log of all administrative operations',
                                        ['Timestamp', 'Action', 'Actor', 'Description'],
                                        logs.map(l => [
                                            l.timestamp ? new Date(l.timestamp).toLocaleString() : '',
                                            (l.action || '').replace(/_/g, ' '),
                                            l.actor_username || l.actor_name || '',
                                            l.description || l.detail || ''
                                        ]),
                                        { orientation: 'landscape' }
                                    )}
                                    className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 px-4 py-2 rounded-xl transition-all shadow-xs"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                    </svg>
                                    <span>Print</span>
                                </button>
                            </>
                        )}
                    </div>
                }
            />

            {/* Filter Bar */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm mb-8">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Filter Action</label>
                        <select
                            value={selectedAction}
                            onChange={(e) => setSelectedAction(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        >
                            <option value="ALL">All Action Events</option>
                            <option value="DEPARTMENT_CREATED">Department Created</option>
                            <option value="DEPARTMENT_UPDATED">Department Updated</option>
                            <option value="ROLE_CHANGED">User Role Changed</option>
                            <option value="USER_ACTIVATED">User Activated / Deactivated</option>
                            <option value="REQUISITION_APPROVED">Requisition Approved</option>
                            <option value="DEPARTMENT_CLEARANCE_APPROVED">Dept Clearance Approved</option>
                            <option value="HR_CLEARANCE_APPROVED">HR Clearance Approved</option>
                            <option value="RECOMMENDATION_LETTER_GENERATED">Letter Generated</option>
                            <option value="PASSWORD_CHANGED">Password Changed</option>
                            <option value="SETTINGS_VIEWED">Settings Viewed</option>
                            <option value="SETTINGS_UPDATED">Settings Updated</option>
                            <option value="RECORD_RESTORED">Record Restored</option>
                            <option value="RECORD_PURGED">Record Purged</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Date From</label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Date To</label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Search Trail</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search actor, description, IP..."
                                className="w-full p-3 pl-9 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Audit Log Table */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-900 text-base">Recorded Audit Events</h3>
                    <span className="text-xs text-slate-500 font-bold">{logs.length} logged event(s)</span>
                </div>

                {loading ? (
                    <div className="p-16 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="p-16 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h4 className="text-base font-black text-slate-900 mb-1">No Audit Logs Found</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            No security or administrative events match the selected criteria.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-black tracking-wider">
                                <tr>
                                    <th className="px-6 py-3.5">Timestamp</th>
                                    <th className="px-6 py-3.5">Action Event</th>
                                    <th className="px-6 py-3.5">Actor (User)</th>
                                    <th className="px-6 py-3.5">Description</th>
                                    <th className="px-6 py-3.5">IP Address</th>
                                    <th className="px-6 py-3.5 text-right">Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-mono text-2xs">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getActionBadge(log.action)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-bold text-slate-900">{log.actor_username}</div>
                                            {log.actor_role && (
                                                <div className="text-2xs text-slate-400 font-semibold">{log.actor_role}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-slate-800 font-semibold max-w-md truncate">{log.target_description}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap font-mono text-2xs text-slate-500">
                                            {log.ip_address || 'Internal'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <button
                                                onClick={() => setSelectedLog(log)}
                                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all"
                                            >
                                                Inspect
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Read-only Inspection Modal */}
            {selectedLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-xl w-full p-6 sm:p-8 animate-scale-up max-h-[90vh] flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-black text-slate-900">Audit Event #{selectedLog.id}</h3>
                                    {getActionBadge(selectedLog.action)}
                                </div>
                                <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-slate-700 text-lg">&times;</button>
                            </div>

                            <div className="space-y-3 text-xs mb-4">
                                <div>
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Target Description:</span>
                                    <span className="text-slate-900 font-bold text-sm">{selectedLog.target_description}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Actor:</span>
                                        <span className="text-slate-800 font-semibold">{selectedLog.actor_username} ({selectedLog.actor_role || 'System'})</span>
                                    </div>
                                    <div>
                                        <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Client IP Address:</span>
                                        <span className="text-slate-800 font-mono">{selectedLog.ip_address || 'Internal/Proxy'}</span>
                                    </div>
                                </div>
                                <div>
                                    <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block">Timestamp:</span>
                                    <span className="text-slate-700 font-mono">{new Date(selectedLog.created_at).toLocaleString()}</span>
                                </div>
                            </div>

                            <div>
                                <span className="font-bold text-slate-500 uppercase tracking-wider text-2xs block mb-1.5">Sanitized Metadata & Parameters:</span>
                                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-2xs font-mono overflow-x-auto max-h-56">
                                    {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                                </pre>
                            </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setSelectedLog(null)}
                                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-black transition-all shadow-xs"
                            >
                                Close Audit Inspector
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
