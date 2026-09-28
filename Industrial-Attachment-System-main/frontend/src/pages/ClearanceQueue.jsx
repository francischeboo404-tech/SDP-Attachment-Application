import React, { useState, useEffect } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import PageGuideHeader from '../components/PageGuideHeader';
import { exportToCSV, printTable } from '../utils/downloadUtils';

export default function ClearanceQueue() {
    const userRole = useAuthStore(state => state.user?.role);
    const [clearances, setClearances] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('PENDING_HR');
    const [departmentFilter, setDepartmentFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    // Review Modal State
    const [selectedClearance, setSelectedClearance] = useState(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);

    // Letter Generation & Full Preview State
    const [letterModalClearance, setLetterModalClearance] = useState(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
    const [generatedLetter, setGeneratedLetter] = useState(null);
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

    // Notification State
    const [notification, setNotification] = useState('');

    useEffect(() => {
        if (['ADMIN', 'HR'].includes(userRole)) {
            fetchDepartments();
            fetchClearanceQueue();
            fetchLetterTemplates();
        } else {
            setLoading(false);
        }
    }, [userRole, statusFilter, departmentFilter]);

    const fetchDepartments = async () => {
        try {
            const res = await api.get('jobs/departments/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setDepartments(data);
        } catch (err) {
            console.error('Failed to load departments:', err);
        }
    };

    const fetchLetterTemplates = async () => {
        try {
            const res = await api.get('jobs/recommendations/templates/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setTemplates(data);
            const defaultTmpl = data.find(t => t.is_default);
            if (defaultTmpl) setSelectedTemplateId(defaultTmpl.id);
            else if (data.length > 0) setSelectedTemplateId(data[0].id);
        } catch (err) {
            console.error('Failed to load templates:', err);
        }
    };

    const fetchClearanceQueue = async () => {
        try {
            setLoading(true);
            let url = 'jobs/clearance/hr-queue/?';
            if (statusFilter !== 'ALL') {
                url += `status=${statusFilter}&`;
            }
            if (departmentFilter !== 'ALL') {
                url += `department=${departmentFilter}&`;
            }

            const res = await api.get(url);
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setClearances(data);
        } catch (err) {
            console.error('Failed to fetch clearance queue:', err);
            setClearances([]);
        } finally {
            setLoading(false);
        }
    };

    const handleReviewDecision = async (decision) => {
        if (!selectedClearance) return;

        try {
            setIsSubmittingReview(true);
            await api.post(`jobs/clearance/${selectedClearance.id}/hr-review/`, {
                decision: decision,
                hr_notes: reviewNotes
            });

            setNotification(
                decision === 'APPROVE'
                    ? `Institutional clearance granted for ${selectedClearance.applicant_name}!`
                    : `Revision requested for ${selectedClearance.applicant_name}.`
            );
            setSelectedClearance(null);
            setReviewNotes('');
            fetchClearanceQueue();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Review submission failed:', err);
            alert(err.response?.data?.detail || 'Failed to submit review decision.');
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const handleGenerateLetter = async (e) => {
        e.preventDefault();
        if (!letterModalClearance) return;

        const deploymentId = letterModalClearance.deployment;
        if (!deploymentId) {
            alert('No deployment record linked to this clearance.');
            return;
        }

        try {
            setIsGeneratingLetter(true);
            const res = await api.post(`jobs/recommendations/generate/${deploymentId}/`, {
                template_id: selectedTemplateId || undefined
            });
            setGeneratedLetter(res.data?.letter);
            setNotification('Recommendation letter generated successfully!');
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Letter generation failed:', err);
            alert(err.response?.data?.detail || 'Failed to generate recommendation letter.');
        } finally {
            setIsGeneratingLetter(false);
        }
    };

    if (!['ADMIN', 'HR'].includes(userRole)) {
        return (
            <div className="text-center p-10 font-bold text-red-500 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10">
                Access Denied. HR or Admin Privileges Required.
            </div>
        );
    }

    const filteredClearances = clearances.filter(c => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            c.applicant_name?.toLowerCase().includes(term) ||
            c.job_title?.toLowerCase().includes(term) ||
            c.department_name?.toLowerCase().includes(term)
        );
    });

    const pendingCount = clearances.filter(c => c.status === 'PENDING_HR').length;
    const clearedCount = clearances.filter(c => c.status === 'CLEARED').length;
    const rejectedCount = clearances.filter(c => c.status === 'REJECTED').length;

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
                title="Stage 2: HR Institutional Clearance & Letters"
                subtitle="Review department-cleared attachees, grant final institutional sign-off, and generate official recommendation letters."
                badge="Stage 2 Clearance"
                workflowKey="hr-workflow"
                currentStep={4}
                roleTips={{
                    HR: "Stage 2 Sign-off: Verify completed department sign-offs, grant final clearance, and generate official recommendation letters."
                }}
            />

            {/* Filter Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="relative w-full sm:w-80">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search attachee, position, or department..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-600 focus:outline-none"
                    />
                    <svg className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <select
                        value={departmentFilter}
                        onChange={(e) => setDepartmentFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-extrabold rounded-xl px-3.5 py-2.5 shadow-sm focus:outline-none focus:border-primary-600"
                    >
                        <option value="ALL">All Departments</option>
                        {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>

                    <div className="flex bg-slate-100 border border-slate-300 rounded-xl p-1 shadow-sm text-xs font-bold">
                        <button
                            onClick={() => setStatusFilter('PENDING_HR')}
                            className={`px-3.5 py-2 rounded-lg transition-colors ${statusFilter === 'PENDING_HR' ? 'bg-primary-600 text-[var(--color-primary-on)] font-black shadow-sm' : 'text-slate-800 hover:bg-slate-200'}`}
                        >
                            Pending HR ({pendingCount})
                        </button>
                        <button
                            onClick={() => setStatusFilter('CLEARED')}
                            className={`px-3.5 py-2 rounded-lg transition-colors ${statusFilter === 'CLEARED' ? 'bg-emerald-700 text-white font-black shadow-sm' : 'text-slate-800 hover:bg-slate-200'}`}
                        >
                            Cleared ({clearedCount})
                        </button>
                        <button
                            onClick={() => setStatusFilter('REJECTED')}
                            className={`px-3.5 py-2 rounded-lg transition-colors ${statusFilter === 'REJECTED' ? 'bg-rose-700 text-white font-black shadow-sm' : 'text-slate-800 hover:bg-slate-200'}`}
                        >
                            Revision ({rejectedCount})
                        </button>
                        <button
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-3.5 py-2 rounded-lg transition-colors ${statusFilter === 'ALL' ? 'bg-primary-600 text-[var(--color-primary-on)] font-black shadow-sm' : 'text-slate-800 hover:bg-slate-200'}`}
                        >
                            All
                        </button>
                    </div>

                    {/* Export Actions */}
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={() => exportToCSV(
                                'clearance_queue',
                                ['Attachee', 'Email', 'Department', 'Role', 'Dept Cleared', 'HR Status', 'HR Cleared By'],
                                filteredClearances.map(c => [
                                    c.applicant_name, c.applicant_email || '', c.department_name, c.job_title,
                                    c.department_cleared ? 'Yes' : 'No',
                                    (c.status || '').replace(/_/g, ' '),
                                    c.hr_cleared_by_name || '—'
                                ]),
                                {
                                    reportTitle: 'HR Clearance Register',
                                    subtitle: 'Stage 2 institutional clearance records — Final exit processing'
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
                                'HR Clearance Register',
                                'Stage 2 institutional clearance records',
                                ['Attachee', 'Department', 'Role', 'Dept Cleared', 'HR Status', 'HR Cleared By'],
                                filteredClearances.map(c => [
                                    c.applicant_name, c.department_name, c.job_title,
                                    c.department_cleared ? 'Yes' : 'No',
                                    (c.status || '').replace(/_/g, ' '),
                                    c.hr_cleared_by_name || '—'
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
                </div>
            </div>

            {/* Clearance Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-16 flex justify-center items-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
                    </div>
                ) : filteredClearances.length === 0 ? (
                    <div className="p-16 text-center text-slate-600">
                        <div className="w-16 h-16 bg-primary-50 text-primary-700 border border-primary-200 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 mb-1">No Records Pending HR Review</h3>
                        <p className="text-sm font-semibold text-slate-600">Attachees appear here once their respective department supervisor has granted Stage 1 approval.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-primary-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Attachee Details</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Department</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Stage 1: Dept Sign-off</th>
                                    <th className="px-6 py-4 text-left text-xs font-black text-slate-800 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-right text-xs font-black text-slate-800 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100 text-sm">
                                {filteredClearances.map(c => (
                                    <tr key={c.id} className="hover:bg-amber-50/40 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-black text-slate-900">{c.applicant_name}</div>
                                            <div className="text-xs text-slate-600 font-semibold mt-0.5">{c.applicant_email}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-xs font-black text-primary-900 bg-primary-50 px-3 py-1 rounded-md border border-primary-200">
                                                {c.department_name}
                                            </span>
                                            <div className="text-xs text-slate-700 font-bold mt-1">{c.job_title}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {c.department_cleared ? (
                                                <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-black">
                                                    <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                    <span>Cleared by {c.department_cleared_by_name || 'Department Head'}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-amber-800 font-black bg-amber-50 px-2.5 py-1 rounded border border-amber-200">⏳ Awaiting Dept Sign-off</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 text-xs font-black uppercase rounded-full border ${
                                                c.status === 'CLEARED' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                                c.status === 'REJECTED' ? 'bg-red-50 text-red-800 border-red-300' :
                                                c.status === 'PENDING_HR' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                                                'bg-slate-100 text-slate-800 border-slate-300'
                                            }`}>
                                                {c.status.replace(/_/g, ' ')}
                                            </span>
                                            {c.final_report_file && (
                                                <div className="mt-1 text-2xs text-emerald-700 font-bold flex items-center gap-1">
                                                    <span>📄 Report Attached</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                                            {c.status === 'PENDING_HR' && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedClearance(c);
                                                        setReviewNotes(c.hr_notes || '');
                                                    }}
                                                    className="px-5 py-2.5 bg-gradient-to-r from-primary-700 to-primary-600 hover:from-primary-800 hover:to-primary-700 text-white font-extrabold rounded-xl shadow-md transition-all transform hover:-translate-y-0.5"
                                                >
                                                    Review & Finalize
                                                </button>
                                            )}
                                            {c.status === 'CLEARED' && (
                                                (c.final_report_file || c.final_report_submitted_at) ? (
                                                    <button
                                                        onClick={() => {
                                                            setLetterModalClearance(c);
                                                            setGeneratedLetter(null);
                                                        }}
                                                        className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center gap-1.5 ml-auto transform hover:-translate-y-0.5"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        Generate Letter
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled
                                                        className="px-4 py-2.5 bg-slate-100 text-slate-400 border border-slate-200 font-bold rounded-xl text-xs flex items-center gap-1.5 ml-auto cursor-not-allowed"
                                                        title="Attachee final report has not been submitted. A submitted final report is required before generating a recommendation letter."
                                                    >
                                                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                        </svg>
                                                        <span>Awaiting Final Report</span>
                                                    </button>
                                                )
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* HR Review Modal */}
            {selectedClearance && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animation-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-8 border-t-primary-500">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                            <div>
                                <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 inline-block mb-1">
                                    Stage 2: HR Final Sign-off
                                </span>
                                <h3 className="text-2xl font-black text-gray-900">{selectedClearance.applicant_name}</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Placement: <strong>{selectedClearance.job_title}</strong> &bull; {selectedClearance.department_name}
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
                            {/* Stage 1 Department Verification Info */}
                            <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200">
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 mb-1">
                                    <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                    <span>Department Stage 1 Clearance Verified</span>
                                </div>
                                <p className="text-xs text-emerald-800 mt-1">
                                    Approved by: <strong>{selectedClearance.department_cleared_by_name || 'Supervisor'}</strong> on {new Date(selectedClearance.department_cleared_at).toLocaleDateString()}
                                </p>
                                {selectedClearance.department_notes && (
                                    <p className="text-xs text-gray-700 bg-white/80 p-2.5 rounded-lg border border-emerald-100 mt-2 italic">
                                        "{selectedClearance.department_notes}"
                                    </p>
                                )}
                            </div>

                            {/* Attachee Document */}
                            {selectedClearance.final_report_file && (
                                <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                                    <div className="flex items-center gap-2.5">
                                        <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                        </svg>
                                        <span className="text-xs font-bold text-gray-800">Final Logbook Document</span>
                                    </div>
                                    <a
                                        href={selectedClearance.final_report_file}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-xs font-bold text-primary-readable hover:text-primary-800"
                                    >
                                        View Upload &rarr;
                                    </a>
                                </div>
                            )}

                            {/* HR Remarks */}
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                                    HR Department Remarks & Institutional Sign-off
                                </label>
                                <textarea
                                    rows="3"
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    placeholder="Enter final HR remarks for institutional record and letter generation..."
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
                                disabled={isSubmittingReview}
                                onClick={() => handleReviewDecision('REJECT')}
                                className="px-5 py-2.5 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white border border-red-200 font-bold rounded-xl text-sm transition-all"
                            >
                                Request Revision
                            </button>
                            <button
                                type="button"
                                disabled={isSubmittingReview}
                                onClick={() => handleReviewDecision('APPROVE')}
                                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center gap-2"
                            >
                                {isSubmittingReview ? 'Processing...' : '✓ Issue Final HR Clearance'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Generate Recommendation Letter Modal */}
            {letterModalClearance && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animation-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border-t-8 border-t-emerald-500">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                            <div>
                                <h3 className="text-xl font-black text-gray-900">Generate Recommendation Letter</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Recipient: <strong>{letterModalClearance.applicant_name}</strong> &bull; {letterModalClearance.department_name}
                                </p>
                            </div>
                            <button
                                onClick={() => setLetterModalClearance(null)}
                                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                            {!generatedLetter ? (
                                <form onSubmit={handleGenerateLetter} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                            Select Recommendation Letter Template
                                        </label>
                                        <select
                                            value={selectedTemplateId}
                                            onChange={(e) => setSelectedTemplateId(e.target.value)}
                                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-emerald-500"
                                        >
                                            {templates.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.name} {t.is_default ? '(Default)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
                                        Tokens such as <code>&#123;&#123;full_name&#125;&#125;</code>, <code>&#123;&#123;department&#125;&#125;</code>, <code>&#123;&#123;start_date&#125;&#125;</code>, and <code>&#123;&#123;hr_name&#125;&#125;</code> will be automatically replaced with live verified record data.
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isGeneratingLetter}
                                        className="w-full py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm focus:ring-2 focus:ring-emerald-600"
                                    >
                                        {isGeneratingLetter ? 'Rendering Official Document...' : '✓ Generate & Issue Official Recommendation Letter'}
                                    </button>
                                </form>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-6 bg-slate-50 border-2 border-slate-300 rounded-xl font-serif text-sm text-slate-900 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                                        {generatedLetter.rendered_content}
                                    </div>

                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setIsPreviewModalOpen(true)}
                                            className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold rounded-xl text-sm flex items-center gap-2 shadow focus:ring-2 focus:ring-primary-600"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            <span>Full A4 Preview & Print</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Full Responsive Document Preview Modal */}
            {generatedLetter && (
                <DocumentPreviewModal
                    isOpen={isPreviewModalOpen}
                    onClose={() => setIsPreviewModalOpen(false)}
                    title={`Recommendation Letter — ${letterModalClearance?.applicant_name || 'Attachee'}`}
                    subtitle={`Department of ${letterModalClearance?.department_name || 'Petroleum'}`}
                    rawText={generatedLetter.rendered_content}
                />
            )}
        </div>
    );
}
