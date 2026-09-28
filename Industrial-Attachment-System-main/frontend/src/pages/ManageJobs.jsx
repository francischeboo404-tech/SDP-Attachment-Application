import React, { useState, useEffect } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import ConfirmDialog, { StatusToast } from '../components/ConfirmDialog';
import { DECISION_STATUSES } from '../utils/statusUtils';

export default function ManageJobs() {
    const userRole = useAuthStore(state => state.user?.role);
    const [applications, setApplications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedApp, setSelectedApp] = useState(null);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [updatingStatusId, setUpdatingStatusId] = useState(null);
    // Pending decision awaiting confirmation, and the resulting notice. A
    // recorded decision is consequential and notifies the applicant, so it is
    // confirmed explicitly and then acknowledged -- never applied silently.
    const [pendingDecision, setPendingDecision] = useState(null);
    const [toast, setToast] = useState(null);

    // HR owns the recruitment workflow. Admin keeps read-only visibility of
    // every application but cannot change any status; the backend enforces the
    // same split, so this is a UI affordance rather than the security boundary.
    const canDecide = userRole === 'HR';
    const canView = canDecide || userRole === 'ADMIN';

    // Extracted from the mount effect so it can also re-read the list after a
    // decision is recorded. Extracted rather than duplicated because the
    // pagination walk below is not something to keep in sync by hand.
    const fetchApplications = async ({ quiet = false } = {}) => {
        try {
            let allApps = [];
            let url = 'jobs/applications/';
            while (url) {
                if (url.startsWith('http')) {
                    try {
                        const urlObj = new URL(url);
                        url = urlObj.pathname.replace('/api/', '') + urlObj.search;
                    } catch (e) {
                        url = null;
                        break;
                    }
                }

                const res = await api.get(url);
                if (res.data && Array.isArray(res.data.results)) {
                    allApps = [...allApps, ...res.data.results];
                    url = res.data.next;
                } else if (Array.isArray(res.data)) {
                    allApps = [...allApps, ...res.data];
                    url = null;
                } else {
                    url = null;
                }
            }
            setApplications(allApps);
        } catch (error) {
            console.error(error);
            // A failed background refresh must not blank the table the officer
            // is currently working through.
            if (!quiet) setApplications([]);
        } finally {
            if (!quiet) setLoading(false);
        }
    };

    useEffect(() => {
        if (canView) {
            fetchApplications();
        } else {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView]);

    const updateApplicationStatus = async (appId, newStatus) => {
        setUpdatingStatusId(appId);
        try {
            await api.patch(`jobs/applications/${appId}/status/`, { status: newStatus });
            setApplications(prev => prev.map(a => a.id === appId ? { ...a, status: newStatus } : a));
            setSelectedApp(prev => prev ? { ...prev, status: newStatus } : null);
            // The table is updated from the response above, but a decision also
            // has to survive a reload. Re-reading the list from the server makes
            // the displayed state authoritative rather than an optimistic guess
            // that could silently disagree with what was stored.
            await fetchApplications({ quiet: true });
            setToast({
                type: 'success',
                title: newStatus === 'SUCCESSFUL' ? 'Application marked successful' : 'Application rejected',
                message: 'The applicant has been notified by email and can see the updated status on their dashboard.',
            });
        } catch (error) {
            console.error(error);
            // Surface the server's own reason when it gives one -- a 403 for a
            // role change and a validation failure need very different responses.
            const detail = error?.response?.data?.detail
                || error?.response?.data?.status?.[0]
                || 'The status was not changed. Please try again.';
            setToast({ type: 'error', title: 'Could not record the decision', message: detail, duration: 9000 });
        } finally {
            setUpdatingStatusId(null);
            setPendingDecision(null);
        }
    };

    const confirmDecision = () => {
        if (!pendingDecision) return;
        updateApplicationStatus(pendingDecision.appId, pendingDecision.status);
    };

    const handleDownload = async (docId, fileName) => {
        try {
            const res = await api.get(`accounts/documents/${docId}/download/`, {
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName || `document_${docId}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (error) {
            console.error("Download failed:", error);
            alert("Failed to download document.");
        }
    };

    const viewAttachments = async (app) => {
        setSelectedApp(app);
        // Opening the dossier marks an untouched application as REVIEWED, which
        // is a write. Admin is read-only, so the marker is skipped rather than
        // firing a request that the API would reject with 403.
        if (canDecide && app.status === 'PENDING') {
            try {
                await api.patch(`jobs/applications/${app.id}/status/`, { status: 'REVIEWED' });
                setApplications(prev =>
                    prev.map(a => a.id === app.id ? { ...a, status: 'REVIEWED' } : a)
                );
                setSelectedApp(prev => prev ? { ...prev, status: 'REVIEWED' } : null);
            } catch (err) {
                console.error('Could not auto-mark as REVIEWED:', err);
            }
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-64">
           <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        </div>
    );

    if (!canView) return (
        <div className="text-center p-10 font-bold text-red-700 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10 shadow-sm">
            Access Denied. HR or Administrator Privileges Required.
        </div>
    );

    const filteredApps = applications.filter(app => statusFilter === 'ALL' || app.status === statusFilter);

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="Industrial Attachment Applications"
                subtitle="Review applicant submissions, inspect verified university credentials and logbooks, and record each applicant's selection decision."
                badge={canDecide ? 'HR Review' : 'Read-Only Overview'}
                workflowKey="hr-workflow"
                currentStep={3}
                roleTips={{
                    HR: "Screen student submissions, verify uploaded certificates, and record each applicant's decision as Successful or Rejected.",
                    ADMIN: "Read-only overview of all student applications and recruitment pipelines across ministries. Selection decisions are recorded by HR."
                }}
            />

            {/* Filter Bar */}
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h3 className="text-base font-extrabold text-slate-900">Application Pipeline Filter</h3>
                    <p className="text-slate-600 text-xs mt-0.5">Filter applicant records by review and selection status.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {['ALL', 'PENDING', 'REVIEWED', 'SUCCESSFUL', 'REJECTED'].map(st => (
                        <button
                            key={st}
                            onClick={() => setStatusFilter(st)}
                            className={`px-3.5 py-1.5 font-bold text-xs rounded-xl border transition-all ${
                                statusFilter === st
                                    ? 'bg-primary-600 text-[var(--color-primary-on)] border-primary-700 shadow-sm'
                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                            }`}
                        >
                            {st === 'ALL'
                                ? 'All Applications'
                                : st === 'SUCCESSFUL' ? 'Successful'
                                : st.charAt(0) + st.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Applicant Name</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Attachment Vacancy</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">ATS Score</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                            {filteredApps.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500 font-medium">
                                        No industrial attachment applications found matching your criteria.
                                    </td>
                                </tr>
                            ) : filteredApps.map(app => (
                                <tr key={app.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="font-extrabold text-slate-900 text-sm">{app.applicant_name}</div>
                                        <div className="text-xs text-slate-500">{app.applicant_email}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="font-bold text-slate-800 text-sm">{app.job_title}</div>
                                        <div className="text-xs text-slate-500 font-semibold">{app.department_name || 'Ministry Department'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 inline-flex text-xs font-black rounded-lg border ${
                                            app.ats_score >= 70 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                                        }`}>
                                            {app.ats_score}% Match
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 inline-flex items-center gap-1.5 text-xs font-bold rounded-lg border ${
                                            app.status === 'SUCCESSFUL' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                            app.status === 'REVIEWED'    ? 'bg-cyan-50 text-cyan-800 border-cyan-200' :
                                            app.status === 'REJECTED'    ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                                                           'bg-amber-50 text-amber-800 border-amber-200'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                                app.status === 'SUCCESSFUL' ? 'bg-emerald-500' :
                                                app.status === 'REVIEWED' ? 'bg-cyan-500' :
                                                app.status === 'REJECTED' ? 'bg-rose-500' : 'bg-amber-500'
                                            }`}></span>
                                            {app.status === 'REVIEWED'    ? 'Under Review' :
                                             app.status === 'SUCCESSFUL' ? 'Successful' :
                                             app.status === 'REJECTED'    ? 'Not Selected' :
                                                                            'Pending Review'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <button 
                                            onClick={() => viewAttachments(app)} 
                                            className="bg-primary-50 text-primary-800 hover:bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] px-3.5 py-1.5 font-bold rounded-xl transition-all border border-primary-200 text-xs inline-flex items-center gap-1"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                            Review Applications
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Application Review Dossier Modal */}
            {selectedApp && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex justify-center items-center z-50 p-4 animation-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-200">
                        <div className="sticky top-0 bg-white/95 backdrop-blur-sm px-6 py-5 border-b border-slate-200 flex justify-between items-start z-10">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 leading-tight">{selectedApp.applicant_name}</h3>
                                <p className="text-slate-600 text-xs font-semibold mt-0.5">
                                    Attachment Vacancy: <strong className="text-slate-900">{selectedApp.job_title}</strong>
                                </p>
                            </div>
                            <button 
                                onClick={() => setSelectedApp(null)} 
                                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Candidate Academic Biodata */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-3">Academic & Attachment Details</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <span className="text-slate-500 font-semibold">Institution: </span>
                                        <strong className="text-slate-900">{selectedApp.institution_name || 'Not provided'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 font-semibold">Qualification: </span>
                                        <strong className="text-slate-900">{selectedApp.qualification || 'Not provided'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 font-semibold">Field of Study: </span>
                                        <strong className="text-slate-900">{selectedApp.field_of_study || 'Not provided'}</strong>
                                    </div>
                                    <div>
                                        <span className="text-slate-500 font-semibold">Intended Start Date: </span>
                                        <strong className="text-slate-900">{selectedApp.joining_date || 'Not provided'}</strong>
                                    </div>
                                    {selectedApp.projected_end_date && (
                                        <div className="sm:col-span-2 bg-primary-50 text-primary-900 p-2.5 rounded-xl border border-primary-200 font-semibold">
                                            Attachment Duration: <strong>{selectedApp.duration_weeks || 12} Weeks</strong> &bull; Projected End Date: <strong>{new Date(selectedApp.projected_end_date).toLocaleDateString()}</strong>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Candidate Cover Letter */}
                            {selectedApp.cover_letter && (
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2">Statement of Interest</h4>
                                    <p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                                        {selectedApp.cover_letter}
                                    </p>
                                </div>
                            )}

                            {/* Documents Checklist */}
                            <div>
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-3">Submitted Verification Documents</h4>
                                {((selectedApp.attached_documents || selectedApp.documents || []).length > 0) ? (
                                    <div className="space-y-2">
                                        {(selectedApp.attached_documents || selectedApp.documents).map(doc => (
                                            <div key={doc.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                                <div className="flex items-center gap-2.5">
                                                    <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                    <div>
                                                        <div className="text-xs font-bold text-slate-900">{doc.document_type.replace(/_/g, ' ')}</div>
                                                        <div className="text-2xs text-slate-500">PDF Verification Document</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDownload(doc.id, `${doc.document_type}.pdf`)}
                                                    className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-lg text-xs font-bold transition-colors shadow-sm"
                                                >
                                                    Download PDF
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 italic">No document attachments uploaded.</p>
                                )}
                            </div>

                            {/* Status Decision Controls
                                Selection is binary. DECISION_STATUSES is the single
                                source of truth shared with the backend, so this
                                control and the API validation cannot disagree. */}
                            <div className="pt-4 border-t border-slate-200">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-1">
                                    Record Selection Decision
                                </h4>
                                {canDecide ? (
                                    <>
                                        <p className="text-xs text-slate-500 font-medium mb-3">
                                            An application is either successful — the attachment
                                            opportunity is granted to the applicant — or rejected.
                                            The applicant is notified automatically.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {DECISION_STATUSES.map(st => (
                                                <button
                                                    key={st}
                                                    onClick={() => setPendingDecision({
                                                        appId: selectedApp.id,
                                                        status: st,
                                                        applicant: selectedApp.applicant_name
                                                            || selectedApp.user_name
                                                            || selectedApp.user?.username
                                                            || 'this applicant',
                                                        jobTitle: selectedApp.job_title,
                                                    })}
                                                    disabled={updatingStatusId === selectedApp.id || selectedApp.status === st}
                                                    title={selectedApp.status === st ? 'This decision is already recorded' : undefined}
                                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none ${
                                                        st === 'SUCCESSFUL'
                                                            ? 'bg-[var(--color-status-success)] hover:bg-[var(--color-status-success-readable)] text-white'
                                                            : 'bg-[var(--color-status-error)] hover:bg-[var(--color-status-error-readable)] text-white'
                                                    }`}
                                                >
                                                    {st === 'SUCCESSFUL'
                                                        ? 'Mark as Successful — Opportunity Granted'
                                                        : 'Mark as Rejected'}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-xs text-slate-500 font-medium bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3">
                                        You have read-only access. Selection decisions are
                                        recorded by HR, which owns the recruitment workflow.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Outcome acknowledgement. aria-live so the success of a decision
                is announced, not just shown. */}
            <StatusToast toast={toast} onDismiss={() => setToast(null)} />

            <ConfirmDialog
                open={Boolean(pendingDecision)}
                busy={updatingStatusId === pendingDecision?.appId}
                tone={pendingDecision?.status === 'SUCCESSFUL' ? 'success' : 'danger'}
                title={pendingDecision?.status === 'SUCCESSFUL'
                    ? 'Grant this attachment opportunity?'
                    : 'Reject this application?'}
                confirmLabel={pendingDecision?.status === 'SUCCESSFUL'
                    ? 'Yes, mark successful'
                    : 'Yes, reject application'}
                cancelLabel="Cancel"
                message={pendingDecision && (
                    <>
                        <p>
                            <strong className="font-black text-slate-900">{pendingDecision.applicant}</strong>
                            {pendingDecision.jobTitle ? (
                                <> will be recorded as <strong>{pendingDecision.status === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'REJECTED'}</strong> for <em>{pendingDecision.jobTitle}</em>.</>
                            ) : (
                                <> will be recorded as <strong>{pendingDecision.status === 'SUCCESSFUL' ? 'SUCCESSFUL' : 'REJECTED'}</strong>.</>
                            )}
                        </p>
                        <p className="mt-2">
                            {pendingDecision.status === 'SUCCESSFUL'
                                ? 'The applicant is emailed that the opportunity has been granted and can proceed to deployment. This is the positive decision and cannot be undone from this screen.'
                                : 'The applicant is emailed the outcome. Rejection is a final decision on this vacancy and notifies the applicant immediately.'}
                        </p>
                    </>
                )}
                onConfirm={confirmDecision}
                onCancel={() => setPendingDecision(null)}
            />
        </div>
    );
}
