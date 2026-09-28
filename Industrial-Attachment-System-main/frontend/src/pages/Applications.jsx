import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import PageGuideHeader from '../components/PageGuideHeader';
import { getDerivedStatus, getDerivedStatusBadgeClass } from '../utils/statusUtils';
import { exportToCSV } from '../utils/downloadUtils';
import ApplicationTimeline from '../components/ApplicationTimeline';

const getAtsColor    = s => s >= 70 ? 'text-emerald-700'  : s >= 40 ? 'text-amber-700'  : 'text-rose-700';
const getAtsBarColor = s => s >= 70 ? 'bg-emerald-500'    : s >= 40 ? 'bg-amber-500'    : 'bg-rose-500';
const getAtsLabel    = s => s >= 70 ? 'Strong match'      : s >= 40 ? 'Moderate match'  : 'Low match';

function SkeletonCard() {
    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 animate-pulse">
            <div className="flex justify-between items-start mb-4 gap-3">
                <div className="h-5 bg-slate-200 rounded w-2/3" />
                <div className="h-5 bg-slate-200 rounded w-20 shrink-0" />
            </div>
            <div className="h-3 bg-slate-100 rounded w-1/3 mb-6" />
            <div className="h-2 bg-slate-200 rounded-full w-full mb-6" />
            <div className="flex justify-between">
                <div className="h-3 bg-slate-100 rounded w-24" />
                <div className="h-3 bg-slate-100 rounded w-24" />
            </div>
        </div>
    );
}

export default function Applications() {
    const [applications, setApplications] = useState([]);
    const [loading, setLoading]           = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError]               = useState(null);
    const [lastUpdated, setLastUpdated]   = useState(null);
    const pollIntervalRef                 = useRef(null);

    const fetchApplications = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        else setIsRefreshing(true);
        setError(null);
        try {
            let allApps = [];
            let url = 'jobs/applications/';
            while (url) {
                if (url.startsWith('http')) {
                    try {
                        const u = new URL(url);
                        url = u.pathname.replace('/api/', '') + u.search;
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
            setApplications(allApps);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to fetch applications:', err);
            if (!isSilent) {
                setError('Could not load your applications. Please check your connection and try again.');
            }
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchApplications(false);

        // Real-time polling every 12 seconds
        pollIntervalRef.current = setInterval(() => {
            fetchApplications(true);
        }, 12000);

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [fetchApplications]);

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto space-y-6 pb-16 text-slate-900">
            <PageGuideHeader
                title="My Attachment Applications"
                subtitle="Track the real-time screening status, ATS automated qualification score, and department review progress for your attachment submissions."
                badge="Attachee Portal"
                workflowKey="attachee-journey"
                currentStep={3}
                roleTips={{
                    APPLICANT: "Track submitted applications in real-time. When marked 'Successful', your record will be deployed to your department for the active attachment period."
                }}
                actions={
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Live Real-Time Sync</span>
                        </div>
                        <button
                            onClick={() => fetchApplications(false)}
                            disabled={loading || isRefreshing}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 px-3.5 py-2 rounded-xl transition-all shadow-xs"
                        >
                            <svg className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
                        </button>
                        {applications.length > 0 && (
                            <button
                                onClick={() => exportToCSV(
                                    'my_applications',
                                    ['Vacancy', 'Department', 'Applied Date', 'ATS Score', 'Status'],
                                    applications.map(app => [
                                        app.job_title || app.job?.title || '',
                                        app.department_name || app.job?.department_name || '',
                                        app.applied_at ? new Date(app.applied_at).toLocaleDateString() : '',
                                        app.ats_score != null ? `${app.ats_score}%` : '',
                                        (app.status || '').replace(/_/g, ' ')
                                    ]),
                                    {
                                        reportTitle: 'My Applications Summary',
                                        subtitle: 'Industrial Attachment vacancy applications and ATS scoring results'
                                    }
                                )}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 px-3.5 py-2 rounded-xl transition-all shadow-xs"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>Export CSV</span>
                            </button>
                        )}
                    </div>
                }
            />

            {lastUpdated && (
                <div className="flex justify-between items-center text-2xs text-slate-400 font-semibold px-2 mb-4">
                    <span>Active Submissions: <strong className="text-slate-700">{applications.length}</strong></span>
                    <span>Last checked: {lastUpdated.toLocaleTimeString()}</span>
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
                </div>
            ) : error ? (
                <div className="bg-rose-50 border border-rose-200 rounded-3xl p-12 flex flex-col items-center text-center">
                    <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mb-4">
                        <svg className="w-7 h-7 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-rose-900 mb-2">Could Not Load Applications</h3>
                    <p className="text-rose-700 text-sm mb-6 max-w-sm">{error}</p>
                    <button onClick={() => fetchApplications(false)} className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-6 rounded-xl text-xs transition-colors">
                        Retry
                    </button>
                </div>
            ) : applications.length === 0 ? (
                <div className="bg-white p-14 rounded-3xl shadow-sm border border-dashed border-slate-300 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mb-5 text-primary-600">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-black text-slate-900 mb-2">No Applications Submitted Yet</h3>
                    <p className="text-slate-600 max-w-sm mx-auto mb-7 text-sm font-medium">
                        You haven't submitted any industrial attachment applications. Browse open department vacancies, complete your profile, and apply.
                    </p>
                    <Link to="/vacancies" className="bg-primary-600 text-[var(--color-primary-on)] hover:bg-primary-800 font-bold py-3 px-8 rounded-xl text-sm transition-all shadow-md">
                        Browse Open Vacancies
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {applications.map(app => {
                        const derivedStatus = getDerivedStatus({
                            applicationStatus: app.status,
                            deploymentStatus: app.deployment?.status,
                            clearanceStatus: app.clearance?.status,
                            displayStatus: app.display_status
                        });
                        const badgeClass = getDerivedStatusBadgeClass(derivedStatus);
                        const atsScore   = app.ats_score ?? 0;
                        const appliedDate = app.applied_at
                            ? new Date(app.applied_at).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })
                            : 'Unknown date';

                        return (
                            <div
                                key={app.id}
                                className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex justify-between items-start gap-3 mb-3">
                                        <h3 className="text-lg font-black text-slate-900 leading-snug">
                                            {app.job_title}
                                        </h3>
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${badgeClass}`}>
                                            {derivedStatus}
                                        </span>
                                    </div>

                                    <div className="text-xs font-bold text-primary-800 mb-3 flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                            <span>{app.department_name || 'Ministry Department'}</span>
                                        </div>
                                        <span className="text-slate-300">&bull;</span>
                                        <span className="bg-primary-50 text-primary-800 px-2.5 py-1 rounded-md font-bold text-2xs">
                                            {app.duration_weeks || 12} Weeks Attachment
                                        </span>
                                        {app.projected_end_date && (
                                            <>
                                                <span className="text-slate-300">&bull;</span>
                                                <span className="text-slate-600 text-2xs font-semibold">
                                                    Projected End: <strong className="text-slate-900">{new Date(app.projected_end_date).toLocaleDateString()}</strong>
                                                </span>
                                            </>
                                        )}
                                    </div>

                                    {/* Screening history, read from the server-recorded
                                        status events. Survives a refresh and shows the
                                        full sequence, not just the current status. */}
                                    <ApplicationTimeline
                                        history={app.status_history}
                                        currentStatus={app.status}
                                    />

                                    {/* ATS Score Progress */}
                                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 mb-4">
                                        <div className="flex justify-between items-center mb-1.5 text-xs font-bold">
                                            <span className="text-slate-600 uppercase tracking-wider text-2xs">ATS Automated Audit</span>
                                            <span className={getAtsColor(atsScore)}>
                                                {atsScore}% ({getAtsLabel(atsScore)})
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                            <div
                                                className={`h-2 rounded-full transition-all duration-500 ${getAtsBarColor(atsScore)}`}
                                                style={{ width: `${Math.min(100, Math.max(0, atsScore))}%` }}
                                            />
                                        </div>
                                    </div>

                                    {app.cover_letter && (
                                        <div className="text-xs text-slate-600 bg-slate-50/50 p-3 rounded-xl border border-slate-100 mb-4 line-clamp-2 italic">
                                            "{app.cover_letter}"
                                        </div>
                                    )}

                                    {app.status === 'SUCCESSFUL' && (
                                        <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
                                            <span className="text-xs font-bold text-emerald-800">🎉 Congratulations! You have been selected.</span>
                                            <Link
                                                to="/clearance"
                                                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-black shadow-sm"
                                            >
                                                View Clearance
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-semibold">
                                    <span>Applied on {appliedDate}</span>
                                    <span className="text-slate-400">Ref #{app.id}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
