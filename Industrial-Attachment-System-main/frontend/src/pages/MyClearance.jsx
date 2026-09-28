import React, { useState, useEffect } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import PageGuideHeader from '../components/PageGuideHeader';

export default function MyClearance() {
    const user = useAuthStore(state => state.user);
    const [clearances, setClearances] = useState([]);
    const [letters, setLetters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState(null);
    const [previewLetter, setPreviewLetter] = useState(null);

    // Form inputs per clearance ID
    const [formData, setFormData] = useState({});
    const [fileInputs, setFileInputs] = useState({});
    const [errorMessages, setErrorMessages] = useState({});
    const [successMessages, setSuccessMessages] = useState({});

    useEffect(() => {
        fetchClearances();
        fetchMyLetters();
    }, []);

    const fetchClearances = async () => {
        try {
            setLoading(true);
            const res = await api.get('jobs/clearance/my-clearances/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setClearances(data);
        } catch (err) {
            console.error('Failed to fetch clearances:', err);
            setClearances([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchMyLetters = async () => {
        try {
            const res = await api.get('jobs/recommendations/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setLetters(data);
        } catch (err) {
            console.error('Failed to load recommendation letters:', err);
        }
    };

    const handleTextChange = (clearanceId, text) => {
        setFormData(prev => ({ ...prev, [clearanceId]: text }));
    };

    const handleFileChange = (clearanceId, file) => {
        if (!file) return;

        const ext = file.name.split('.').pop().toLowerCase();
        if (!['pdf', 'docx', 'doc'].includes(ext)) {
            setErrorMessages(prev => ({
                ...prev,
                [clearanceId]: 'Invalid file format. Only PDF and DOCX documents are accepted.'
            }));
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            setErrorMessages(prev => ({
                ...prev,
                [clearanceId]: `File size exceeds 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
            }));
            return;
        }

        setErrorMessages(prev => ({ ...prev, [clearanceId]: null }));
        setFileInputs(prev => ({ ...prev, [clearanceId]: file }));
    };

    const handleSubmitClearance = async (clearance) => {
        const file = fileInputs[clearance.id];
        const notes = formData[clearance.id] || clearance.user_notes || '';

        if (!file && !clearance.final_report_file) {
            setErrorMessages(prev => ({
                ...prev,
                [clearance.id]: 'Please attach your final attachment report or logbook.'
            }));
            return;
        }

        const data = new FormData();
        data.append('user_confirmed', 'true');
        data.append('user_notes', notes);
        if (file) {
            data.append('final_report_file', file);
        }

        try {
            setSubmittingId(clearance.id);
            setErrorMessages(prev => ({ ...prev, [clearance.id]: null }));
            await api.post(`jobs/clearance/${clearance.id}/submit/`, data, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setSuccessMessages(prev => ({
                ...prev,
                [clearance.id]: 'Clearance documentation submitted successfully! Awaiting Department verification.'
            }));
            fetchClearances();
        } catch (err) {
            console.error('Submission failed:', err);
            const detail = err.response?.data?.detail || err.response?.data?.final_report_file?.[0] || 'Failed to submit clearance documentation.';
            setErrorMessages(prev => ({ ...prev, [clearance.id]: detail }));
        } finally {
            setSubmittingId(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
            </div>
        );
    }

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="Attachee Dual Clearance & Letters"
                subtitle="Complete your two-stage exit clearance (Department Supervisor Sign-off &rarr; Institutional HR Department Sign-off) to unlock your official recommendation letter."
                badge="Dual Clearance"
                workflowKey="attachee-journey"
                currentStep={5}
                roleTips={{
                    APPLICANT: "Submit your final logbook and project summary. Once your Department Supervisor approves (Stage 1), HR will review and issue your recommendation letter (Stage 2)."
                }}
            />

            {clearances.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
                    <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mx-auto mb-4 text-primary-500">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">No Active Clearances Found</h3>
                    <p className="text-gray-500 max-w-md mx-auto text-sm leading-relaxed">
                        Clearances are automatically initialized once you are deployed to a department and reach your exit date.
                    </p>
                </div>
            ) : (
                <div className="space-y-8">
                    {clearances.map((c) => {
                        const isCleared = c.status === 'CLEARED';
                        const isRejected = c.status === 'REJECTED';
                        const isPendingDept = c.status === 'PENDING_DEPARTMENT';
                        const isPendingHR = c.status === 'PENDING_HR';

                        return (
                            <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                {/* Header / Status Banner */}
                                <div className="p-6 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-bold uppercase tracking-wider text-primary-700 bg-primary-50 px-2.5 py-0.5 rounded border border-primary-100">
                                                {c.department_name}
                                            </span>
                                            <span className={`text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                                                isCleared ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                                isRejected ? 'bg-red-50 text-red-800 border-red-200' :
                                                isPendingHR ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                                'bg-amber-50 text-amber-800 border-amber-200'
                                            }`}>
                                                {c.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-black text-gray-900">{c.job_title}</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Record ID: #{c.id} &bull; Updated {new Date(c.updated_at).toLocaleDateString()}</p>
                                    </div>

                                    {isCleared && (
                                        <button
                                            onClick={() => window.print()}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-2 transition-all print:hidden"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                            </svg>
                                            Print Certificate
                                        </button>
                                    )}
                                </div>

                                {/* 4-Step Sequential Progress Stepper */}
                                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-xs font-bold">
                                        <div className={`p-2 rounded-lg border ${
                                            c.user_confirmed ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-white border-gray-200 text-gray-700'
                                        }`}>
                                            <div className="font-extrabold mb-0.5">Step 1</div>
                                            <div>{c.user_confirmed ? '✓ Report Submitted' : '1. Submit Logbook'}</div>
                                        </div>

                                        <div className={`p-2 rounded-lg border ${
                                            c.department_cleared ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                                            isPendingDept ? 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse' :
                                            'bg-white border-gray-200 text-gray-400'
                                        }`}>
                                            <div className="font-extrabold mb-0.5">Step 2: Dept</div>
                                            <div>{c.department_cleared ? '✓ Dept Approved' : isPendingDept ? '⏳ Dept Review' : '2. Dept Sign-off'}</div>
                                        </div>

                                        <div className={`p-2 rounded-lg border ${
                                            c.hr_cleared ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                                            isPendingHR ? 'bg-blue-50 border-blue-300 text-blue-800 animate-pulse' :
                                            'bg-white border-gray-200 text-gray-400'
                                        }`}>
                                            <div className="font-extrabold mb-0.5">Step 3: HR</div>
                                            <div>{c.hr_cleared ? '✓ HR Approved' : isPendingHR ? '⏳ HR Review' : '3. HR Sign-off'}</div>
                                        </div>

                                        <div className={`p-2 rounded-lg border ${
                                            isCleared ? 'bg-emerald-100 border-emerald-300 text-emerald-900' : 'bg-white border-gray-200 text-gray-400'
                                        }`}>
                                            <div className="font-extrabold mb-0.5">Step 4</div>
                                            <div>{isCleared ? '🎉 Official Clearance' : '4. Final Certificate'}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-6">
                                    {/* Success Message Banner */}
                                    {successMessages[c.id] && (
                                        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-semibold flex items-center gap-3">
                                            <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                            {successMessages[c.id]}
                                        </div>
                                    )}

                                    {/* Rejection / Revision Alert */}
                                    {isRejected && (
                                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
                                            <div className="font-bold mb-1 flex items-center gap-2">
                                                <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                Revision Requested:
                                            </div>
                                            <p className="mt-1 text-gray-700 bg-white/70 p-3 rounded-lg border border-red-100 font-medium">
                                                {c.department_notes || c.hr_notes || 'Please update and re-upload your logbook report.'}
                                            </p>
                                        </div>
                                    )}

                                    {/* Completion Deliverable: Official Recommendation Letter */}
                                    {isCleared ? (
                                        <div className="space-y-6">
                                            <div className="bg-gradient-to-br from-emerald-50 via-white to-amber-50 rounded-2xl p-6 sm:p-8 border-2 border-emerald-300 shadow-md relative overflow-hidden">
                                                <div className="text-center max-w-xl mx-auto">
                                                    <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-emerald-300 shadow-inner">
                                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                        </svg>
                                                    </div>
                                                    <h4 className="text-2xl font-black text-slate-900 tracking-tight">INDUSTRIAL ATTACHMENT COMPLETED</h4>
                                                    <p className="text-xs uppercase tracking-widest text-emerald-800 font-extrabold mt-1">
                                                        State Department for Petroleum &bull; Ministry of Energy and Petroleum
                                                    </p>

                                                    <div className="my-5 py-4 border-y border-emerald-200">
                                                        <p className="text-sm text-slate-600">This verifies that</p>
                                                        <p className="text-xl font-extrabold text-slate-900 mt-1">{c.applicant_name}</p>
                                                        <p className="text-sm text-slate-600 mt-2">
                                                            has successfully cleared all institutional requirements in the <strong className="text-slate-900">{c.department_name}</strong> department.
                                                        </p>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-xs bg-white/90 p-4 rounded-xl border border-emerald-100 mb-4">
                                                        <div>
                                                            <span className="font-bold text-slate-500 block">Stage 1 Department Sign-off:</span>
                                                            <span className="font-extrabold text-slate-900">Cleared by {c.department_cleared_by_name || 'Supervisor'}</span>
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-slate-500 block">Stage 2 HR Institutional Sign-off:</span>
                                                            <span className="font-extrabold text-slate-900">Cleared by {c.hr_cleared_by_name || 'HR Department'}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Official Recommendation Letter (The Completion Deliverable) */}
                                                {letters.length > 0 ? (
                                                    <div className="mt-6 pt-6 border-t border-emerald-200">
                                                        <div className="bg-white p-6 rounded-2xl border border-emerald-300 shadow-sm">
                                                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                                                <div className="flex items-center gap-3.5">
                                                                    <div className="w-12 h-12 bg-amber-100 text-primary-800 rounded-xl flex items-center justify-center shrink-0 border border-amber-300">
                                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                        </svg>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-2xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-1 rounded-md border border-emerald-300">
                                                                            Official Completion Deliverable
                                                                        </span>
                                                                        <h4 className="text-base font-black text-slate-900 mt-1">Official Recommendation Letter</h4>
                                                                        <p className="text-xs text-slate-500 font-semibold">
                                                                            Issued on {new Date(letters[0].generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} by {letters[0].generated_by_name}
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreviewLetter(letters[0])}
                                                                    className="w-full sm:w-auto px-6 py-3 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all shrink-0"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    </svg>
                                                                    <span>Preview & Download Official Letter</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
                                                        <p className="text-xs text-amber-900 font-bold">
                                                            ⏳ Clearance approved! Your official recommendation letter is queued for HR signature and will appear here shortly.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* Submission / In-Progress View */
                                        <div>
                                            {c.user_confirmed && !isRejected ? (
                                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                                                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                                                        <svg className="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                        </svg>
                                                    </div>
                                                    <h4 className="text-lg font-bold text-blue-900 mb-1">
                                                        {isPendingDept ? 'Stage 1: Under Department Review' : 'Stage 2: Under HR Institutional Review'}
                                                    </h4>
                                                    <p className="text-sm text-blue-700 max-w-lg mx-auto">
                                                        {isPendingDept
                                                            ? 'Your logbook has been submitted and is currently being verified by your department supervisor.'
                                                            : 'Department sign-off is complete. Your record is now with the HR Department for final institutional sign-off.'
                                                        }
                                                    </p>
                                                </div>
                                            ) : (
                                                /* Upload & Confirmation Form */
                                                <form
                                                    onSubmit={(e) => {
                                                        e.preventDefault();
                                                        handleSubmitClearance(c);
                                                    }}
                                                    className="space-y-5"
                                                >
                                                    {errorMessages[c.id] && (
                                                        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl font-medium">
                                                            {errorMessages[c.id]}
                                                        </div>
                                                    )}

                                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                        <label className="flex items-start gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                required
                                                                defaultChecked={c.user_confirmed}
                                                                className="mt-1 h-5 w-5 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                                                            />
                                                             <span className="text-sm font-semibold text-gray-800 leading-relaxed">
                                                                I confirm that I have completed the full attachment period, submitted all deliverables to my supervisor, returned ministry badges/equipment, and prepared my final report.
                                                            </span>
                                                        </label>
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                                                            Summary of Projects Handled & Tasks Completed
                                                        </label>
                                                        <textarea
                                                            rows="3"
                                                            value={formData[c.id] !== undefined ? formData[c.id] : (c.user_notes || '')}
                                                            onChange={(e) => handleTextChange(c.id, e.target.value)}
                                                            placeholder="Describe key responsibilities and supervisor name..."
                                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">
                                                            Final Attachment Report / Logbook (PDF or DOCX, max 10MB) *
                                                        </label>
                                                        <input
                                                            type="file"
                                                            accept=".pdf,.docx,.doc"
                                                            onChange={(e) => handleFileChange(c.id, e.target.files[0])}
                                                            className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm"
                                                        />
                                                    </div>

                                                    <button
                                                        type="submit"
                                                        disabled={submittingId === c.id}
                                                        className="w-full py-3.5 px-6 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                                    >
                                                        {submittingId === c.id ? 'Submitting...' : 'Submit for Department Sign-off'}
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {previewLetter && (
                <DocumentPreviewModal
                    isOpen={!!previewLetter}
                    onClose={() => setPreviewLetter(null)}
                    title={previewLetter?.template_name || 'Recommendation Letter'}
                    rawText={previewLetter?.rendered_content || ''}
                />
            )}
        </div>
    );
}
