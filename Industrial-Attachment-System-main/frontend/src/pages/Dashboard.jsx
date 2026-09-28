import React, { useState, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import AdminAnalytics from '../components/AdminAnalytics';
import ReportsModal from '../components/ReportsModal';
import useAuthStore from '../store/authStore';
import useDashboardStore from '../store/dashboardStore';
import api from '../services/api';

export default function Dashboard({ children }) {
    const user = useAuthStore(state => state.user);
    const { stats, fetchStats } = useDashboardStore();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isReportsOpen, setIsReportsOpen] = useState(false);

    useEffect(() => {
        if (user && !['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(user.role)) {
            Promise.all([
                api.get('accounts/profile/').catch(() => ({ data: null })),
                fetchStats()
            ])
            .then(([profRes]) => {
                setProfile(profRes.data);
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [user, fetchStats]);

    return (
        <div className="fixed inset-0 flex h-[100dvh] bg-gray-50 font-sans overflow-hidden w-full">
            <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
            <div className="flex-1 flex flex-col transition-all duration-300 w-full overflow-hidden h-full">
                <div className="shrink-0 z-20 shadow-sm relative">
                    <Header onMenuClick={() => setIsSidebarOpen(true)} />
                </div>
                <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50/50 relative w-full h-full pb-20 md:pb-8">
                    {loading && !children && (
                        <div className="absolute inset-0 flex justify-center items-center bg-gray-50/80 z-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
                        </div>
                    )}
                    {children || (
                        ['ADMIN', 'HR', 'DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(user?.role) ? (
                            <>
                                {/* Admin/HR Dashboard Header with Reports button */}
                                {['ADMIN', 'HR'].includes(user?.role) && (
                                    <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div>
                                            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                                                Dashboard Overview
                                            </h2>
                                            <p className="text-sm text-slate-500 font-medium mt-0.5">
                                                {user?.role === 'ADMIN' ? 'System-wide analytics and programme metrics' : 'HR operational overview and metrics'}
                                            </p>
                                        </div>
                                        <button
                                            id="open-reports-analytics-btn"
                                            onClick={() => setIsReportsOpen(true)}
                                            className="inline-flex items-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-primary-800 to-primary-600 hover:from-primary-900 hover:to-primary-700 text-white font-bold rounded-xl shadow-md shadow-primary-600/15 hover:shadow-lg hover:shadow-primary-600/25 hover:-translate-y-[1px] active:translate-y-0 transition-all duration-200 text-sm shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2"
                                            aria-label="Open Reports and Analytics"
                                        >
                                            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Reports &amp; Analytics
                                            <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                                <AdminAnalytics />
                                <ReportsModal isOpen={isReportsOpen} onClose={() => setIsReportsOpen(false)} />
                            </>
                        ) : (
                            <div className="max-w-7xl mx-auto space-y-8 animation-fade-in text-slate-900">
                                {/* Welcome Header */}
                                <div className="bg-gradient-to-r from-primary-950 via-primary-800 to-primary-600 text-white p-6 sm:p-8 rounded-2xl md:rounded-3xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
                                    {/* Decorative */}
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-white/[0.06] to-transparent rounded-full translate-x-1/3 -translate-y-1/4 pointer-events-none" />
                                    <div className="relative z-10">
                                        <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-white/15 text-gold-400 border border-white/20 backdrop-blur-sm">
                                            Attachee Candidate Portal
                                        </span>
                                        <h2 className="text-2xl sm:text-3xl font-black mt-2 tracking-tight">
                                            Welcome back, {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.username || 'Attachee')}!
                                        </h2>
                                        <p className="text-white/70 text-sm mt-1 font-medium">
                                            Manage your industrial attachment profile, track application stages, and follow exit clearance.
                                        </p>
                                    </div>
                                    <a
                                        href="/profile"
                                        className="relative z-10 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-md shrink-0 flex items-center gap-1.5 border border-white/20"
                                    >
                                        <span>Edit Dossier</span>
                                        <span>&rarr;</span>
                                    </a>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                                    {/* Profile & Document Readiness */}
                                    <div className="bg-white p-7 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-primary-600 hover:shadow-md transition-shadow flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-slate-700 text-xs font-black tracking-wider uppercase">Dossier Readiness</h3>
                                                <div className="p-2.5 bg-primary-600 text-[var(--color-primary-on)] border border-primary-700 rounded-xl">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                                </div>
                                            </div>
                                            <p className="text-2xl font-black text-primary-800">{stats.profile_completion}% Complete</p>
                                            <div className="w-full bg-slate-200 rounded-full h-2.5 mt-3 mb-4 overflow-hidden">
                                                <div className="bg-gradient-to-r from-primary-800 to-primary-600 h-2.5 rounded-full transition-all duration-700" style={{width: `${stats.profile_completion}%`}}></div>
                                            </div>
                                            {stats.can_apply ? (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-emerald-800 font-extrabold flex items-center">
                                                        <svg className="w-4 h-4 mr-1.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>
                                                        Profile & 10 Documents Verified
                                                    </p>
                                                    <p className="text-xs text-emerald-800 font-bold">Eligible to apply for all vacancies</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-red-700 font-extrabold flex items-center">
                                                        <svg className="w-4 h-4 mr-1.5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V7z" clipRule="evenodd"></path></svg>
                                                        Incomplete Dossier
                                                    </p>
                                                    {stats.missing_sections && stats.missing_sections.length > 0 && (
                                                        <p className="text-xs text-slate-700 font-bold">
                                                            Pending: {stats.missing_sections.join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100">
                                            <a href="/profile" className="text-xs font-bold text-primary-800 hover:underline">
                                                Complete 4-Step Dossier &rarr;
                                            </a>
                                        </div>
                                    </div>

                                    {/* Application Count & Discovery */}
                                    <div className="bg-white p-7 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-primary-600 hover:shadow-md transition-shadow flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-slate-700 text-xs font-black tracking-wider uppercase">My Applications</h3>
                                                <div className="p-2.5 bg-primary-600 text-[var(--color-primary-on)] border border-primary-700 rounded-xl">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>
                                                </div>
                                            </div>
                                            <p className="text-4xl font-black text-slate-900">{stats.applications_count}</p>
                                            <p className="text-xs text-emerald-800 mt-2 font-bold flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                                Active Ministry Submissions
                                            </p>
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                                            <a href="/applications" className="font-bold text-primary-800 hover:underline">View My Submissions</a>
                                            <a href="/vacancies" className="font-bold text-accent-700 hover:underline">Browse Vacancies &rarr;</a>
                                        </div>
                                    </div>

                                    {/* Latest Status / Real-Time Tracker */}
                                    <div className="bg-white p-7 rounded-2xl shadow-sm border border-slate-200 border-t-4 border-t-primary-600 hover:shadow-md transition-shadow flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-slate-700 text-xs font-black tracking-wider uppercase">Latest Action</h3>
                                                <div className="p-2.5 bg-primary-600 text-[var(--color-primary-on)] border border-primary-700 rounded-xl">
                                                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                                </div>
                                            </div>
                                            {stats.latest_status ? (
                                                <div>
                                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black mb-3 border ${
                                                        stats.latest_status === 'SUCCESSFUL' ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                                                        stats.latest_status === 'REVIEWED'   ? 'bg-purple-50 text-purple-800 border-purple-300' :
                                                        stats.latest_status === 'REJECTED'   ? 'bg-rose-50 text-rose-800 border-rose-300' :
                                                                                               'bg-amber-50 text-amber-800 border-amber-300'
                                                    }`}>
                                                        <span className={`w-2 h-2 rounded-full ${
                                                            stats.latest_status === 'SUCCESSFUL' ? 'bg-emerald-600' :
                                                            stats.latest_status === 'REVIEWED'   ? 'bg-purple-600' :
                                                            stats.latest_status === 'REJECTED'   ? 'bg-rose-600' :
                                                                                              'bg-amber-600'
                                                        }`} />
                                                        {stats.latest_status === 'SUCCESSFUL' ? '✅ Successful' :
                                                         stats.latest_status === 'REVIEWED'   ? '👁 Docs Reviewed' :
                                                         stats.latest_status === 'REJECTED'   ? '❌ Rejected' :
                                                                                                 '⏳ Under Review'}
                                                    </span>
                                                    <p className="text-base font-black text-slate-900 leading-snug">{stats.latest_job_title}</p>
                                                    {stats.latest_applied_at && (
                                                        <p className="text-xs text-slate-600 mt-1.5 font-bold">
                                                            Applied {new Date(stats.latest_applied_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="text-lg font-black text-slate-800 mt-1">No applications yet</p>
                                                    <p className="text-xs text-slate-600 mt-1 font-semibold">Apply for a vacancy to track your status here.</p>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100">
                                            <a href="/my-clearance" className="text-xs font-bold text-primary-800 hover:underline">
                                                Dual Clearance & Letters &rarr;
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                </main>
            </div>
        </div>
    );
}
