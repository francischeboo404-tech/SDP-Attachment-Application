import React, { useState } from 'react';
import api from '../services/api';
import useAuthStore from '../store/authStore';

export default function ForcedPasswordChangeModal() {
    const user = useAuthStore(state => state.user);
    const setUser = useAuthStore(state => state.setUser);

    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    if (!user || !user.must_change_password) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            await api.post('accounts/change-password-forced/', {
                old_password: oldPassword,
                new_password: newPassword,
                confirm_password: confirmPassword,
            });

            setSuccess(true);
            // Update auth store user state so modal dismisses cleanly without force-reloading
            setTimeout(() => {
                if (setUser) {
                    setUser({ ...user, must_change_password: false });
                }
            }, 1200);
        } catch (err) {
            console.error(err);
            const errData = err.response?.data;
            if (errData?.new_password) {
                setError(Array.isArray(errData.new_password) ? errData.new_password.join(' ') : errData.new_password);
            } else if (errData?.old_password) {
                setError(errData.old_password);
            } else {
                setError(errData?.detail || 'Failed to update password. Please check requirements.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animation-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 sm:p-8 animate-scale-up">
                <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4 mx-auto">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                </div>

                <div className="text-center mb-6">
                    <span className="text-2xs font-black uppercase tracking-wider bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full mb-1 inline-block">
                        Security Notice
                    </span>
                    <h3 className="text-xl font-black text-slate-900">Mandatory Password Update</h3>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        Your account was created with a temporary administrative password. You must set a new secure password before continuing.
                    </p>
                </div>

                {error && (
                    <div className="p-3.5 mb-4 rounded-xl text-xs font-bold bg-rose-50 text-rose-900 border border-rose-200">
                        {error}
                    </div>
                )}

                {success ? (
                    <div className="p-4 rounded-2xl bg-emerald-50 text-emerald-900 border border-emerald-200 text-center font-bold text-xs">
                        &check; Password updated successfully! Refreshing portal...
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                                Current Temporary Password *
                            </label>
                            <input
                                type="password"
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                required
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                                New Password *
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Min. 8 chars, mixed letters & numbers"
                                required
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                                Confirm New Password *
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)] rounded-xl text-xs font-black transition-all shadow-md disabled:opacity-50"
                            >
                                {loading ? 'Validating & Updating...' : 'Set New Password & Continue'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
