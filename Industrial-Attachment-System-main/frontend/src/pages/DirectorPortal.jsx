import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import ReportsModal from '../components/ReportsModal';
import DepartmentReports from './DepartmentReports';
import ExpandableRichText from '../components/ExpandableRichText';
import { minStartDate, startDateError } from '../utils/dateGuards';

export default function DirectorPortal() {
    const navigate = useNavigate();
    const user = useAuthStore(state => state.user);
    const [requisitions, setRequisitions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [portalDescriptionExpanded, setPortalDescriptionExpanded] = useState(false);
    const [departmentData, setDepartmentData] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReportsOpen, setIsReportsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState('');

    const [formData, setFormData] = useState({
        num_candidates_requested: 3,
        duration_start: '',
        duration_end: '',
        requirements: '',
        justification: '',
    });

    const fetchPortalData = async () => {
        try {
            setLoading(true);
            const [reqRes, deptRes] = await Promise.all([
                api.get('jobs/requisitions/'),
                api.get('jobs/departments/'),
            ]);

            const reqs = Array.isArray(reqRes.data?.results) ? reqRes.data.results : (Array.isArray(reqRes.data) ? reqRes.data : []);
            setRequisitions(reqs);

            const depts = Array.isArray(deptRes.data?.results) ? deptRes.data.results : (Array.isArray(deptRes.data) ? deptRes.data : []);
            const userDept = depts.find(d => d.director === user?.id || d.id === user?.department);
            setDepartmentData(userDept || depts[0]);
        } catch (err) {
            console.error('Failed to load director portal data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPortalData();
    }, []);

    const openSubmitModal = () => {
        const d1 = new Date();
        d1.setMonth(d1.getMonth() + 1);
        const start = d1.toISOString().split('T')[0];

        const d2 = new Date(d1);
        d2.setMonth(d2.getMonth() + 3);
        const end = d2.toISOString().split('T')[0];

        setFormData({
            num_candidates_requested: departmentData?.typical_intake_capacity || 3,
            duration_start: start,
            duration_end: end,
            requirements: '',
            justification: '',
        });
        setIsModalOpen(true);
    };

    // A requisition cannot begin in the past. Blocked at submit as well as in
    // the field, so a value that arrived some other way (a restored draft, a
    // pasted form) cannot slip through.
    const startDateMessage = startDateError(formData.duration_start, 'Requisition start date');

    const handleDurationStart = (value) => {
        setFormData({ ...formData, duration_start: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (startDateMessage) {
            setNotification(startDateMessage);
            setTimeout(() => setNotification(''), 6000);
            return;
        }
        setIsSubmitting(true);
        try {
            await api.post('jobs/requisitions/', {
                department: departmentData?.id,
                num_candidates_requested: parseInt(formData.num_candidates_requested),
                duration_start: formData.duration_start,
                duration_end: formData.duration_end,
                requirements: formData.requirements,
                justification: formData.justification,
            });

            setNotification('Requisition submitted to HR Department successfully!');
            setIsModalOpen(false);
            fetchPortalData();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Failed to submit requisition:', err);
            alert(err.response?.data?.detail || 'Failed to submit requisition.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'APPROVED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                        <svg className="w-3.5 h-3.5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                        </svg>
                        Approved & Vacancy Published
                    </span>
                );
            case 'REJECTED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-black bg-red-100 text-red-900 border border-red-300">
                        <svg className="w-3.5 h-3.5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Revision Requested / Rejected
                    </span>
                );
            case 'FULFILLED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-black bg-accent-50 text-accent-800 border border-accent-200">
                        <svg className="w-3.5 h-3.5 text-accent-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Fulfilled (Slots Filled)
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                        <svg className="w-3.5 h-3.5 text-amber-700 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Pending HR Review
                    </span>
                );
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
                title="Department Staffing & Requisitions"
                subtitle="Submit industrial attachment staffing requisitions to HR Department and track institutional approvals."
                badge="Department Director"
                workflowKey="director-workflow"
                currentStep={1}
                actions={
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => navigate('/department-clearance')}
                            className="bg-primary-50 hover:bg-primary-100 text-primary-900 px-4 py-2.5 rounded-xl font-bold text-xs border border-primary-300 transition-all flex items-center gap-1.5 shadow-xs"
                        >
                            <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 18 0 0118 0z" />
                            </svg>
                            <span>Stage 1 Clearance Queue</span>
                        </button>
                        <button
                            onClick={() => setIsReportsOpen(true)}
                            className="bg-white hover:bg-primary-50 text-primary-900 px-4 py-2.5 rounded-xl font-bold text-xs border border-primary-300 transition-all flex items-center gap-1.5 shadow-xs"
                        >
                            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Reports &amp; Analytics</span>
                        </button>
                        <button
                            onClick={() => navigate('/department-archives')}
                            className="bg-white hover:bg-primary-50 text-primary-900 px-4 py-2.5 rounded-xl font-bold text-xs border border-primary-300 transition-all flex items-center gap-1.5 shadow-xs"
                        >
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            <span>Department Archives</span>
                        </button>
                        <button
                            onClick={openSubmitModal}
                            className="bg-accent-500 hover:bg-accent-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Submit Requisition</span>
                        </button>
                    </div>
                }
            />

            {/* Department-scoped Reports & Analytics — same slide-in panel as Admin/HR */}
            <ReportsModal
                isOpen={isReportsOpen}
                onClose={() => setIsReportsOpen(false)}
                title="Department Reports & Analytics"
                subtitle="Your department's attachees, clearance status, requisitions and vacancy fill rates"
            >
                <DepartmentReports embedded />
            </ReportsModal>

            {/* Department Summary Banner */}
            {departmentData && (
                <div className="bg-gradient-to-r from-primary-800 via-primary-700 to-primary-800 text-white rounded-2xl p-6 sm:p-8 mb-8 shadow-lg border border-primary-600/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-amber-200 border border-white/30 text-xs font-black uppercase tracking-wider mb-2">
                            <span>Your Department</span>
                        </div>
                        <h3 className="text-2xl sm:text-3xl font-black">{departmentData.name}</h3>
                        {/* Same expandable, formatted mandate the Admin sees in the
                            department list, so a director reads their own department
                            exactly as it is presented to everyone else. The control
                            only appears when the text is genuinely clipped. */}
                        <ExpandableRichText
                            html={departmentData.description}
                            id={`portal-dept-${departmentData.id}`}
                            expanded={portalDescriptionExpanded}
                            onToggle={() => setPortalDescriptionExpanded((v) => !v)}
                            lines={3}
                            compact
                            className="text-primary-100 text-sm mt-1 max-w-2xl"
                            buttonClassName="text-amber-200 hover:text-amber-100"
                            placeholder="Core technical department in the State Department for Petroleum."
                        />
                    </div>

                    <div className="flex gap-4 sm:gap-6 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 shrink-0">
                        <div className="text-center">
                            <p className="text-xs font-bold text-amber-200 uppercase">Typical Capacity</p>
                            <p className="text-2xl font-black text-white">{departmentData.typical_intake_capacity || 'N/A'}</p>
                        </div>
                        <div className="w-px bg-white/20"></div>
                        <div className="text-center">
                            <p className="text-xs font-bold text-amber-200 uppercase">Live Vacancies</p>
                            <p className="text-2xl font-black text-accent-300">{departmentData.active_vacancies_count || 0}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Requisitions List */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                        <span>Submitted Requisitions</span>
                        <span className="text-xs font-bold text-slate-600 bg-slate-200 px-2.5 py-0.5 rounded-full">
                            {requisitions.length}
                        </span>
                    </h3>
                </div>

                {loading ? (
                    <div className="p-16 text-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-700 mx-auto"></div>
                    </div>
                ) : requisitions.length === 0 ? (
                    <div className="p-16 text-center text-slate-600">
                        <svg className="w-12 h-12 mx-auto mb-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <h4 className="text-lg font-bold text-slate-800">No Requisitions Submitted Yet</h4>
                        <p className="text-sm text-slate-500 mt-1">Submit your first attachment requisition to request candidates from HR.</p>
                        <button
                            onClick={openSubmitModal}
                            className="mt-4 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold py-2 px-4 rounded-xl text-xs transition-all shadow"
                        >
                            + Submit Requisition
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-100 text-slate-700 uppercase text-xs font-black tracking-wider border-b border-slate-200">
                                    <th className="py-3 px-4">Req #</th>
                                    <th className="py-3 px-4">Headcount</th>
                                    <th className="py-3 px-4">Duration Period</th>
                                    <th className="py-3 px-4">Requirements & Skills</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">HR Feedback / Vacancy</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 text-sm font-medium text-slate-800">
                                {requisitions.map(req => (
                                    <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="py-4 px-4 font-bold text-slate-900">
                                            #{req.id}
                                            <div className="text-2xs text-slate-500 font-normal">
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="inline-flex items-center justify-center font-black text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-300">
                                                {req.num_candidates_requested} Attachee(s)
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 text-xs font-semibold text-slate-700">
                                            <div>Start: <span className="font-bold text-slate-900">{req.duration_start}</span></div>
                                            <div>End: <span className="font-bold text-slate-900">{req.duration_end}</span></div>
                                        </td>
                                        <td className="py-4 px-4 text-xs max-w-xs">
                                            <p className="font-semibold text-slate-900 line-clamp-2">{req.requirements}</p>
                                            {req.justification && (
                                                <p className="text-slate-500 italic mt-0.5 line-clamp-1">Justification: {req.justification}</p>
                                            )}
                                        </td>
                                        <td className="py-4 px-4">
                                            {getStatusBadge(req.status)}
                                        </td>
                                        <td className="py-4 px-4 text-xs">
                                            {req.status === 'APPROVED' && req.created_job && (
                                                <button
                                                    onClick={() => navigate(`/vacancies?department=${req.department}`)}
                                                    className="inline-flex items-center gap-1 font-bold text-primary-700 hover:text-primary-900 bg-primary-50 px-2.5 py-1 rounded-md border border-primary-200"
                                                >
                                                    <span>View Vacancy</span>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                </button>
                                            )}
                                            {req.review_notes && (
                                                <div className="text-slate-600 mt-1">
                                                    <span className="font-bold">HR Note:</span> {req.review_notes}
                                                </div>
                                            )}
                                            {req.status === 'PENDING' && (
                                                <span className="text-slate-400 italic">Under review by HR Management</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Submission Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animation-fade-in overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border-t-8 border-t-primary-700 overflow-hidden my-8">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
                            <h3 className="text-xl font-black text-slate-900">
                                Submit Attachment Staffing Requisition
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-red-600 p-1.5 rounded-full hover:bg-red-50"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                    Target Department
                                </label>
                                <input
                                    type="text"
                                    disabled
                                    value={departmentData?.name || 'Your Assigned Department'}
                                    className="w-full bg-slate-100 border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-700 cursor-not-allowed"
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        Candidates (Slots) *
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        max="50"
                                        value={formData.num_candidates_requested}
                                        onChange={(e) => setFormData({ ...formData, num_candidates_requested: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        Start Date *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        min={minStartDate()}
                                        value={formData.duration_start}
                                        onChange={(e) => handleDurationStart(e.target.value)}
                                        aria-invalid={Boolean(startDateMessage)}
                                        aria-describedby={startDateMessage ? 'requisition-start-error' : undefined}
                                        className={`w-full bg-slate-50 border rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none ${
                                            startDateMessage ? 'border-rose-400 ring-1 ring-rose-200' : 'border-slate-300'
                                        }`}
                                    />
                                    {startDateMessage && (
                                        <p
                                            id="requisition-start-error"
                                            role="alert"
                                            className="mt-2 text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2"
                                        >
                                            {startDateMessage}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        End Date *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.duration_end}
                                        onChange={(e) => setFormData({ ...formData, duration_end: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                    Candidate Qualifications & Required Skills *
                                </label>
                                <textarea
                                    required
                                    rows="3"
                                    value={formData.requirements}
                                    onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                                    placeholder="e.g. Undergraduate students in Petroleum Engineering, Computer Science, or Geophysics with proficiency in data analysis..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none resize-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                    Operational Justification (Internal HR Review Note)
                                </label>
                                <textarea
                                    rows="2"
                                    value={formData.justification}
                                    onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                                    placeholder="Explain the workload, projects, or lab tasks the attachees will support..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none resize-none"
                                />
                            </div>

                            <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-2.5 bg-slate-200 text-slate-800 rounded-xl font-bold text-sm hover:bg-slate-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl font-bold text-sm shadow-md transition-all flex items-center focus:ring-2 focus:ring-primary-600"
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit Requisition to HR'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
