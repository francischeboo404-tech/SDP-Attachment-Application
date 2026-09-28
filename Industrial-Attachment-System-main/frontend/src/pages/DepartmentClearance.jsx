import React, { useState, useEffect } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import { exportToCSV, printTable } from '../utils/downloadUtils';

export default function DepartmentClearance() {
    const user = useAuthStore(state => state.user);
    const userRole = user?.role;
    const [clearances, setClearances] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter
    const [selectedDept, setSelectedDept] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    // Review Modal State
    const [selectedClearance, setSelectedClearance] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState('');

    useEffect(() => {
        if (['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole)) {
            fetchClearanceQueue();
            fetchDepartments();
        } else {
            setLoading(false);
        }
    }, [userRole, selectedDept]);

    const fetchClearanceQueue = async () => {
        try {
            setLoading(true);
            let url = 'jobs/clearance/department-queue/?';
            if (selectedDept !== 'ALL') url += `department=${selectedDept}&`;

            const res = await api.get(url);
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setClearances(data);
        } catch (err) {
            console.error('Failed to load department clearance queue:', err);
            setClearances([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchDepartments = async () => {
        try {
            const res = await api.get('jobs/departments/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setDepartments(data);
        } catch (err) {
            console.error('Failed to load departments:', err);
        }
    };

    const handleReviewDecision = async (decision) => {
        if (!selectedClearance) return;

        try {
            setIsSubmitting(true);
            await api.post(`jobs/clearance/${selectedClearance.id}/department-review/`, {
                decision: decision,
                department_notes: reviewNotes,
            });

            setNotification(
                decision === 'APPROVE'
                    ? `Department clearance granted for ${selectedClearance.applicant_name}. Forwarded to HR queue.`
                    : `Revision requested for ${selectedClearance.applicant_name}.`
            );
            setSelectedClearance(null);
            setReviewNotes('');
            fetchClearanceQueue();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Department review failed:', err);
            alert(err.response?.data?.detail || 'Failed to submit department review.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole)) {
        return (
            <div className="text-center p-10 font-bold text-red-500 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10">
                Access Denied. Department Supervisor or HR Privileges Required.
            </div>
        );
    }

    const filteredClearances = clearances.filter(c => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            c.applicant_name?.toLowerCase().includes(term) ||
            c.department_name?.toLowerCase().includes(term) ||
            c.job_title?.toLowerCase().includes(term)
        );
    });

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16">
            {notification && (
                <div className="fixed top-20 right-4 md:right-8 z-50 bg-green-50 border-l-4 border-green-500 p-4 rounded-xl shadow-lg flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-green-800 text-sm font-bold">{notification}</p>
                </div>
            )}

            <PageGuideHeader
                title="Stage 1: Department Clearance Queue"
                subtitle="Department supervisor verification of final student attachment logbooks, project deliverables, and ministry asset returns."
                badge="Stage 1 Clearance"
                workflowKey="director-workflow"
                currentStep={5}
                roleTips={{
                    DEPARTMENT_DIRECTOR: "Verify student project submissions and logbooks for attachees in your department to advance their record to Stage 2 HR Clearance.",
                    HR: "HR overview of Stage 1 Department Sign-offs currently awaiting or granted departmental review."
                }}
            />

            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="relative w-full sm:w-80">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search attachees by name or task..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-600 shadow-sm"
                    />
                    <svg className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                {['ADMIN', 'HR'].includes(userRole) && (
                    <select
                        value={selectedDept}
                        onChange={(e) => setSelectedDept(e.target.value)}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-extrabold rounded-xl px-3.5 py-2.5 shadow-sm focus:outline-none focus:border-primary-600"
                    >
                        <option value="ALL">All Departments</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                    </select>
                )}

                {filteredClearances.length > 0 && (
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={() => exportToCSV(
                                'dept_clearance_queue',
                                ['Attachee', 'Department', 'Role', 'Status', 'Dept Cleared', 'Submitted'],
                                filteredClearances.map(c => [
                                    c.applicant_name, c.department_name, c.job_title,
                                    (c.status || '').replace(/_/g, ' '),
                                    c.department_cleared ? 'Yes' : 'No',
                                    c.created_at ? new Date(c.created_at).toLocaleDateString() : ''
                                ]),
                                {
                                    reportTitle: 'Department Clearance Queue',
                                    subtitle: 'Stage 1 sign-off records — Attachment logbook verifications'
                                }
                            )}
                            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm flex items-center gap-2 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export CSV
                        </button>
                        <button
                            onClick={() => printTable(
                                'Department Clearance Queue',
                                'Stage 1 sign-off records — attachment logbook verifications',
                                ['Attachee', 'Department', 'Role', 'Status', 'Dept Cleared'],
                                filteredClearances.map(c => [
                                    c.applicant_name, c.department_name, c.job_title,
                                    (c.status || '').replace(/_/g, ' '),
                                    c.department_cleared ? 'Yes' : 'No'
                                ])
                            )}
                            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm flex items-center gap-2 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                            </svg>
                            Print
                        </button>
                    </div>
                )}
            </div>

            {/* Queue Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-20 text-center flex justify-center items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                    </div>
                ) : filteredClearances.length === 0 ? (
                    <div className="p-16 text-center text-slate-600">
                        <div className="w-16 h-16 bg-primary-50 text-primary-700 border border-primary-200 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 mb-1">Queue is Clear</h3>
                        <p className="text-sm font-semibold text-slate-600">No attachee submissions are currently pending departmental sign-off.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-primary-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Attachee Details</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Department</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Attachment Report</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Stage Status</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-slate-800 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                {filteredClearances.map(c => (
                                    <tr key={c.id} className="hover:bg-amber-50/40 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-black text-slate-900">{c.applicant_name}</div>
                                            <div className="text-xs text-slate-600 font-semibold">{c.applicant_email}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-xs font-black text-primary-900 bg-primary-50 px-3 py-1 rounded-md border border-primary-200">
                                                {c.department_name}
                                            </span>
                                            <div className="text-xs text-slate-700 font-bold mt-1">{c.job_title}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {c.final_report_file ? (
                                                <a
                                                    href={c.final_report_file}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-primary-50 text-primary-900 hover:bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-extrabold rounded-lg text-xs transition-all border border-primary-200"
                                                >
                                                    <svg className="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                                    </svg>
                                                    Download Document
                                                </a>
                                            ) : (
                                                <span className="text-xs text-slate-500 font-medium italic">No document attached</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 text-xs font-black uppercase rounded-full border ${
                                                c.status === 'PENDING_DEPARTMENT' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                                                c.status === 'REJECTED' ? 'bg-red-50 text-red-800 border-red-300' :
                                                'bg-slate-100 text-slate-800 border-slate-300'
                                            }`}>
                                                {c.status.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                                            <button
                                                onClick={() => {
                                                    setSelectedClearance(c);
                                                    setReviewNotes(c.department_notes || '');
                                                }}
                                                className="px-5 py-2.5 bg-gradient-to-r from-primary-700 to-primary-600 hover:from-primary-800 hover:to-primary-700 text-white font-extrabold rounded-xl shadow-md transition-all transform hover:-translate-y-0.5"
                                            >
                                                Review & Clear
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Department Review Modal */}
            {selectedClearance && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animation-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-8 border-t-primary-500">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                            <div>
                                <span className="text-xs font-black uppercase tracking-wider text-primary-700 bg-primary-50 px-2.5 py-0.5 rounded border border-primary-100 inline-block mb-1">
                                     Stage 1: Department Sign-off
                                </span>
                                <h3 className="text-2xl font-black text-gray-900">{selectedClearance.applicant_name}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Department: <strong>{selectedClearance.department_name}</strong> &bull; {selectedClearance.job_title}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedClearance(null)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            {/* Attachee Notes */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Attachee Summary & Deliverables:</h4>
                                <p className="text-sm text-gray-800 font-medium">
                                    {selectedClearance.user_notes || 'No custom notes provided by attachee.'}
                                </p>
                            </div>

                            {/* Download Document */}
                            {selectedClearance.final_report_file && (
                                <div className="p-4 bg-primary-50 rounded-xl border border-primary-200 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-white rounded-lg shadow-sm text-red-500">
                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-gray-900">Final Logbook / Attachment Report</div>
                                            <div className="text-xs text-primary-700">Official candidate upload</div>
                                        </div>
                                    </div>
                                    <a
                                        href={selectedClearance.final_report_file}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] text-xs font-bold rounded-lg shadow-sm"
                                    >
                                        Download Report
                                    </a>
                                </div>
                            )}

                            {/* Supervisor Evaluation */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                                    Department Supervisor Evaluation & Remarks
                                </label>
                                <textarea
                                    rows="3"
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    placeholder="Confirm logbook completion, technical assessment, and return of departmental assets..."
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedClearance(null)}
                                className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl text-sm hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleReviewDecision('REJECT')}
                                className="px-5 py-2.5 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white border border-red-200 font-bold rounded-xl text-sm transition-all"
                            >
                                Request Revision
                            </button>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleReviewDecision('APPROVE')}
                                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center gap-2"
                            >
                                {isSubmitting ? 'Approving...' : '✓ Approve Department Clearance'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
