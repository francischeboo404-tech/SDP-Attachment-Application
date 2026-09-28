import React, { useState, useEffect } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import PageGuideHeader from '../components/PageGuideHeader';

export default function ManageUsers() {
    const userRole = useAuthStore(state => state.user?.role);
    const currentUser = useAuthStore(state => state.user);
    
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('ALL');

    // Role editing modal state
    const [selectedUser, setSelectedUser] = useState(null);
    const [targetRole, setTargetRole] = useState('APPLICANT');
    const [targetDeptId, setTargetDeptId] = useState('');
    const [savingRole, setSavingRole] = useState(false);
    const [modalError, setModalError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (userRole === 'ADMIN' || currentUser?.is_superuser) {
            fetchUsers();
            fetchDepartments();
        } else {
            setLoading(false);
        }
    }, [userRole, currentUser]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const res = await api.get('accounts/users/');
            const data = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
            setUsers(data);
        } catch (err) {
            console.error("Failed to fetch users", err);
            setUsers([]);
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
            console.error("Failed to fetch departments", err);
        }
    };

    const handleOpenRoleModal = (u) => {
        setSelectedUser(u);
        setTargetRole(u.role);
        setTargetDeptId(u.department || '');
        setModalError('');
    };

    const handleSaveRole = async (e) => {
        e.preventDefault();
        if (!selectedUser) return;
        setModalError('');

        // Client-side validations matching server guardrails
        if (selectedUser.id === currentUser?.id && targetRole !== 'ADMIN' && currentUser.role === 'ADMIN') {
            const otherAdmins = users.filter(u => u.role === 'ADMIN' && u.is_active && u.id !== currentUser.id);
            if (otherAdmins.length === 0) {
                setModalError('You cannot demote yourself as the last remaining Administrator in the system.');
                return;
            }
        }

        if (['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(targetRole) && !targetDeptId) {
            const roleName = targetRole === 'DEPARTMENT_DIRECTOR' ? 'Department Director' : 'Department Staff User';
            setModalError(`Please select a Department to assign to this ${roleName}.`);
            return;
        }

        setSavingRole(true);
        try {
            const payload = {
                role: targetRole,
                department: ['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(targetRole) ? targetDeptId : (targetDeptId || null),
            };

            const res = await api.patch(`accounts/users/${selectedUser.id}/`, payload);
            
            setUsers(prev => prev.map(u => u.id === selectedUser.id ? { 
                ...u, 
                role: res.data.role, 
                department: res.data.department,
                department_name: res.data.department_name
            } : u));

            setSuccessMessage(`Successfully updated role for ${selectedUser.username} to ${targetRole}.`);
            setSelectedUser(null);
            setTimeout(() => setSuccessMessage(''), 5000);
        } catch (err) {
            console.error("Failed to update role", err);
            const errData = err.response?.data;
            const errMsg = errData?.detail || errData?.role || errData?.department || 'Failed to update user role. Please try again.';
            setModalError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
        } finally {
            setSavingRole(false);
        }
    };

    const handleDeleteUser = async (userId, username) => {
        if (userId === currentUser?.id) {
            alert("You cannot delete your own active Admin account.");
            return;
        }

        if (!window.confirm(`Are you sure you want to permanently delete user @${username}? This action is irreversible.`)) {
            return;
        }

        try {
            await api.delete(`accounts/users/${userId}/`);
            setUsers(prev => prev.filter(u => u.id !== userId));
            setSuccessMessage(`User @${username} was deleted successfully.`);
            setTimeout(() => setSuccessMessage(''), 5000);
        } catch (error) {
            console.error("Failed to delete user", error);
            alert("Failed to delete user. They may have related data that prevents deletion.");
        }
    };

    // Filtering logic
    const filteredUsers = users.filter(u => {
        const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
        const query = searchQuery.toLowerCase();
        const matchesSearch = !query || 
            (u.username && u.username.toLowerCase().includes(query)) ||
            (u.email && u.email.toLowerCase().includes(query)) ||
            (u.first_name && u.first_name.toLowerCase().includes(query)) ||
            (u.last_name && u.last_name.toLowerCase().includes(query)) ||
            (u.department_name && u.department_name.toLowerCase().includes(query));
        return matchesRole && matchesSearch;
    });

    if (loading) return (
        <div className="flex justify-center items-center h-64">
           <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
        </div>
    );

    if (userRole !== 'ADMIN' && !currentUser?.is_superuser) return (
        <div className="text-center p-10 font-bold text-red-700 text-xl border border-red-200 bg-red-50 rounded-2xl mx-10 shadow-sm">
            Access Denied. Elevated Administrator Privileges Required.
        </div>
    );

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="User Role & Access Governance"
                subtitle="Assign institutional privileges, configure Department Directors, and manage system access across all portals."
                badge="Admin Access"
                workflowKey="admin-workflow"
                currentStep={3}
                roleTips={{
                    ADMIN: "As an Administrator, you can grant roles (Applicant, HR, Admin, Department Director, Department Staff) and assign Departments to Department Directors."
                }}
            />

            {successMessage && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-sm font-bold flex items-center gap-2 shadow-sm animate-fade-in">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {successMessage}
                </div>
            )}

            {/* Controls Bar: Search & Role Filters */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="w-full md:w-96 relative">
                    <input
                        type="text"
                        placeholder="Search users by name, email, or department..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all text-gray-900"
                    />
                    <svg className="w-5 h-5 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Filter Role:</span>
                    {['ALL', 'ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT', 'APPLICANT'].map(role => (
                        <button
                            key={role}
                            onClick={() => setRoleFilter(role)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                roleFilter === role
                                    ? 'bg-primary-600 text-[var(--color-primary-on)] border-primary-700 shadow-sm'
                                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200'
                            }`}
                        >
                            {role === 'ALL' ? 'All Users' : role.replace('_', ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">User Account</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Contact Email</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Department Assignment</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">System Role</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500 font-medium">
                                        No users match your search and filter criteria.
                                    </td>
                                </tr>
                            ) : filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary-100 flex items-center justify-center border border-primary-200 text-primary-800 font-black text-sm">
                                                {u.first_name ? u.first_name[0].toUpperCase() : u.username[0].toUpperCase()}
                                            </div>
                                            <div className="ml-4">
                                                <div className="text-sm font-extrabold text-gray-900">
                                                    {u.first_name || u.last_name ? `${u.first_name} ${u.last_name}` : u.username}
                                                </div>
                                                <div className="text-xs text-gray-500 font-medium">@{u.username}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-600 text-sm">
                                        <a href={`mailto:${u.email}`} className="text-primary-700 hover:underline">
                                            {u.email}
                                        </a>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {u.department_name ? (
                                            <span className="px-3 py-1 inline-flex text-xs font-bold rounded-lg bg-accent-50 text-accent-800 border border-accent-200">
                                                {u.department_name}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-400 italic">Not Assigned</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {u.role === 'ADMIN' ? (
                                             <span className="px-3 py-1 inline-flex text-xs font-bold rounded-lg border bg-primary-100 text-primary-900 border-primary-300">
                                                ADMIN
                                            </span>
                                        ) : u.role === 'HR' ? (
                                            <span className="px-3 py-1 inline-flex text-xs font-bold rounded-lg border bg-accent-50 text-accent-800 border-accent-200">
                                                HR MANAGER
                                            </span>
                                        ) : u.role === 'DEPARTMENT_DIRECTOR' ? (
                                            <span className="px-3 py-1 inline-flex text-xs font-bold rounded-lg border bg-amber-50 text-amber-800 border-amber-300">
                                                DEPARTMENT DIRECTOR
                                            </span>
                                        ) : u.role === 'DEPARTMENT' ? (
                                            <span className="px-3 py-1 inline-flex text-xs font-bold rounded-lg border bg-cyan-50 text-cyan-800 border-cyan-200">
                                                DEPARTMENT STAFF
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 inline-flex text-xs font-bold rounded-lg border bg-gray-100 text-gray-700 border-gray-200">
                                                ATTACHEE / APPLICANT
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <div className="flex items-center justify-end space-x-2">
                                            {userRole === 'ADMIN' || currentUser?.is_superuser ? (
                                                <button 
                                                    onClick={() => handleOpenRoleModal(u)}
                                                    className="text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 px-3 py-1.5 rounded-lg font-bold border border-primary-200 transition-colors text-xs inline-flex items-center gap-1"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                    Grant Role
                                                </button>
                                            ) : null}

                                            {u.id !== currentUser?.id && (userRole === 'ADMIN' || currentUser?.is_superuser) && (
                                                <button 
                                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                                    className="text-red-700 hover:text-red-900 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg font-bold border border-red-200 transition-colors text-xs inline-flex items-center gap-1"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    Delete
                                                </button>
                                            )}

                                            {u.id === currentUser?.id && (
                                                <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 font-bold">
                                                    You (Active Session)
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Grant / Change Role Modal */}
            {selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
                            <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                Manage User Privileges
                            </h3>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="text-gray-400 hover:text-gray-600 text-xl font-bold p-1"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleSaveRole} className="space-y-4">
                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Target Account</div>
                                <div className="text-sm font-extrabold text-gray-900 mt-0.5">
                                    {selectedUser.first_name || selectedUser.last_name 
                                        ? `${selectedUser.first_name} ${selectedUser.last_name} (@${selectedUser.username})`
                                        : `@${selectedUser.username}`}
                                </div>
                                <div className="text-xs text-gray-500">{selectedUser.email}</div>
                            </div>

                            {modalError && (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-bold">
                                    {modalError}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                                    Select System Role *
                                </label>
                                <select
                                    value={targetRole}
                                    onChange={(e) => setTargetRole(e.target.value)}
                                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500 bg-white"
                                >
                                    <option value="APPLICANT">Applicant / Attachee</option>
                                    <option value="DEPARTMENT">Department Staff / Reviewer</option>
                                    <option value="DEPARTMENT_DIRECTOR">Department Director</option>
                                    <option value="HR">HR Manager</option>
                                    <option value="ADMIN">System Administrator</option>
                                </select>
                            </div>

                            {selectedUser.id === currentUser?.id && targetRole !== 'ADMIN' && currentUser.role === 'ADMIN' && (
                                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 font-semibold flex items-start gap-2">
                                    <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <span>Warning: Demoting your own administrator account requires at least one other active Administrator in the system.</span>
                                </div>
                            )}

                            {['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(targetRole) && (
                                <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2 animate-fade-in">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                                        Assigned Department *
                                    </label>
                                    <select
                                        value={targetDeptId}
                                        onChange={(e) => setTargetDeptId(e.target.value)}
                                        required
                                        className="w-full px-3.5 py-2.5 border border-amber-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500 bg-white"
                                    >
                                        <option value="">-- Choose Department --</option>
                                        {departments.map(dept => (
                                            <option key={dept.id} value={dept.id}>
                                                {dept.name} {dept.director_name ? `(Current Director: ${dept.director_name})` : '(No Director)'}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-2xs text-amber-800">
                                        {targetRole === 'DEPARTMENT_DIRECTOR' 
                                            ? 'Assigning a user as Department Director enables them to submit attachment requisitions and conduct Stage 1 clearance for this department.'
                                            : 'Assigning a user as Department Staff binds them to this department for departmental clearance reviews and workflows.'
                                        }
                                    </p>
                                </div>
                            )}

                            {selectedUser.role === 'DEPARTMENT_DIRECTOR' && targetRole !== 'DEPARTMENT_DIRECTOR' && (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-2xs text-blue-800 font-medium">
                                    Note: Demoting this user from Department Director will safely unbind them from any assigned department link.
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setSelectedUser(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingRole}
                                    className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5"
                                >
                                    {savingRole ? 'Saving Privileges...' : 'Save Privileges'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
