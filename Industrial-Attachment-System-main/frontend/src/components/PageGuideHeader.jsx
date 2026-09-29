import React, { useState } from 'react';
import useAuthStore from '../store/authStore';

const WORKFLOW_PRESETS = {
    'attachee-journey': {
        title: 'Attachee Attachment Lifecycle',
        steps: [
            { id: 1, label: 'Profile Setup', desc: 'Complete biodata & required documents' },
            { id: 2, label: 'Find Vacancy', desc: 'Apply to open department attachments' },
            { id: 3, label: 'Successful', desc: 'HR review' },
            { id: 4, label: 'Deployment', desc: 'Active industrial attachment period' },
            { id: 5, label: 'Director Clearance', desc: 'Stage 1 logbook & task sign-off' },
            { id: 6, label: 'HR Clearance', desc: 'Stage 2 institutional clearance' },
            { id: 7, label: 'Recommendation', desc: 'Official recommendation letter' },
        ]
    },
    'director-workflow': {
        title: 'Department Attachment Management',
        steps: [
            { id: 1, label: 'Raise Requisition', desc: 'Request attachees for department' },
            { id: 2, label: 'HR Verification', desc: 'HR approval & auto-vacancy creation' },
            { id: 3, label: 'Candidate Review', desc: 'Screen applications & shortlist' },
            { id: 4, label: 'Supervision', desc: 'Oversee student attachment deliverables' },
            { id: 5, label: 'Stage 1 Clearance', desc: 'Director sign-off upon completion' },
        ]
    },
    'hr-workflow': {
        title: 'HR Institutional Oversight',
        steps: [
            { id: 1, label: 'Review Requisitions', desc: 'Approve department requests' },
            { id: 2, label: 'Publish Vacancies', desc: 'Automate attachment listings' },
            { id: 3, label: 'Process Deployments', desc: 'Deploy successful candidates' },
            { id: 4, label: 'Stage 2 Clearance', desc: 'Final institutional sign-off' },
            { id: 5, label: 'Issue Letters', desc: 'Generate recommendation letters' },
        ]
    },
    'admin-workflow': {
        title: 'System & Governance Administration',
        steps: [
            { id: 1, label: 'Departments', desc: 'Configure departments & intake capacities' },
            { id: 2, label: 'Director Assignment', desc: 'Create & assign department directors' },
            { id: 3, label: 'Role Governance', desc: 'Manage privileges & staff accounts' },
            { id: 4, label: 'Audit & Oversight', desc: 'Monitor institutional performance' },
        ]
    },
};

export default function PageGuideHeader({
    title,
    subtitle,
    badge,
    workflowKey,
    currentStep = 1,
    roleTips,
    actions,
    isSticky = false,
    className = "",
}) {
    const user = useAuthStore(state => state.user);
    const [isMobileGuideOpen, setIsMobileGuideOpen] = useState(false);

    const workflow = workflowKey ? WORKFLOW_PRESETS[workflowKey] : null;

    // Role-specific quick tip
    const defaultTips = {
        APPLICANT: 'Ensure your biodata, university details, emergency contact particulars, and all 10 required verification documents are complete before submitting applications.',
        DEPARTMENT_DIRECTOR: 'Submit attachment requisitions and perform Stage 1 clearance for attachees assigned to your department.',
        HR: 'Verify attachment requisitions, manage student deployments to departments, conduct Stage 2 clearance, and issue recommendation letters.',
        ADMIN: 'Govern department configurations, assign director accounts, and manage user access privileges across all portals.',
    };

    const activeTip = roleTips?.[user?.role] || defaultTips[user?.role] || subtitle;

    return (
        <div className={`bg-gradient-to-br from-white via-primary-50/50 to-amber-50/60 rounded-2xl md:rounded-3xl p-5 sm:p-6 md:p-7 mb-6 shadow-sm border border-primary-200/90 border-t-4 border-t-primary relative overflow-hidden transition-all ${isSticky ? 'sticky top-0 z-20 backdrop-blur-md bg-white/95' : ''} ${className}`}>
            {/* Background Decorative Subtle Accents */}
            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-primary-300/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-1/4 -mb-12 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

            {/* Top Bar: Title, Badges, Subtitle & Optional Actions */}
            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                            {title}
                        </h1>
                        {badge && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase bg-primary-100 text-primary-900 border border-primary-300 shadow-xs">
                                {badge}
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            Industrial Attachment Portal
                        </span>
                    </div>
                    {subtitle && (
                        <p className="text-slate-700 text-sm sm:text-base font-medium max-w-3xl leading-relaxed">
                            {subtitle}
                        </p>
                    )}
                </div>

                {actions && (
                    <div className="flex items-center gap-3 flex-shrink-0 pt-2 md:pt-0">
                        {actions}
                    </div>
                )}
            </div>

            {/* Role Context Notification Helper Bar */}
            {activeTip && (
                <div className="relative z-10 mt-6 pt-5 border-t border-primary-200/80 flex items-start sm:items-center gap-3.5 bg-white/90 rounded-2xl p-4 sm:p-5 border border-primary-200 shadow-sm">
                    <div className="w-9 h-9 rounded-xl bg-primary-600 text-[var(--color-primary-on)] flex items-center justify-center flex-shrink-0 shadow-xs border border-primary-200">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed">
                        <span className="inline-flex items-center font-black text-primary-900 uppercase tracking-wider mr-2 text-2xs bg-primary-100/80 px-2.5 py-1 rounded-md border border-primary-300">
                            {user?.role?.replace('_', ' ') || 'Role Guidance'}
                        </span>
                        {activeTip}
                    </div>
                </div>
            )}

            {/* Process Stepper */}
            {workflow && (
                <div className="relative z-10 mt-6">
                    {/* Mobile Stepper Accordion Trigger */}
                    <div className="md:hidden">
                        <button
                            type="button"
                            onClick={() => setIsMobileGuideOpen(!isMobileGuideOpen)}
                            className="w-full py-3 px-4 bg-white hover:bg-primary-50 border border-primary-200 rounded-xl text-xs font-black text-slate-800 flex items-center justify-between transition-colors shadow-sm"
                            aria-expanded={isMobileGuideOpen}
                        >
                            <span className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                {workflow.title} (Step {currentStep} of {workflow.steps.length})
                            </span>
                            <svg className={`w-4 h-4 text-slate-600 transition-transform ${isMobileGuideOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>

                    {/* Desktop Stepper + Mobile Expanded Stepper */}
                    <div className={`mt-4 ${isMobileGuideOpen ? 'block' : 'hidden md:block'}`}>
                        <div className="bg-white/80 p-4 sm:p-5 rounded-2xl border border-primary-200/90 shadow-xs">
                            <div className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
                                <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                {workflow.title}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
                                {workflow.steps.map(step => {
                                    const isDone = step.id < currentStep;
                                    const isCurrent = step.id === currentStep;

                                    return (
                                        <div
                                            key={step.id}
                                            className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between ${
                                                isCurrent
                                                    ? 'bg-amber-50/90 border-2 border-primary-500 shadow-md ring-2 ring-primary-400/30'
                                                    : isDone
                                                    ? 'bg-emerald-50/70 border border-emerald-200 text-slate-800'
                                                    : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-2xs font-black shrink-0 ${
                                                    isCurrent
                                                        ? 'bg-primary-600 text-[var(--color-primary-on)] shadow-xs'
                                                        : isDone
                                                        ? 'bg-emerald-600 text-white shadow-xs'
                                                        : 'bg-slate-200 text-slate-700'
                                                }`}>
                                                    {isDone ? '✓' : step.id}
                                                </span>
                                                <span className={`text-xs font-black truncate ${isCurrent ? 'text-primary-950' : isDone ? 'text-emerald-950' : 'text-slate-900'}`}>
                                                    {step.label}
                                                </span>
                                            </div>
                                            <p className={`text-2xs font-medium leading-snug ${isCurrent ? 'text-slate-800 font-semibold' : isDone ? 'text-emerald-900' : 'text-slate-600'}`}>
                                                {step.desc}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
