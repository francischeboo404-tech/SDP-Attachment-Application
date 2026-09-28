import React from 'react';
import { useSearchParams } from 'react-router-dom';
import useAuthStore from '../store/authStore';

import Deployments from './Deployments';
import DepartmentClearance from './DepartmentClearance';
import ClearanceQueue from './ClearanceQueue';

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
    return (
        <div className="flex items-end gap-0 border-b border-slate-200 mb-6 overflow-x-auto" role="tablist">
            {tabs.map((tab) => {
                const isActive = active === tab.key;
                return (
                    <button
                        key={tab.key}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`tabpanel-${tab.key}`}
                        id={`tab-${tab.key}`}
                        onClick={() => onChange(tab.key)}
                        className={`relative flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-inset ${
                            isActive
                                ? 'text-primary-800 font-extrabold'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        {tab.icon && <span className="shrink-0">{tab.icon}</span>}
                        <span>{tab.label}</span>
                        {isActive && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-600 rounded-t-full" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ── DeploymentExitHub ─────────────────────────────────────────────────────────
export default function DeploymentExitHub() {
    const userRole = useAuthStore(state => state.user?.role || 'APPLICANT');
    const [searchParams, setSearchParams] = useSearchParams();

    const isAdmin = userRole === 'ADMIN';
    const isHR = userRole === 'HR';

    const allTabs = [
        (isAdmin || isHR) && {
            key: 'deployments',
            label: 'Attachee Dept Deployments & Exits',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
            ),
        },
        // Department Clearance — Admin oversight only; HR does not see this
        isAdmin && {
            key: 'dept-clearance',
            label: 'Department Clearance',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
            ),
        },
        (isAdmin || isHR) && {
            key: 'hr-clearance',
            label: 'HR Clearance',
            icon: (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
    ].filter(Boolean);

    const defaultTab = 'deployments';
    const rawTab = searchParams.get('tab') || defaultTab;
    const activeTab = allTabs.find(t => t.key === rawTab) ? rawTab : defaultTab;

    const handleTabChange = (key) => {
        setSearchParams({ tab: key }, { replace: true });
    };

    if (!isAdmin && !isHR) {
        return (
            <div className="text-center py-16 text-slate-500">
                <p className="font-semibold">You do not have access to this section.</p>
            </div>
        );
    }

    return (
        <div className="animation-fade-in w-full max-w-7xl mx-auto pb-16">
            {/* Page header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-primary-600 text-[var(--color-primary-on)] rounded-xl">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900">Deployment &amp; Exit</h1>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Manage attachee deployments, department clearance oversight, and HR clearance actions
                        </p>
                    </div>
                </div>
                {/* Admin-only context badge for Dept Clearance tab */}
                {activeTab === 'dept-clearance' && isAdmin && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-full text-2xs font-bold text-amber-800">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Admin oversight view — clearance is performed by Department Directors in their portal
                    </div>
                )}
            </div>

            <TabBar tabs={allTabs} active={activeTab} onChange={handleTabChange} />

            <div
                role="tabpanel"
                id={`tabpanel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
            >
                {activeTab === 'deployments' && <Deployments />}
                {activeTab === 'dept-clearance' && isAdmin && <DepartmentClearance />}
                {activeTab === 'hr-clearance' && <ClearanceQueue />}
            </div>
        </div>
    );
}
