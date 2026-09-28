import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import useDashboardStore from '../store/dashboardStore';
import PageGuideHeader from '../components/PageGuideHeader';
import ConfirmDialog, { StatusToast } from '../components/ConfirmDialog';
import RichTextEditor from '../components/RichTextEditor';
import RichText from '../components/RichText';
import { richTextToPlainText } from '../utils/richText';

export default function Vacancies() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialDeptFilter = searchParams.get('department') || 'ALL';

    const [vacancies, setVacancies] = useState([]);
    // Distinguished from "no vacancies": a failed request and an empty result
    // are different facts, and conflating them reports an outage as "no openings".
    const [loadError, setLoadError] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState(initialDeptFilter);
    const { stats, fetchStats, loading: statsLoading } = useDashboardStore();
    const userRole = useAuthStore(state => state.user?.role || 'APPLICANT');
    const [successMessage, setSuccessMessage] = useState('');
    const [expandedJobs, setExpandedJobs] = useState({});
    const [applyModal, setApplyModal] = useState({ open: false, jobId: null, coverLetter: '', submitting: false });
    const [appliedJobIds, setAppliedJobIds] = useState(new Set());

    const toggleReadMore = (jobId) => {
        setExpandedJobs(prev => ({
            ...prev,
            [jobId]: !prev[jobId]
        }));
    };

    const isPastDeadline = (deadline) => new Date(deadline) < new Date();

    const [archiveFilter, setArchiveFilter] = useState('ACTIVE'); // 'ACTIVE', 'ARCHIVED', 'ALL'

    // Admin Job Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [currentJobId, setCurrentJobId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({
        department: '',
        title: '',
        description: '',
        requirements: '',
        job_type: 'ATTACHMENT',
        location: 'Nairobi, Kenya',
        slots_required: 1,
        duration_weeks: 12,
        deadline: ''
    });

    useEffect(() => {
        fetchDepartments();
        fetchJobs(archiveFilter);

        if (userRole === 'APPLICANT') {
            fetchStats();
            fetchAppliedJobs();
        }

        const intervalId = setInterval(() => {
            fetchJobs(archiveFilter);
        }, 8000);

        return () => clearInterval(intervalId);
    }, [userRole, fetchStats, archiveFilter]);

    const fetchDepartments = async () => {
        try {
            const res = await api.get('jobs/departments/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setDepartments(data);
        } catch (err) {
            console.error('Failed to fetch departments:', err);
        }
    };

    const fetchJobs = async (status = archiveFilter) => {
        try {
            let allJobs = [];
            let url = 'jobs/vacancies/';
            if (['ADMIN', 'HR'].includes(userRole)) {
                if (status === 'ARCHIVED') {
                    url += '?archived_only=true';
                } else if (status === 'ALL') {
                    url += '?include_archived=true';
                }
            }
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
                    allJobs = [...allJobs, ...res.data.results];
                    url = res.data.next;
                } else if (Array.isArray(res.data)) {
                    allJobs = [...allJobs, ...res.data];
                    url = null;
                } else {
                    url = null;
                }
            }
            setVacancies(allJobs);
            setLoadError(null);
        } catch (err) {
            console.error("Error fetching jobs:", err);
            // Keep any previously loaded list on a failed poll rather than
            // blanking the page; a transient network error should not read as
            // "the ministry has no vacancies".
            setLoadError(err);
        }
    };

    const toggleArchiveJob = async (jobId) => {
        try {
            const res = await api.post(`jobs/vacancies/${jobId}/archive/`);
            alert(res.data?.detail || 'Archive status updated successfully.');
            fetchJobs(archiveFilter);
        } catch (err) {
            console.error('Failed to toggle archive:', err);
            alert(err.response?.data?.detail || 'Failed to update archive status.');
        }
    };

    const handleBulkArchive = async () => {
        if (!window.confirm('Are you sure you want to archive all past-deadline vacancies?')) return;
        try {
            const res = await api.post('jobs/vacancies/bulk-archive/');
            alert(res.data?.detail || `Successfully archived ${res.data?.archived_count || 0} past-deadline vacancies.`);
            fetchJobs(archiveFilter);
        } catch (err) {
            console.error('Failed bulk archive:', err);
            alert('Failed to execute bulk archive.');
        }
    };

    const checkProfileCompleteness = async () => {
        await fetchStats();
    };

    /**
     * Fetches all applications for the current applicant and builds a Set of
     * job IDs they have already applied for.  Handles DRF pagination.
     * Called on mount (for APPLICANT role) so cards render correctly immediately.
     */
    const fetchAppliedJobs = async () => {
        try {
            let allApps = [];
            let url = 'jobs/applications/';
            while (url) {
                if (url.startsWith('http')) {
                    try {
                        const urlObj = new URL(url);
                        url = urlObj.pathname.replace('/api/', '') + urlObj.search;
                    } catch (e) { url = null; break; }
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
            // Each application record has a `job` field containing the job's PK
            setAppliedJobIds(new Set(allApps.map(a => a.job)));
        } catch (err) {
            console.error('Failed to fetch applied jobs:', err);
        }
    };

    // Opens the cover-letter modal; the actual POST happens in submitApplication.
    // Re-checks the deadline AND duplicate status at click time to handle the edge
    // case where either condition changes while the applicant has the page open.
    const applyForJob = (jobId) => {
        const job = vacancies.find(v => v.id === jobId);
        if (job && isPastDeadline(job.deadline)) {
            alert(
                `The application deadline for "${job.title}" has already passed.\n` +
                `Deadline: ${new Date(job.deadline).toLocaleString()}\n\n` +
                'No further applications are being accepted for this vacancy.'
            );
            return;
        }
        if (appliedJobIds.has(jobId)) {
            alert(
                `You have already submitted an application for "${job?.title || 'this vacancy'}".\n\n` +
                'Only one application per vacancy is permitted. ' +
                'Visit "My Applications" to track your existing submission.'
            );
            return;
        }
        setApplyModal({ open: true, jobId, coverLetter: '', submitting: false });
    };

    const submitApplication = async () => {
        if (!applyModal.coverLetter.trim()) {
            alert('Please write a cover letter. It is used by the ATS to score your application.');
            return;
        }
        setApplyModal(prev => ({ ...prev, submitting: true }));
        try {
            await api.post('jobs/applications/', {
                job: applyModal.jobId,
                cover_letter: applyModal.coverLetter.trim(),
            });
            // Optimistically mark this job as applied so the card flips immediately
            setAppliedJobIds(prev => new Set([...prev, applyModal.jobId]));
            setApplyModal({ open: false, jobId: null, coverLetter: '', submitting: false });
            setSuccessMessage('Your application has been safely submitted and is now under automated ATS review.');
            setTimeout(() => setSuccessMessage(''), 6000);
        } catch (error) {
            setApplyModal(prev => ({ ...prev, submitting: false }));
            const serverMsg =
                error.response?.data?.detail ||
                error.response?.data?.non_field_errors?.[0] ||
                'Failed to submit application. Please check your profile completeness and try again.';
            alert(serverMsg);
        }
    };

    // Admin Functions
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const openCreateModal = () => {
        setEditMode(false);
        setCurrentJobId(null);
        setFormData({
            department: departments.length > 0 ? departments[0].id : '',
            title: '',
            description: '',
            requirements: '',
            job_type: 'ATTACHMENT',
            location: 'Nairobi, Kenya',
            slots_required: 1,
            duration_weeks: 12,
            deadline: ''
        });
        setIsModalOpen(true);
    };

    const openEditModal = (job) => {
        setEditMode(true);
        setCurrentJobId(job.id);
        setFormData({
            department: job.department || '',
            title: job.title,
            description: job.description,
            requirements: job.requirements,
            job_type: job.job_type,
            location: job.location,
            slots_required: job.slots_required || 1,
            duration_weeks: job.duration_weeks || 12,
            deadline: new Date(job.deadline).toISOString().slice(0, 16)
        });
        setIsModalOpen(true);
    };

    /**
     * Delete is a two-step, explicitly approved operation.
     *
     * The row button only opens the dialog; nothing is sent to the server until
     * the deletion is confirmed. `window.confirm` was used before, which is a
     * browser dialog that cannot name the vacancy, and whose message claimed the
     * action "cannot be undone" -- untrue, since a deleted vacancy is archived
     * and restorable from System Archives. The dialog now states what will
     * actually happen.
     */
    const [pendingDelete, setPendingDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [actionToast, setActionToast] = useState(null);

    const handleDelete = async (jobId) => {
        // Stage only. No request until the admin approves.
        setPendingDelete(jobId);
    };

    const confirmDelete = async () => {
        if (pendingDelete === null) return;
        const jobId = pendingDelete;
        const jobTitle = vacancies.find(j => j.id === jobId)?.title;
        setIsDeleting(true);
        try {
            await api.delete(`jobs/vacancies/${jobId}/`);
            setVacancies(prev => prev.filter(j => j.id !== jobId));
            setPendingDelete(null);
            setActionToast({
                type: 'success',
                title: 'Vacancy deleted',
                message: `'${jobTitle || 'The vacancy'}' has been withdrawn and moved to System Archives, where it can be restored.`,
            });
            // Re-read so the totals and any server-side filtering stay truthful.
            fetchJobs(archiveFilter);
        } catch (error) {
            console.error("Failed to delete job", error);
            setPendingDelete(null);
            setActionToast({
                type: 'error',
                title: 'Could not delete vacancy',
                message: error.response?.data?.detail
                    || 'The vacancy was not deleted. Please try again.',
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            const payload = {
                ...formData,
                department: formData.department ? parseInt(formData.department, 10) : null,
                slots_required: parseInt(formData.slots_required, 10) || 1,
                duration_weeks: parseInt(formData.duration_weeks, 10) || 12,
            };

            if (editMode && currentJobId) {
                const res = await api.put(`jobs/vacancies/${currentJobId}/`, payload);
                setVacancies(prev => prev.map(j => j.id === currentJobId ? res.data : j));
            } else {
                const res = await api.post('jobs/vacancies/', payload);
                setVacancies(prev => [res.data, ...prev]);
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error("Error saving job", error);
            alert("Failed to save the job posting. Ensure all fields are valid.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredVacancies = vacancies.filter(job => {
        if (selectedDepartment !== 'ALL' && String(job.department) !== String(selectedDepartment)) {
            return false;
        }
        return true;
    });

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16">
            {/* Success Alert popup */}
            {successMessage && (
                <div className="fixed top-20 right-4 md:right-8 z-50 animation-fade-in bg-green-50 border-l-4 border-green-500 p-4 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] max-w-sm flex items-start border border-y-green-200 border-r-green-200">
                    <svg className="w-6 h-6 text-green-500 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <div>
                        <h4 className="text-green-800 font-bold mb-1">Application Submitted!</h4>
                        <p className="text-green-700 text-sm font-medium">{successMessage}</p>
                    </div>
                    <button onClick={() => setSuccessMessage('')} className="ml-4 text-green-500 hover:text-green-700 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            )}
            
            <PageGuideHeader
                title="Industrial Attachment Opportunities"
                subtitle="Explore, review, and apply for open attachment positions across specialized ministry departments."
                badge="Attachment Openings"
                workflowKey={userRole === 'APPLICANT' ? 'attachee-journey' : 'hr-workflow'}
                currentStep={2}
                roleTips={{
                    APPLICANT: "Ensure your profile biodata and required documents are complete before submitting applications to speed up verification.",
                    HR: "Publish attachment openings and monitor application intake capacity across technical departments."
                }}
            />

            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Department Filter Dropdown */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-xl border border-slate-300 shadow-sm">
                        <span className="text-xs font-bold text-slate-600 uppercase">Department:</span>
                        <select
                            value={selectedDepartment}
                            onChange={(e) => {
                                setSelectedDepartment(e.target.value);
                                setSearchParams(e.target.value === 'ALL' ? {} : { department: e.target.value });
                            }}
                            className="text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
                        >
                            <option value="ALL">All Departments</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Archive Filter for HR/Admin */}
                    {['ADMIN', 'HR'].includes(userRole) && (
                        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-300 shadow-sm text-xs font-bold">
                            <button
                                type="button"
                                onClick={() => setArchiveFilter('ACTIVE')}
                                className={`px-3 py-1.5 rounded-lg transition-colors ${archiveFilter === 'ACTIVE' ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-200'}`}
                            >
                                Active
                            </button>
                            <button
                                type="button"
                                onClick={() => setArchiveFilter('ARCHIVED')}
                                className={`px-3 py-1.5 rounded-lg transition-colors ${archiveFilter === 'ARCHIVED' ? 'bg-amber-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}
                            >
                                Archived
                            </button>
                            <button
                                type="button"
                                onClick={() => setArchiveFilter('ALL')}
                                className={`px-3 py-1.5 rounded-lg transition-colors ${archiveFilter === 'ALL' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'text-slate-700 hover:bg-slate-200'}`}
                            >
                                All
                            </button>
                        </div>
                    )}
                </div>

                {['ADMIN', 'HR'].includes(userRole) && (
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleBulkArchive}
                            title="Bulk archive all vacancies past their deadline"
                            className="bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300 px-4 py-2.5 rounded-xl font-bold transition-all text-xs flex items-center gap-1.5 shadow-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                            Bulk Archive Expired
                        </button>
                        <button 
                            onClick={openCreateModal}
                            className="bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] px-5 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 text-xs shadow-sm"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            Post Attachment Vacancy
                        </button>
                    </div>
                )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 pb-12">
                {/* A failed request must not look like an empty system. That is
                    exactly what hid a 403 here for a long time: the catch
                    handler cleared the list, the page rendered "no vacancies
                    found", and nothing on screen said the request had failed. */}
                {loadError && vacancies.length === 0 ? (
                    <div className="col-span-full py-16 text-center bg-rose-50 rounded-2xl border border-rose-200 shadow-sm">
                        <p className="text-xl text-rose-900 font-black">
                            Unable to load vacancies
                        </p>
                        <p className="text-rose-800 mt-2 font-semibold text-sm">
                            {loadError.response?.data?.detail
                                || 'The vacancy list could not be retrieved. Please try again.'}
                        </p>
                        <button
                            type="button"
                            onClick={() => { setLoadError(null); fetchJobs(archiveFilter); }}
                            className="mt-5 px-4 py-2 rounded-lg bg-white border border-rose-300 text-rose-800 text-sm font-black hover:bg-rose-100"
                        >
                            Try again
                        </button>
                    </div>
                ) : filteredVacancies.length === 0 ? (
                    <div className="col-span-full py-16 text-center bg-white rounded-2xl border-2 border-dashed border-slate-300 shadow-sm">
                        <div className="bg-primary-50 w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 text-primary-700 border border-primary-200">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                        </div>
                        <p className="text-xl text-slate-800 font-black">No vacancies found matching the selected filter.</p>
                        <p className="text-slate-600 mt-2 font-semibold">Please select a different department or check back later.</p>
                    </div>
                 ) : null}
                 
                {filteredVacancies.map(job => (
                    <div key={job.id} className="bg-white p-7 rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-primary-300 flex flex-col justify-between transition-all duration-300 group relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary-50 rounded-bl-full -z-10 group-hover:bg-primary-50 transition-colors"></div>
                        <div>
                            {/* Department tag */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                                <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary-900 bg-primary-50 px-3 py-1 rounded-md border border-primary-200 truncate">
                                    <svg className="w-3.5 h-3.5 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                    <span className="truncate">{job.department_name || 'General Department'}</span>
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {job.is_archived && (
                                        <span className="text-2xs bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1 rounded font-black uppercase tracking-wider">
                                            Archived
                                        </span>
                                    )}
                                    <span className="text-2xs bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-1 rounded font-black uppercase tracking-wider whitespace-nowrap">
                                        {job.job_type.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>

                            <div className="mb-3">
                                <h3 className="font-black text-xl text-slate-900 group-hover:text-primary-700 transition-colors leading-tight break-words">{job.title}</h3>
                            </div>

                            {/* Slot allocation & capacity badges */}
                            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                                <span className={`px-3 py-1 rounded-lg font-black border flex items-center gap-1.5 ${
                                    job.is_full 
                                        ? 'bg-red-50 text-red-800 border-red-300' 
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                }`}>
                                    <span className={`w-2 h-2 rounded-full ${job.is_full ? 'bg-red-600' : 'bg-emerald-600 animate-pulse'}`}></span>
                                    {job.slots_filled || 0} of {job.slots_required || 1} slots filled
                                </span>

                                <span className="px-3 py-1 bg-primary-50 text-primary-900 border border-primary-200 rounded-lg font-black text-xs flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-primary-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {job.duration_weeks || 12} Weeks Attachment
                                </span>

                                {job.is_full && (
                                    <span className="px-2.5 py-1 bg-red-100 text-red-900 border border-red-300 text-2xs font-black uppercase rounded-md">
                                        Capacity Full
                                    </span>
                                )}
                            </div>
                            
                            <div className="flex flex-wrap gap-2 text-xs text-slate-800 mb-5 font-bold bg-primary-50 p-3.5 rounded-xl border border-primary-100">
                                <span className="flex items-center">
                                    <svg className="w-4 h-4 mr-1.5 text-primary-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                    <span className="truncate max-w-[120px]" title={job.location}>{job.location}</span>
                                </span>
                                <span className="text-slate-300 hidden sm:inline">|</span> 
                                <span className={`flex items-center px-2.5 py-0.5 rounded ml-auto sm:ml-0 font-bold ${
                                    isPastDeadline(job.deadline)
                                        ? 'text-red-800 bg-red-100 border border-red-300'
                                        : 'text-amber-800 bg-amber-50 border border-amber-200'
                                }`}>
                                    <svg className="w-4 h-4 mr-1.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    {isPastDeadline(job.deadline)
                                        ? '⛔ Closed'
                                        : `Due: ${new Date(job.deadline).toLocaleDateString()}`
                                    }
                                </span>
                            </div>
                            
                            <div className="mb-8">
                                <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">Description</h4>
                                <div className="relative">
                                    {/* Rich text, rendered through the shared component so
                                        a description looks the same here, on the public
                                        landing page and in every other view. */}
                                    <RichText
                                        html={job.description}
                                        className={`text-sm text-slate-700 font-medium ${expandedJobs[job.id] ? '' : 'line-clamp-3'}`}
                                    />
                                    {/* Measured on the visible text, not the markup: the
                                        raw string length includes every tag. */}
                                    {richTextToPlainText(job.description).length > 150 && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); toggleReadMore(job.id); }}
                                            className="text-primary-700 hover:text-primary-800 text-xs font-black mt-2 focus:outline-none flex items-center transition-colors"
                                        >
                                            {expandedJobs[job.id] ? 'Read less' : 'Read more'}
                                            <svg className={`w-3 h-3 ml-1 transform transition-transform duration-200 ${expandedJobs[job.id] ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-auto pt-4 border-t border-slate-100">
                            {userRole === 'APPLICANT' && (
                                isPastDeadline(job.deadline) ? (
                                    <div className="w-full bg-red-50 border border-red-200 rounded-xl py-3 px-4 text-center">
                                        <p className="text-red-700 font-extrabold text-sm">⛔ Applications Closed</p>
                                        <p className="text-red-500 text-xs mt-0.5">Deadline: {new Date(job.deadline).toLocaleString()}</p>
                                    </div>
                                ) : job.is_full ? (
                                    <div className="w-full bg-red-50 border border-red-200 rounded-xl py-3 px-4 text-center">
                                        <p className="text-red-800 font-extrabold text-sm">⛔ All Slots Filled</p>
                                        <p className="text-red-600 text-xs mt-0.5">Capacity limit of {job.slots_required} has been reached</p>
                                    </div>
                                ) : appliedJobIds.has(job.id) ? (
                                    <div className="w-full bg-green-50 border border-green-200 rounded-xl py-3 px-4 text-center">
                                        <p className="text-green-800 font-extrabold text-sm">✅ Already Applied</p>
                                        <p className="text-green-600 text-xs mt-0.5">Check <strong>My Applications</strong> to track status</p>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => applyForJob(job.id)} 
                                        disabled={statsLoading || !stats.can_apply}
                                        className={`w-full font-black py-3.5 rounded-xl transition-all duration-300 shadow-sm ${
                                            statsLoading ? 'bg-slate-100 text-slate-400 cursor-not-allowed' :
                                            !stats.can_apply ? 'bg-slate-200 text-slate-600 cursor-not-allowed border border-slate-300 font-bold' :
                                            'bg-gradient-to-r from-primary-700 to-primary-600 hover:from-primary-800 hover:to-primary-700 text-white shadow-md hover:-translate-y-0.5'
                                        }`}>
                                        {statsLoading ? 'Evaluating Profile...' : (!stats.can_apply ? 'Complete Profile to Apply' : 'Submit Application')}
                                    </button>
                                )
                            )}
                            
                            {['ADMIN', 'HR'].includes(userRole) && (
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => openEditModal(job)}
                                        className="col-span-1 bg-amber-50 text-amber-900 hover:bg-amber-600 hover:text-white border border-amber-300 font-black py-2 rounded-xl transition-colors text-xs flex items-center justify-center"
                                    >
                                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                        Edit
                                    </button>
                                    <button 
                                        onClick={() => toggleArchiveJob(job.id)}
                                        className={`col-span-1 border font-black py-2 rounded-xl transition-colors text-xs flex items-center justify-center ${job.is_archived ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200' : 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'}`}
                                    >
                                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                        {job.is_archived ? 'Unarchive' : 'Archive'}
                                    </button>
                                    {/*
                                        Shown to Admin only. This used to be
                                        `userRole !== 'HR'`, which displayed the button
                                        exclusively to roles the API refused (Admin got
                                        403, Director got 403) and hid it from the one role
                                        that could have used it. HR has the
                                        Archive/Unarchive control immediately above, which
                                        does the same job, so offering both would just be
                                        two controls for one action.
                                    */}
                                    {userRole === 'ADMIN' && (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(job.id)}
                                            className="col-span-1 bg-red-50 text-red-700 hover:bg-red-600 hover:text-white border border-red-200 font-black py-2 rounded-xl transition-colors text-xs flex items-center justify-center"
                                        >
                                            <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a2 2 0 00-1-1h-4a2 2 0 00-1 1v3M4 7h16"></path></svg>
                                            Delete
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => navigate('/manage-jobs')}
                                        className={`${userRole === 'HR' ? 'col-span-1' : 'col-span-1'} bg-slate-100 text-slate-800 hover:bg-slate-900 hover:text-white border border-slate-300 font-black py-2 rounded-xl transition-all shadow-sm text-xs flex items-center justify-center`}
                                    >
                                        Applications
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Admin Create/Edit Modal */}
            {isModalOpen && ['ADMIN', 'HR'].includes(userRole) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-gray-900/60 backdrop-blur-sm animation-fade-in overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-auto relative border-t-8 border-t-primary-500 flex flex-col max-h-[90vh]">
                        
                        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100 shrink-0">
                            <h3 className="text-2xl font-black text-gray-900 flex items-center">
                                {editMode ? (
                                    <><svg className="w-6 h-6 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg> Edit Job Posting</>
                                ) : (
                                    <><svg className="w-6 h-6 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg> Create New Vacancy</>
                                )}
                            </h3>
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-full p-2 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto">
                            <form id="jobForm" onSubmit={handleSubmit} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Department</label>
                                        <select
                                            name="department"
                                            value={formData.department}
                                            onChange={handleInputChange}
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-3 font-medium cursor-pointer"
                                        >
                                            <option value="">-- Select Department --</option>
                                            {departments.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Job Title *</label>
                                        <input 
                                            type="text" 
                                            name="title" 
                                            required 
                                            value={formData.title} 
                                            onChange={handleInputChange}
                                            placeholder="e.g. Petroleum Engineering Attachee"
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-3 font-medium transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Slots Required (Capacity) *</label>
                                        <input 
                                            type="number" 
                                            name="slots_required" 
                                            min="1"
                                            max="500"
                                            required 
                                            value={formData.slots_required} 
                                            onChange={handleInputChange}
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-3 font-medium text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Attachment Duration (Weeks) *</label>
                                        <input 
                                            type="number" 
                                            name="duration_weeks" 
                                            min="1"
                                            max="52"
                                            required 
                                            value={formData.duration_weeks} 
                                            onChange={handleInputChange}
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-3 font-medium text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Location</label>
                                        <input 
                                            type="text" 
                                            name="location" 
                                            required 
                                            value={formData.location} 
                                            onChange={handleInputChange}
                                            placeholder="e.g. Nairobi Head Office"
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-3 font-medium"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Application Deadline *</label>
                                        <input 
                                            type="datetime-local" 
                                            name="deadline" 
                                            required 
                                            value={formData.deadline} 
                                            onChange={handleInputChange}
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-3 font-medium text-sm"
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Job Description</label>
                                        {/* Rich text: the description is authored once by
                                            the Director/HR and rendered as HTML to every
                                            applicant, so it supports headings, emphasis,
                                            lists and links. The server sanitizes it on
                                            save, and the ATS scorer strips the markup back
                                            to plain words before keyword matching. */}
                                        <RichTextEditor
                                            value={formData.description}
                                            onChange={(html) => setFormData(prev => ({ ...prev, description: html }))}
                                            aria-label="Job description"
                                            minHeight={200}
                                        />
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Requirements (ATS Keywords)</label>
                                        <div className="text-xs text-primary-readable mb-2 font-medium bg-primary-50 p-2 rounded inline-flex items-center">
                                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                            Our ATS will cross-reference these precise words against applicant profiles.
                                        </div>
                                        {/* Deliberately a plain textarea, not the rich-text
                                            editor. These are scoring keywords, not prose:
                                            formatting here would add markup tokens to the
                                            keyword set and depress applicant scores. */}
                                        <textarea
                                            name="requirements"
                                            required
                                            rows="4"
                                            value={formData.requirements}
                                            onChange={handleInputChange}
                                            placeholder="e.g. Degree Diploma Engineering Computer Science Python Django..."
                                            className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 block p-3 font-medium resize-y"
                                        ></textarea>
                                        <p className="text-xs text-slate-500 mt-1.5 font-medium">
                                            Comma-separated keywords only — no formatting. Use the
                                            Job Description above for headings, lists and emphasis.
                                        </p>
                                    </div>
                                </div>
                            </form>
                        </div>
                        
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl shrink-0 flex justify-end gap-3">
                            <button 
                                type="button" 
                                onClick={() => setIsModalOpen(false)}
                                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                type="submit" 
                                form="jobForm"
                                disabled={isSubmitting}
                                className={`px-6 py-2.5 rounded-xl font-bold text-white transition-all shadow-sm flex items-center ${
                                    isSubmitting ? 'bg-primary-400 cursor-not-allowed' : 'bg-primary-600 hover:bg-primary sm:hover:-translate-y-0.5 hover:shadow-md'
                                }`}
                            >
                                {isSubmitting ? (
                                    <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> Saving...</>
                                ) : (
                                    <>{editMode ? 'Save Changes' : 'Publish Vacancy'}</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Vacancy deletion approval.
                Nothing is deleted when this opens; the request is only sent from
                confirmDelete, i.e. after the admin approves. */}
            <ConfirmDialog
                open={pendingDelete !== null}
                tone="danger"
                title="Delete this vacancy?"
                message={(
                    <>
                        <p className="mb-2">
                            <span className="font-black text-slate-900">
                                {pendingDelete !== null
                                    ? vacancies.find(j => j.id === pendingDelete)?.title
                                    : ''}
                            </span>{' '}
                            will be withdrawn from the active vacancy list and removed from the
                            public page.
                        </p>
                        <p>
                            Applications already submitted against it are kept, and the vacancy
                            moves to System Archives, where an administrator can restore it. An
                            audit entry is recorded.
                        </p>
                    </>
                )}
                confirmLabel="Yes, delete vacancy"
                cancelLabel="Keep vacancy"
                busy={isDeleting}
                onConfirm={confirmDelete}
                onCancel={() => setPendingDelete(null)}
            />

            <StatusToast toast={actionToast} onDismiss={() => setActionToast(null)} />

            {/* Cover Letter / Apply Modal */}
            {applyModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl relative border-t-8 border-t-primary-500">
                        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
                            <h3 className="text-xl font-black text-gray-900 flex items-center">
                                <svg className="w-5 h-5 mr-2 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Write Your Cover Letter
                            </h3>
                            <button
                                onClick={() => setApplyModal({ open: false, jobId: null, coverLetter: '', submitting: false })}
                                className="text-gray-400 hover:text-red-500 bg-gray-50 hover:bg-red-50 rounded-full p-2 transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-2">
                                <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-amber-800 text-sm font-medium">
                                    <strong>ATS Tip:</strong> Use keywords from the job description and requirements in your cover letter to improve your automated match score.
                                </p>
                            </div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Cover Letter <span className="text-red-500">*</span></label>
                            <textarea
                                rows={8}
                                value={applyModal.coverLetter}
                                onChange={e => setApplyModal(prev => ({ ...prev, coverLetter: e.target.value }))}
                                placeholder="Dear Hiring Manager,&#10;&#10;I am writing to express my interest in this position. With my background in [field], I believe I am well-suited for this role because...&#10;&#10;My key qualifications include...&#10;&#10;I look forward to the opportunity to contribute to your team."
                                className="w-full bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:ring-primary-500 focus:border-primary-500 p-3 font-medium resize-y text-sm"
                            />
                            <p className="text-xs text-gray-400 mt-1 font-medium">{applyModal.coverLetter.length} characters</p>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setApplyModal({ open: false, jobId: null, coverLetter: '', submitting: false })}
                                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={submitApplication}
                                disabled={applyModal.submitting || !applyModal.coverLetter.trim()}
                                className={`px-6 py-2.5 rounded-xl font-bold text-white transition-all shadow-sm flex items-center ${
                                    applyModal.submitting || !applyModal.coverLetter.trim()
                                        ? 'bg-primary-300 cursor-not-allowed'
                                        : 'bg-primary-600 hover:bg-primary hover:-translate-y-0.5 hover:shadow-md'
                                }`}
                            >
                                {applyModal.submitting ? (
                                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" /> Submitting...</>
                                ) : (
                                    'Submit Application'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
