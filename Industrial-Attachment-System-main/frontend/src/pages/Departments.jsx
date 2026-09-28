import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';
import RichTextEditor from '../components/RichTextEditor';
import ExpandableRichText from '../components/ExpandableRichText';
import { richTextToPlainText } from '../utils/richText';

export default function Departments() {
    const navigate = useNavigate();
    const userRole = useAuthStore(state => state.user?.role || 'APPLICANT');
    const [departments, setDepartments] = useState([]);
    const [availableDirectors, setAvailableDirectors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDept, setEditingDept] = useState(null);
    const [directorMode, setDirectorMode] = useState('SELECT'); // 'SELECT' | 'CREATE' | 'NONE'

    // Which department descriptions are showing their full text. Keyed by
    // department id so each one is independent: expanding one leaves every
    // other department collapsed, and a reader who opened a mandate and then
    // filtered the list gets it back open.
    const [expandedDepartments, setExpandedDepartments] = useState(() => new Set());

    const toggleDepartmentDescription = (id) => {
        setExpandedDepartments((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Delete state & dependency handling
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteErrorData, setDeleteErrorData] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        location: '',
        contact_email: '',
        contact_phone: '',
        typical_intake_capacity: '',
        director: '',
        is_active: true,
        new_director_first_name: '',
        new_director_last_name: '',
        new_director_email: '',
        new_director_password: '',
    });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [notification, setNotification] = useState('');

    const fetchDepartments = async () => {
        try {
            setLoading(true);
            const res = await api.get('jobs/departments/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setDepartments(data);
        } catch (err) {
            console.error('Failed to load departments:', err);
            setDepartments([]);
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailableDirectors = async () => {
        if (userRole !== 'ADMIN') return;
        try {
            const res = await api.get('jobs/departments/directors-available/');
            setAvailableDirectors(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Failed to load available directors:', err);
        }
    };

    useEffect(() => {
        fetchDepartments();
        fetchAvailableDirectors();
    }, []);

    const openCreateModal = () => {
        setEditingDept(null);
        setDirectorMode('SELECT');
        setFormData({
            name: '',
            description: '',
            location: '',
            contact_email: '',
            contact_phone: '',
            typical_intake_capacity: '10',
            director: '',
            is_active: true,
            new_director_first_name: '',
            new_director_last_name: '',
            new_director_email: '',
            new_director_password: '',
        });
        setIsModalOpen(true);
    };

    const openEditModal = (dept) => {
        setEditingDept(dept);
        setDirectorMode(dept.director ? 'SELECT' : 'NONE');
        setFormData({
            name: dept.name,
            description: dept.description || '',
            location: dept.location || '',
            contact_email: dept.contact_email || '',
            contact_phone: dept.contact_phone || '',
            typical_intake_capacity: dept.typical_intake_capacity || '',
            director: dept.director || '',
            is_active: dept.is_active,
            new_director_first_name: '',
            new_director_last_name: '',
            new_director_email: '',
            new_director_password: '',
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const payload = {
            name: formData.name,
            description: formData.description,
            location: formData.location,
            contact_email: formData.contact_email,
            contact_phone: formData.contact_phone,
            typical_intake_capacity: formData.typical_intake_capacity ? parseInt(formData.typical_intake_capacity) : null,
            is_active: formData.is_active,
        };

        if (directorMode === 'CREATE') {
            payload.new_director = {
                first_name: formData.new_director_first_name,
                last_name: formData.new_director_last_name,
                email: formData.new_director_email,
                password: formData.new_director_password || 'DirectorPass2026!',
            };
        } else if (directorMode === 'SELECT') {
            payload.director = formData.director ? parseInt(formData.director) : null;
        } else {
            payload.director = null;
        }

        try {
            if (editingDept) {
                await api.patch(`jobs/departments/${editingDept.id}/`, payload);
                setNotification('Department details updated successfully!');
            } else {
                await api.post('jobs/departments/', payload);
                setNotification('New department registered successfully!');
            }
            setIsModalOpen(false);
            fetchDepartments();
            fetchAvailableDirectors();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Error saving department:', err);
            const msg = err.response?.data?.detail || err.response?.data?.name?.[0] || 'Failed to save department.';
            alert(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePromptDelete = (dept) => {
        setDeleteTarget(dept);
        setDeleteErrorData(null);
    };

    const handleExecuteDelete = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        setDeleteErrorData(null);

        try {
            await api.delete(`jobs/departments/${deleteTarget.id}/`);
            setNotification(`Department '${deleteTarget.name}' was permanently deleted.`);
            setDeleteTarget(null);
            fetchDepartments();
            fetchAvailableDirectors();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Error deleting department:', err);
            const resData = err.response?.data;
            if (resData?.has_dependencies) {
                setDeleteErrorData(resData);
            } else {
                alert(resData?.detail || 'Failed to delete department.');
                setDeleteTarget(null);
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeactivateInstead = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);

        try {
            await api.delete(`jobs/departments/${deleteTarget.id}/?deactivate=true`);
            setNotification(`Department '${deleteTarget.name}' has been safely deactivated.`);
            setDeleteTarget(null);
            setDeleteErrorData(null);
            fetchDepartments();
            fetchAvailableDirectors();
            setTimeout(() => setNotification(''), 4000);
        } catch (err) {
            console.error('Error deactivating department:', err);
            alert('Failed to deactivate department.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleActive = async (dept) => {
        try {
            await api.patch(`jobs/departments/${dept.id}/`, {
                is_active: !dept.is_active
            });
            setNotification(`Department ${dept.is_active ? 'deactivated' : 'reactivated'} successfully!`);
            fetchDepartments();
            setTimeout(() => setNotification(''), 3000);
        } catch (err) {
            console.error('Error toggling status:', err);
            alert('Failed to update status.');
        }
    };

    const filteredDepartments = departments.filter(d => {
        const matchesStatus = filterStatus === 'ALL' || (filterStatus === 'ACTIVE' ? d.is_active : !d.is_active);
        // Search the visible words, not the source. A description is now rich
        // text, so matching against the raw string would make a search for
        // "list" also hit every description containing a <li> tag, and a search
        // for a department's actual wording would miss it behind its markup.
        // richTextToPlainText also decodes entities, so "R&D" finds "R&amp;D".
        const descriptionText = richTextToPlainText(d.description).toLowerCase();
        const matchesSearch = d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            descriptionText.includes(searchTerm.toLowerCase()) ||
            (d.director_name && d.director_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (d.location && d.location.toLowerCase().includes(searchTerm.toLowerCase()));
        return matchesStatus && matchesSearch;
    });

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            {notification && (
                <div className="fixed top-20 right-4 md:right-8 z-50 bg-emerald-50 border-l-4 border-emerald-600 p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in">
                    <svg className="w-6 h-6 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-emerald-900 text-sm font-bold">{notification}</p>
                </div>
            )}

            <PageGuideHeader
                title="Department Management & Governance"
                subtitle="Configure departments, appoint Department Directors, set intake capacities, and manage attachment vacancies."
                badge="Administration"
                workflowKey="admin-workflow"
                currentStep={1}
                actions={
                    userRole === 'ADMIN' ? (
                        <button
                            onClick={openCreateModal}
                            className="bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold py-2.5 px-5 rounded-2xl transition-all shadow-md flex items-center gap-2 text-sm"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            <span>Add New Department</span>
                        </button>
                    ) : null
                }
            />

            {/* Filter and Search Bar */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative w-full md:w-96">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search department, director, or office..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600 shadow-sm"
                    />
                    <svg className="w-5 h-5 text-slate-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider mr-1">Status:</span>
                    {['ALL', 'ACTIVE', 'INACTIVE'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                filterStatus === status
                                    ? 'bg-primary-600 text-[var(--color-primary-on)] border-primary-700 shadow-sm'
                                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                            }`}
                        >
                            {status === 'ALL' ? 'All Departments' : status}
                        </button>
                    ))}
                </div>
            </div>

            {/* Departments Grid */}
            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                </div>
            ) : filteredDepartments.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">No Departments Found</h3>
                    <p className="text-slate-600 text-sm max-w-sm mx-auto mb-6">
                        No departments match your search or filter criteria.
                    </p>
                    {userRole === 'ADMIN' && (
                        <button
                            onClick={openCreateModal}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] text-sm font-bold rounded-xl shadow-sm"
                        >
                            Register Department
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredDepartments.map(dept => (
                        <div
                            key={dept.id}
                            className={`bg-white rounded-2xl p-6 border shadow-sm flex flex-col justify-between transition-all hover:shadow-md ${
                                dept.is_active ? 'border-slate-200' : 'border-red-200 bg-slate-50/50 opacity-90'
                            }`}
                        >
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">
                                            {dept.name}
                                        </h3>
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                            dept.is_active 
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-red-50 text-red-800 border-red-200'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${dept.is_active ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                            {dept.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                    <span className="text-xs font-bold bg-accent-50 text-accent-800 px-2.5 py-1 rounded-lg border border-accent-200 shrink-0">
                                        Cap: {dept.typical_intake_capacity || 'N/A'}
                                    </span>
                                </div>

                                {/* Formatted mandate with an independent Read more /
                                    Read less per department. The control appears only
                                    when the text is actually being clipped, so a short
                                    description is not given a button that does nothing. */}
                                <ExpandableRichText
                                    html={dept.description}
                                    id={`dept-${dept.id}`}
                                    expanded={expandedDepartments.has(dept.id)}
                                    onToggle={() => toggleDepartmentDescription(dept.id)}
                                    lines={3}
                                    compact
                                    className="text-xs text-slate-600 leading-relaxed font-medium"
                                    placeholder="Mandated department responsible for sector coordination and industrial attachment placements."
                                />

                                <div className="space-y-1.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-2 text-slate-800">
                                        <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        <span className="font-bold">Director:</span>
                                        <span className="truncate font-semibold text-slate-900">
                                            {dept.director_name || 'Not Appointed'}
                                        </span>
                                    </div>
                                    {dept.location && (
                                        <div className="flex items-center gap-2 text-slate-800">
                                            <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="font-bold">Office:</span>
                                            <span className="truncate">{dept.location}</span>
                                        </div>
                                    )}
                                    {dept.contact_email && (
                                        <div className="flex items-center gap-2 text-slate-800">
                                            <svg className="w-4 h-4 text-primary-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                            <span className="font-bold">Email:</span>
                                            <span className="truncate">{dept.contact_email}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-200 mt-4">
                                <div className="grid grid-cols-2 gap-2 mb-3 text-center">
                                    <div className="bg-slate-100 p-2 rounded-xl border border-slate-200">
                                        <div className="text-base font-black text-primary-900">{dept.active_vacancies_count || 0}</div>
                                        <div className="text-2xs font-bold text-slate-600 uppercase">Live Vacancies</div>
                                    </div>
                                    <div className="bg-slate-100 p-2 rounded-xl border border-slate-200">
                                        <div className="text-base font-black text-emerald-900">{dept.total_slots || 0}</div>
                                        <div className="text-2xs font-bold text-slate-600 uppercase">Total Slots</div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => navigate(`/vacancies?department=${dept.id}`)}
                                        className="flex-1 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] font-bold py-2.5 px-3 rounded-xl transition-all text-xs text-center flex items-center justify-center gap-1.5 shadow-sm"
                                    >
                                        <span>View Vacancies</span>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </button>

                                    {userRole === 'ADMIN' && (
                                        <>
                                            <button
                                                onClick={() => openEditModal(dept)}
                                                className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl border border-slate-300 transition-colors"
                                                title="Edit Department"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(dept)}
                                                className={`p-2.5 rounded-xl border transition-colors ${
                                                    dept.is_active ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-300' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300'
                                                }`}
                                                title={dept.is_active ? 'Deactivate Department' : 'Reactivate Department'}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handlePromptDelete(dept)}
                                                className="p-2.5 bg-red-50 hover:bg-red-600 hover:text-white text-red-700 rounded-xl border border-red-200 transition-colors"
                                                title="Delete Department"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create / Edit Department Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animation-fade-in overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden my-8">
                        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-200 bg-slate-50">
                            <h3 className="text-xl font-black text-slate-900">
                                {editingDept ? 'Edit Department & Director' : 'Register Department & Appoint Director'}
                            </h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-slate-400 hover:text-slate-600 text-2xl font-bold p-1"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        Department Name *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g. Department of Petroleum Exploration"
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        Location / Office
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.location}
                                        onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        placeholder="e.g. 5th Floor, Block B, Nyayo House"
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        Typical Intake Capacity
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={formData.typical_intake_capacity}
                                        onChange={(e) => setFormData({ ...formData, typical_intake_capacity: e.target.value })}
                                        placeholder="e.g. 10"
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        Official Contact Email
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.contact_email}
                                        onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                                        placeholder="exploration@petroleum.go.ke"
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                        Contact Phone
                                    </label>
                                    <input
                                        type="tel"
                                        value={formData.contact_phone}
                                        onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                                        placeholder="+254 20 1234567"
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                                    Description &amp; Mandate
                                </label>
                                {/* Rich text, so a mandate can carry headings, bullet
                                    lists and emphasis the way a vacancy description
                                    does. The server allowlist-sanitizes this field on
                                    write and on read, which is what makes rendering it
                                    as HTML below safe. */}
                                <RichTextEditor
                                    value={formData.description}
                                    onChange={(html) => setFormData({ ...formData, description: html })}
                                    aria-label="Department description and mandate"
                                    minHeight={160}
                                />
                                <p className="text-2xs text-slate-500 font-medium mt-1.5">
                                    Use the toolbar for headings, bold, italic and lists. Readers who
                                    cannot see the whole description are offered a Read more control.
                                </p>
                            </div>

                            {/* Appointed Director Section */}
                            <div className="bg-slate-100 p-4 rounded-2xl border border-slate-300 space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                        Appointed Department Director
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setDirectorMode('SELECT')}
                                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                                                directorMode === 'SELECT' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'bg-white text-slate-700 border border-slate-300'
                                            }`}
                                        >
                                            Select Existing
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDirectorMode('CREATE')}
                                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                                                directorMode === 'CREATE' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'bg-white text-slate-700 border border-slate-300'
                                            }`}
                                        >
                                            + Create New Inline
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDirectorMode('NONE')}
                                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-all ${
                                                directorMode === 'NONE' ? 'bg-primary-600 text-[var(--color-primary-on)]' : 'bg-white text-slate-700 border border-slate-300'
                                            }`}
                                        >
                                            None
                                        </button>
                                    </div>
                                </div>

                                {directorMode === 'SELECT' && (
                                    <div>
                                        <select
                                            value={formData.director}
                                            onChange={(e) => setFormData({ ...formData, director: e.target.value })}
                                            className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-primary-600 focus:outline-none"
                                        >
                                            <option value="">-- Select Registered Department Director --</option>
                                            {availableDirectors.map(d => (
                                                <option key={d.id} value={d.id}>
                                                    {d.first_name || d.username} {d.last_name || ''} ({d.email}) {d.assigned_department_name ? `[Current: ${d.assigned_department_name}]` : '[Unassigned]'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {directorMode === 'CREATE' && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-xl border border-slate-300">
                                        <div>
                                            <label className="block text-2xs font-bold text-slate-700 uppercase">First Name *</label>
                                            <input
                                                type="text"
                                                required={directorMode === 'CREATE'}
                                                value={formData.new_director_first_name}
                                                onChange={(e) => setFormData({ ...formData, new_director_first_name: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-2xs font-bold text-slate-700 uppercase">Last Name *</label>
                                            <input
                                                type="text"
                                                required={directorMode === 'CREATE'}
                                                value={formData.new_director_last_name}
                                                onChange={(e) => setFormData({ ...formData, new_director_last_name: e.target.value })}
                                                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-2xs font-bold text-slate-700 uppercase">Director Email *</label>
                                            <input
                                                type="email"
                                                required={directorMode === 'CREATE'}
                                                value={formData.new_director_email}
                                                onChange={(e) => setFormData({ ...formData, new_director_email: e.target.value })}
                                                placeholder="director@petroleum.go.ke"
                                                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-2xs font-bold text-slate-700 uppercase">Temporary Password</label>
                                            <input
                                                type="password"
                                                value={formData.new_director_password}
                                                onChange={(e) => setFormData({ ...formData, new_director_password: e.target.value })}
                                                placeholder="Default: DirectorPass2026!"
                                                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs font-semibold text-slate-900"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                    className="w-4 h-4 text-primary-700 rounded border-slate-300 focus:ring-primary-600 cursor-pointer"
                                />
                                <label htmlFor="is_active" className="text-sm font-bold text-slate-800 cursor-pointer">
                                    Department Active (Accepting attachment requisitions & placements)
                                </label>
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
                                    className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl font-bold text-sm shadow-md transition-all flex items-center"
                                >
                                    {isSubmitting ? 'Saving...' : 'Save Department'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Safe Delete / Deactivation Modal */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animation-fade-in">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
                        <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mb-4">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>

                        <h3 className="text-xl font-black text-slate-900 mb-2">
                            {deleteErrorData ? 'Cannot Delete Referenced Department' : `Delete '${deleteTarget.name}'?`}
                        </h3>

                        {!deleteErrorData ? (
                            <p className="text-sm text-slate-600 leading-relaxed mb-6">
                                Are you sure you want to permanently delete this department? If it has active vacancies, requisitions, or deployments, hard deletion will be prevented and you will be offered safe deactivation instead.
                            </p>
                        ) : (
                            <div className="space-y-4 mb-6">
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs font-semibold leading-relaxed">
                                    {deleteErrorData.detail}
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200">
                                        <div className="text-base font-black text-slate-900">{deleteErrorData.dependencies?.jobs || 0}</div>
                                        <div className="text-2xs font-bold text-slate-600 uppercase">Vacancies</div>
                                    </div>
                                    <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200">
                                        <div className="text-base font-black text-slate-900">{deleteErrorData.dependencies?.requisitions || 0}</div>
                                        <div className="text-2xs font-bold text-slate-600 uppercase">Requisitions</div>
                                    </div>
                                    <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200">
                                        <div className="text-base font-black text-slate-900">{deleteErrorData.dependencies?.deployments || 0}</div>
                                        <div className="text-2xs font-bold text-slate-600 uppercase">Deployments</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4 border-t border-slate-200">
                            <button
                                type="button"
                                onClick={() => { setDeleteTarget(null); setDeleteErrorData(null); }}
                                className="w-full sm:w-auto px-4 py-2.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>

                            {deleteErrorData?.can_deactivate ? (
                                <button
                                    type="button"
                                    onClick={handleDeactivateInstead}
                                    disabled={isDeleting}
                                    className="w-full sm:w-auto px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm"
                                >
                                    {isDeleting ? 'Deactivating...' : 'Deactivate Department Instead'}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleExecuteDelete}
                                    disabled={isDeleting}
                                    className="w-full sm:w-auto px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-sm"
                                >
                                    {isDeleting ? 'Deleting...' : 'Confirm Permanent Delete'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
