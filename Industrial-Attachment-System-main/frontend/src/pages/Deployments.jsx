import React, { useState, useEffect } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import { exportToCSV, printTable } from '../utils/downloadUtils';
import { minStartDate, startDateError } from '../utils/dateGuards';

export default function Deployments() {
    const userRole = useAuthStore(state => state.user?.role || 'APPLICANT');
    const [deployments, setDeployments] = useState([]);
    const [successfulApps, setSuccessfulApps] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [deptFilter, setDeptFilter] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    // Deploy Modal State
    const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
    const [deployForm, setDeployForm] = useState({
        application: '',
        department: '',
        start_date: '',
        planned_end_date: '',
    });
    const [isSubmittingDeploy, setIsSubmittingDeploy] = useState(false);

    // Exit Modal State
    const [selectedForExit, setSelectedForExit] = useState(null);
    const [exitDate, setExitDate] = useState(new Date().toISOString().slice(0, 10));
    const [isSubmittingExit, setIsSubmittingExit] = useState(false);

    // Notification State
    const [notification, setNotification] = useState('');

    useEffect(() => {
        if (['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole)) {
            fetchDeployments();
            fetchDepartments();
            fetchSuccessfulApplications();
        } else {
            setLoading(false);
        }
    }, [userRole, statusFilter, deptFilter]);

    const fetchDeployments = async () => {
        try {
            setLoading(true);
            let url = 'jobs/deployments/?';
            if (statusFilter !== 'ALL') url += `status=${statusFilter}&`;
            // The department filter is only offered to Admin/HR. A Director's
            // list is already hard-scoped to their own department by the
            // backend, which rejects a foreign department value with 403.
            if (deptFilter !== 'ALL' && ['ADMIN', 'HR'].includes(userRole)) url += `department=${deptFilter}&`;

            const res = await api.get(url);
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setDeployments(data);
        } catch (err) {
            console.error('Failed to load deployments:', err);
            setDeployments([]);
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

    const fetchSuccessfulApplications = async () => {
        try {
            const res = await api.get('jobs/applications/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            // Only successful applicants are deployable. The previous HIRED
            // filter matched a status that no longer exists, which silently
            // emptied this picker and made deployment impossible.
            const successful = data.filter(a => a.status === 'SUCCESSFUL');
            setSuccessfulApps(successful);
        } catch (err) {
            console.error('Failed to load successful applications:', err);
        }
    };

    const deployStartError = startDateError(deployForm.start_date, 'Deployment start date');

    const handleDeploySubmit = async (e) => {
        e.preventDefault();
        if (!deployForm.application || !deployForm.department || !deployForm.start_date || !deployForm.planned_end_date) {
            alert('Please fill out all required deployment fields.');
            return;
        }
        // A deployment records an attachment starting now, so a past start date
        // is refused here as well as in the field.
        if (deployStartError) {
            alert(deployStartError);
            return;
        }

        try {
            setIsSubmittingDeploy(true);
            await api.post('jobs/deployments/', deployForm);
            setNotification('Applicant successfully deployed to department!');
            setIsDeployModalOpen(false);
            setDeployForm({ application: '', department: '', start_date: '', planned_end_date: '' });
            fetchDeployments();
            fetchSuccessfulApplications();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Deployment failed:', err);
            alert(err.response?.data?.detail || err.response?.data?.application?.[0] || 'Failed to deploy applicant.');
        } finally {
            setIsSubmittingDeploy(false);
        }
    };

    const handleExitSubmit = async (e) => {
        e.preventDefault();
        if (!selectedForExit) return;

        try {
            setIsSubmittingExit(true);
            await api.post(`jobs/deployments/${selectedForExit.id}/exit/`, {
                actual_end_date: exitDate
            });
            setNotification(`Deployment for ${selectedForExit.applicant_name} completed. Dual clearance unlocked!`);
            setSelectedForExit(null);
            fetchDeployments();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Exit failed:', err);
            alert(err.response?.data?.detail || 'Failed to exit deployment.');
        } finally {
            setIsSubmittingExit(false);
        }
    };

    if (!['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(userRole)) {
        return (
            <div className="text-center p-10 font-bold text-red-500 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10">
                Access Denied. Management Privileges Required.
            </div>
        );
    }

    const filteredDeployments = deployments.filter(d => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            d.applicant_name?.toLowerCase().includes(term) ||
            d.department_name?.toLowerCase().includes(term) ||
            d.job_title?.toLowerCase().includes(term)
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
                title="Attachee Department Deployments & Exits"
                subtitle="Formally deploy successful applicants to ministry departments and record attachment completion exits to trigger dual clearance."
                badge="Deployment Management"
                workflowKey="hr-workflow"
                currentStep={3}
                roleTips={{
                    HR: "Deploy successful applicants to departments. When an attachment period finishes, register their Exit to initiate Stage 1 Department clearance."
                }}
            />

            <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="relative w-full sm:w-72">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search attachees by name or role..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary-600 shadow-sm"
                    />
                    <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {['ADMIN', 'HR'].includes(userRole) && (
                        <select
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                            className="bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold rounded-xl px-3 py-2 shadow-sm focus:outline-none"
                        >
                            <option value="ALL">All Departments</option>
                            {departments.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    )}

                    <div className="flex bg-slate-50 border border-slate-300 rounded-xl p-1 shadow-sm text-xs font-bold">
                        <button
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === 'ALL' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'text-slate-700 hover:bg-slate-200'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setStatusFilter('DEPLOYED')}
                            className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === 'DEPLOYED' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => setStatusFilter('EXITED')}
                            className={`px-3 py-1.5 rounded-lg transition-colors ${statusFilter === 'EXITED' ? 'bg-accent-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}
                        >
                            Exited
                        </button>
                    </div>

                    {['ADMIN', 'HR'].includes(userRole) && (
                        <>
                            <button
                                onClick={() => {
                                    const headers = ['Attachee', 'Department', 'Role', 'Status', 'Start Date', 'Planned End', 'Actual End'];
                                    const rows = filteredDeployments.map(d => [
                                        d.applicant_name, d.department_name, d.job_title,
                                        d.status, d.start_date || '', d.planned_end_date || '', d.actual_end_date || ''
                                    ]);
                                    exportToCSV('deployments_report', headers, rows, {
                                        reportTitle: 'Attachee Deployments Register',
                                        subtitle: 'Department deployment records — Active and Exited attachees'
                                    });
                                }}
                                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all text-xs shadow-sm flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export CSV
                            </button>
                            <button
                                onClick={() => printTable(
                                    'Attachee Deployments Register',
                                    'Department deployment records — Active and Exited attachees',
                                    ['Attachee', 'Department', 'Role', 'Status', 'Start Date', 'Planned End', 'Actual End'],
                                    filteredDeployments.map(d => [
                                        d.applicant_name, d.department_name, d.job_title,
                                        d.status, d.start_date || '—', d.planned_end_date || '—', d.actual_end_date || '—'
                                    ])
                                )}
                                className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl font-bold transition-all text-xs shadow-sm flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print
                            </button>
                            <button
                                onClick={() => setIsDeployModalOpen(true)}
                                className="bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all text-xs shadow-md flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                                Deploy Candidate
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Deployments Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-20 text-center flex justify-center items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                    </div>
                ) : filteredDeployments.length === 0 ? (
                    <div className="p-16 text-center text-gray-400">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-1">No Deployments Found</h3>
                        <p className="text-sm font-medium">No candidates currently match the selected deployment filters.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Attachee Details</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Assigned Department</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Period</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Dual Clearance</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100 text-sm">
                                {filteredDeployments.map(d => (
                                    <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-extrabold text-gray-900">{d.applicant_name}</div>
                                            <div className="text-xs text-gray-400">{d.applicant_email}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-xs font-bold text-primary-700 bg-primary-50 px-2.5 py-1 rounded border border-primary-100">
                                                {d.department_name}
                                            </span>
                                            <div className="text-xs text-gray-500 font-medium mt-0.5">{d.job_title}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600">
                                            <div className="font-semibold">{d.start_date} &rarr; {d.planned_end_date}</div>
                                            {d.actual_end_date && (
                                                <div className="text-accent-800 font-bold mt-0.5">Exited: {d.actual_end_date}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 text-xs font-black uppercase rounded-full border ${
                                                d.status === 'DEPLOYED' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                                d.status === 'EXITED' ? 'bg-accent-50 text-accent-800 border-accent-200' :
                                                'bg-gray-100 text-gray-700 border-gray-200'
                                            }`}>
                                                {d.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {d.clearance ? (
                                                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md border ${
                                                    d.clearance.status === 'CLEARED' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                                    d.clearance.status === 'PENDING_HR' ? 'bg-accent-50 text-accent-800 border-accent-200' :
                                                    d.clearance.status === 'PENDING_DEPARTMENT' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                                    'bg-gray-100 text-gray-700'
                                                }`}>
                                                    {d.clearance.status.replace(/_/g, ' ')}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">Pending Exit</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-xs">
                                            {d.status === 'DEPLOYED' && ['ADMIN', 'HR'].includes(userRole) && (
                                                <button
                                                    onClick={() => {
                                                        setSelectedForExit(d);
                                                        setExitDate(new Date().toISOString().slice(0, 10));
                                                    }}
                                                    className="px-3.5 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-600 hover:text-white font-bold rounded-lg transition-all border border-purple-200"
                                                >
                                                    Exit & Trigger Clearance
                                                </button>
                                            )}
                                            {d.status === 'EXITED' && (
                                                <span className="text-xs text-gray-400 font-semibold">Exited</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Deploy Applicant Modal */}
            {isDeployModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border-t-8 border-t-primary-500 overflow-hidden">
                        <div className="flex justify-between items-center px-6 py-5 border-b border-gray-100">
                            <h3 className="text-xl font-black text-gray-900">Deploy Candidate to Department</h3>
                            <button
                                onClick={() => setIsDeployModalOpen(false)}
                                className="text-gray-400 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleDeploySubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Selected Candidate (Successful) *
                                </label>
                                <select
                                    required
                                    value={deployForm.application}
                                    onChange={(e) => {
                                        const appId = e.target.value;
                                        const app = successfulApps.find(a => a.id === parseInt(appId));
                                        setDeployForm({
                                            ...deployForm,
                                            application: appId,
                                            department: app?.job?.department || deployForm.department,
                                        });
                                    }}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">-- Choose Candidate --</option>
                                    {successfulApps.map(a => (
                                        <option key={a.id} value={a.id}>
                                            {a.applicant_name} ({a.job_title})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    Target Department *
                                </label>
                                <select
                                    required
                                    value={deployForm.department}
                                    onChange={(e) => setDeployForm({ ...deployForm, department: e.target.value })}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">-- Select Department --</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Start Date *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        min={minStartDate()}
                                        value={deployForm.start_date}
                                        onChange={(e) => setDeployForm({ ...deployForm, start_date: e.target.value })}
                                        aria-invalid={Boolean(deployStartError)}
                                        aria-describedby={deployStartError ? 'deploy-start-error' : undefined}
                                        className={`w-full bg-gray-50 border rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500 ${
                                            deployStartError ? 'border-rose-400 ring-1 ring-rose-200' : 'border-gray-200'
                                        }`}
                                    />
                                    {deployStartError && (
                                        <p
                                            id="deploy-start-error"
                                            role="alert"
                                            className="mt-1.5 text-xs font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5"
                                        >
                                            {deployStartError}
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Planned End Date *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={deployForm.planned_end_date}
                                        onChange={(e) => setDeployForm({ ...deployForm, planned_end_date: e.target.value })}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-sm font-medium focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsDeployModalOpen(false)}
                                    className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingDeploy}
                                    className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl font-bold text-sm shadow-md transition-all flex items-center"
                                >
                                    {isSubmittingDeploy ? 'Deploying...' : 'Confirm Deployment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Exit Candidate Modal */}
            {selectedForExit && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border-t-8 border-t-purple-500 overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-xl font-black text-gray-900 mb-1">Exit Attachee Deployment</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                Exiting marks the attachment as concluded and initializes the dual clearance workflow.
                            </p>

                            <div className="bg-purple-50 p-3.5 rounded-xl border border-purple-200 mb-4 text-xs">
                                <div className="font-extrabold text-purple-900">{selectedForExit.applicant_name}</div>
                                <div className="text-purple-700 mt-0.5">{selectedForExit.department_name}</div>
                            </div>

                            <form onSubmit={handleExitSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Actual Completion / Exit Date *
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        value={exitDate}
                                        onChange={(e) => setExitDate(e.target.value)}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-medium focus:ring-2 focus:ring-purple-500"
                                    />
                                </div>

                                <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedForExit(null)}
                                        className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingExit}
                                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center"
                                    >
                                        {isSubmittingExit ? 'Processing Exit...' : 'Confirm Exit & Unlock Clearance'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
