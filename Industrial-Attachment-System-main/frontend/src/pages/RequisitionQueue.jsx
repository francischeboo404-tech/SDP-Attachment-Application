import React, { useState, useCallback } from 'react';
import api from '../services/api';
import PageGuideHeader from '../components/PageGuideHeader';
import { useLiveData, unwrapList } from '../hooks/useLiveData';

export default function RequisitionQueue() {
    const [filterStatus, setFilterStatus] = useState('PENDING');
    const [activeModal, setActiveModal] = useState(null); // { type: 'APPROVE' | 'REJECT', req: Object }
    const [reviewNotes, setReviewNotes] = useState('');
    const [customJobTitle, setCustomJobTitle] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState('');

    // Polled and refetched on tab focus, so a requisition raised by a Director
    // in another tab appears in the HR queue without a manual reload. The
    // approval/rejection path already refreshed imperatively after its
    // mutation; that is now refresh().
    const fetchRequisitions = useCallback(async () => {
        const res = await api.get(`jobs/requisitions/${filterStatus !== 'ALL' ? `?status=${filterStatus}` : ''}`);
        return unwrapList(res.data);
    }, [filterStatus]);

    const { data, error, loading, refresh } = useLiveData(fetchRequisitions);
    const requisitions = data || [];

    const openApproveModal = (req) => {
        setActiveModal({ type: 'APPROVE', req });
        setCustomJobTitle(`Industrial Attachee - ${req.department_name} (${req.num_candidates_requested} Positions)`);
        setReviewNotes('Approved for recruitment and public attachment intake.');
    };

    const openRejectModal = (req) => {
        setActiveModal({ type: 'REJECT', req });
        setReviewNotes('');
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!activeModal) return;

        setIsSubmitting(true);
        try {
            const payload = {
                action: activeModal.type,
                review_notes: reviewNotes,
                job_title: activeModal.type === 'APPROVE' ? customJobTitle : undefined,
            };

            const res = await api.post(`jobs/requisitions/${activeModal.req.id}/review/`, payload);
            setNotification(res.data?.detail || 'Requisition reviewed successfully.');
            setActiveModal(null);
            // Pull the post-decision state immediately rather than waiting for
            // the next poll, so the queue reflects the decision at once.
            refresh();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Review failed:', err);
            alert(err.response?.data?.detail || 'Failed to submit review decision.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            {notification && (
                <div className="fixed top-20 right-4 md:right-8 z-50 bg-emerald-50 border-l-4 border-emerald-600 p-4 rounded-xl shadow-xl flex items-center gap-3">
                    <svg className="w-6 h-6 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-emerald-900 text-sm font-bold">{notification}</p>
                </div>
            )}

            <PageGuideHeader
                title="Department Requisition Review Queue"
                subtitle="Review and validate attachment staffing requests from Department Directors. Approval automatically generates public attachment vacancies."
                badge="HR Review"
                workflowKey="hr-workflow"
                currentStep={1}
                roleTips={{
                    HR: "Review department requisitions. Approving a requisition automatically pre-fills and publishes the public vacancy with requested slot capacity."
                }}
            />

            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div>
                    <h3 className="text-base font-extrabold text-slate-900">Requisitions Filter</h3>
                    <p className="text-slate-600 text-xs mt-0.5">Filter department staffing requests by approval status.</p>
                </div>
                <div className="flex bg-slate-50 border border-slate-300 rounded-xl p-1 shadow-sm text-xs font-bold">
                    <button
                        onClick={() => setFilterStatus('PENDING')}
                        className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                            filterStatus === 'PENDING' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        <span className="w-2 h-2 rounded-full bg-amber-300"></span>
                        <span>Pending Review</span>
                    </button>
                    <button
                        onClick={() => setFilterStatus('APPROVED')}
                        className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                            filterStatus === 'APPROVED' ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>Approved</span>
                    </button>
                    <button
                        onClick={() => setFilterStatus('REJECTED')}
                        className={`px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5 ${
                            filterStatus === 'REJECTED' ? 'bg-red-700 text-white' : 'text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        <span className="w-2 h-2 rounded-full bg-red-400"></span>
                        <span>Rejected</span>
                    </button>
                    <button
                        onClick={() => setFilterStatus('ALL')}
                        className={`px-3.5 py-2 rounded-lg transition-colors ${
                            filterStatus === 'ALL' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        All History
                    </button>
                </div>
            </div>

            {/* Requisitions Feed */}
            {loading ? (
                <div className="p-20 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-700 mx-auto"></div>
                </div>
            ) : error && !data ? (
                // Must precede the empty state: a failed request also yields an
                // empty list, and "Queue is Clear" would report that nothing is
                // awaiting review when in fact nothing could be fetched.
                <div className="bg-rose-50 rounded-2xl p-10 text-center border border-rose-200">
                    <h3 className="text-lg font-black text-rose-900">
                        {error.response?.data?.detail || 'Unable to load the requisition queue.'}
                    </h3>
                    <button
                        type="button"
                        onClick={refresh}
                        className="mt-4 px-4 py-2 rounded-lg border border-rose-300 bg-white text-xs font-bold text-rose-800 hover:bg-rose-100"
                    >
                        Try again
                    </button>
                </div>
            ) : requisitions.length === 0 ? (
                <div className="bg-white rounded-2xl p-16 text-center border-2 border-dashed border-slate-300 shadow-sm">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-500">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-black text-slate-800">Queue is Clear</h3>
                    <p className="text-slate-600 text-sm mt-1">No requisitions currently match the "{filterStatus}" filter.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {requisitions.map(req => (
                        <div
                            key={req.id}
                            className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
                        >
                            <div className="space-y-2 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="bg-primary-100 text-primary-900 border border-primary-300 text-xs font-black px-2.5 py-0.5 rounded-md">
                                        Requisition #{req.id}
                                    </span>
                                    <span className="text-sm font-bold text-slate-900 bg-slate-100 px-3 py-0.5 rounded-md border border-slate-300">
                                        {req.department_name}
                                    </span>
                                    <span className="text-xs font-semibold text-slate-500">
                                        Submitted by <strong className="text-slate-800">{req.requested_by_name}</strong> on {new Date(req.created_at).toLocaleDateString()}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                        <p className="text-2xs font-bold text-slate-600 uppercase">Headcount & Dates</p>
                                        <p className="text-sm font-black text-slate-900">
                                            {req.num_candidates_requested} Candidates Requested
                                        </p>
                                        <p className="text-xs text-slate-600 mt-0.5">
                                            Period: <span className="font-semibold">{req.duration_start}</span> to <span className="font-semibold">{req.duration_end}</span>
                                        </p>
                                    </div>

                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                                        <p className="text-2xs font-bold text-slate-600 uppercase">Director's Operational Need</p>
                                        <p className="text-xs text-slate-800 italic">
                                            "{req.justification || 'Standard departmental attachment support'}"
                                        </p>
                                    </div>
                                </div>

                                <div className="pt-2 text-xs text-slate-800">
                                    <span className="font-bold text-slate-900">Required Skills:</span> {req.requirements}
                                </div>

                                {req.review_notes && (
                                    <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 font-medium">
                                        <strong>HR Review Note:</strong> {req.review_notes} (Reviewed by {req.reviewed_by_name || 'HR'})
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 w-full md:w-auto">
                                {req.status === 'PENDING' ? (
                                    <>
                                        <button
                                            onClick={() => openApproveModal(req)}
                                            className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all shadow flex items-center justify-center gap-1.5 focus:ring-2 focus:ring-emerald-600"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>Approve & Auto-Publish</span>
                                        </button>

                                        <button
                                            onClick={() => openRejectModal(req)}
                                            className="bg-red-50 hover:bg-red-600 text-red-700 hover:text-white font-bold py-2 px-4 rounded-xl text-xs transition-all border border-red-300 hover:border-transparent flex items-center justify-center gap-1.5"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            <span>Reject / Revisions</span>
                                        </button>
                                    </>
                                ) : (
                                    <div className="text-center md:text-right">
                                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-black ${
                                            req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-red-100 text-red-900 border border-red-300'
                                        }`}>
                                            {req.status}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Approval Modal */}
            {activeModal?.type === 'APPROVE' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animation-fade-in overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border-t-8 border-t-emerald-600 overflow-hidden my-8">
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-900">
                                Confirm Requisition Approval
                            </h3>
                            <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleReviewSubmit} className="p-6 space-y-4">
                            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-xs text-emerald-950">
                                <strong>System Automation:</strong> Approving this requisition will automatically create and publish a live Attachment Vacancy for <strong>{activeModal.req.department_name}</strong> with <strong>{activeModal.req.num_candidates_requested} slots</strong>.
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                    Public Vacancy Title *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={customJobTitle}
                                    onChange={(e) => setCustomJobTitle(e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                    HR Internal Review Note
                                </label>
                                <textarea
                                    rows="2"
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    placeholder="Add approval comment or intake reference..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none resize-none"
                                />
                            </div>

                            <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className="px-5 py-2.5 bg-slate-200 text-slate-800 rounded-xl font-bold text-sm hover:bg-slate-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold text-sm shadow-md flex items-center"
                                >
                                    {isSubmitting ? 'Publishing...' : 'Approve & Publish Vacancy'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {activeModal?.type === 'REJECT' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animation-fade-in overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border-t-8 border-t-red-600 overflow-hidden my-8">
                        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-900">
                                Requisition Rejection / Feedback
                            </h3>
                            <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-slate-700">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleReviewSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                    Reason / Revisions Required for Director *
                                </label>
                                <textarea
                                    required
                                    rows="3"
                                    value={reviewNotes}
                                    onChange={(e) => setReviewNotes(e.target.value)}
                                    placeholder="Explain why the headcount or timeline cannot be accommodated..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-red-600 focus:outline-none resize-none"
                                />
                            </div>

                            <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setActiveModal(null)}
                                    className="px-5 py-2.5 bg-slate-200 text-slate-800 rounded-xl font-bold text-sm hover:bg-slate-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold text-sm shadow-md flex items-center"
                                >
                                    {isSubmitting ? 'Saving...' : 'Reject Requisition'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
