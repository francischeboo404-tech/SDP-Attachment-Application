import { Link, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { useState } from 'react';

// Icon wrapper
const Icon = ({ d, className = 'w-5 h-5' }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d={d} />
    </svg>
);

const ICONS = {
    dashboard:    'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zm0 8a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5zM4 13a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1v-5z',
    departments:  'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    vacancies:    'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    applicants:   'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    deployment:   'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
    letters:      'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    users:        'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    archives:     'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    audit:        'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    settings:     'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    signout:      'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
    profile:      'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    applications: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    clearance:    'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    director:     'M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z',
    reports:      'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};

// ── Module definitions per role ────────────────────────────────────────────────
// No dropdowns — Departments and Deployment-Exit are simple links.
// Tab navigation lives inside the hub pages themselves.
function buildModules(role) {
    const isAdmin = role === 'ADMIN';
    const isHR = role === 'HR';
    const isAdminOrHR = isAdmin || isHR;
    const isDirector = ['DEPARTMENT_DIRECTOR', 'DEPARTMENT'].includes(role);

    if (isAdminOrHR) {
        const operational = [
            { name: 'Dashboard', path: '/dashboard', iconKey: 'dashboard' },
            { name: 'Departments', path: '/departments-hub', iconKey: 'departments' },
            { name: 'Vacancies', path: '/vacancies', iconKey: 'vacancies' },
            { name: 'Manage Applicants', path: '/manage-jobs', iconKey: 'applicants' },
            { name: 'Deployment \u2013 Exit', path: '/deployment-exit', iconKey: 'deployment' },
            { name: 'Recommendation Letter Templates', path: '/letter-templates', iconKey: 'letters' },
        ];

        const systemGroup = isAdmin
            ? [
                { name: 'User Access Control', path: '/manage-users', iconKey: 'users' },
                { name: 'System Archives', path: '/archives', iconKey: 'archives' },
                { name: 'System Audit Trail', path: '/audit-logs', iconKey: 'audit' },
                { name: 'System Settings', path: '/settings', iconKey: 'settings' },
            ]
            : [
                { name: 'System Archives', path: '/archives', iconKey: 'archives' },
            ];

        return { operational, systemGroup };
    }

    if (isDirector) {
        return {
            operational: [
                { name: 'Dashboard', path: '/dashboard', iconKey: 'dashboard' },
                { name: 'Vacancies', path: '/vacancies', iconKey: 'vacancies' },
                { name: 'Requisition', path: '/director-portal', iconKey: 'director' },
                { name: 'Dept Deployments', path: '/deployments', iconKey: 'deployment' },
                { name: 'Dept Clearance', path: '/department-clearance', iconKey: 'clearance' },
                { name: 'Reports & Analytics', path: '/department-reports', iconKey: 'reports' },
            ],
            systemGroup: [
                { name: 'Department Archives', path: '/department-archives', iconKey: 'archives' },
            ],
        };
    }

    // Applicant
    return {
        operational: [
            { name: 'Profile Info', path: '/profile', iconKey: 'profile' },
            { name: 'Vacancies', path: '/vacancies', iconKey: 'vacancies' },
            { name: 'My Applications', path: '/applications', iconKey: 'applications' },
            { name: 'My Clearance', path: '/clearance', iconKey: 'clearance' },
        ],
        systemGroup: [],
    };
}

// ── NavItem — simple link, no expand/collapse ──────────────────────────────────
function NavItem({ item, isActive, collapsed, onLinkClick }) {
    // The active item uses the official 20% gold tint (--color-primary-200)
    // rather than the near-white 100 step, so the active route reads clearly as
    // brand gold. Text is --color-primary-900, which clears AA comfortably
    // against that tint.
    const activeClass = 'bg-primary-200 text-primary-900 font-extrabold border-l-[3px] border-primary-600';
    const inactiveClass = 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-[3px] border-transparent';
    const centerClass = collapsed ? 'justify-center' : '';

    return (
        <Link
            to={item.path}
            onClick={onLinkClick}
            title={collapsed ? item.name : undefined}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 ${isActive ? activeClass : inactiveClass} ${centerClass}`}
        >
            <span className={`shrink-0 transition-colors ${isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                <Icon d={ICONS[item.iconKey]} className="w-[18px] h-[18px]" />
            </span>
            {!collapsed && <span className="truncate">{item.name}</span>}
        </Link>
    );
}

// ── Main Sidebar ───────────────────────────────────────────────────────────────
export default function Sidebar({ isOpen, setIsOpen }) {
    const location = useLocation();
    const logout = useAuthStore(state => state.logout);
    const userRole = useAuthStore(state => state.user?.role || 'APPLICANT');

    const [collapsed, setCollapsed] = useState(false);

    const { operational, systemGroup } = buildModules(userRole);

    const isModuleActive = (item) => {
        const base = item.path.split('?')[0];
        return location.pathname === base || location.pathname.startsWith(base + '/');
    };

    const closeMobile = () => setIsOpen(false);

    return (
        <>
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-20 md:hidden"
                    onClick={closeMobile}
                    aria-hidden="true"
                />
            )}

            <aside
                className={`fixed inset-y-0 left-0 z-30 bg-white flex flex-col border-r border-slate-200/80 shadow-[2px_0_16px_rgba(0,0,0,0.06)] transform transition-all duration-300 ease-in-out md:relative md:translate-x-0 md:opacity-100 ${collapsed ? 'w-[4.25rem]' : 'w-60'} ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none md:pointer-events-auto'}`}
                aria-label="Portal navigation"
            >
                {/* Logo */}
                <div className={`h-16 shrink-0 border-b border-slate-100 flex items-center ${collapsed ? 'justify-center px-2' : 'justify-between px-4'}`}>
                    <img
                        src="/logo.png"
                        alt="State Department for Petroleum"
                        className={`object-contain transition-all duration-300 ${collapsed ? 'h-8 w-8' : 'h-10'}`}
                    />
                    {!collapsed && (
                        <button
                            onClick={closeMobile}
                            className="md:hidden text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                            aria-label="Close navigation"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Desktop collapse toggle */}
                <button
                    onClick={() => setCollapsed(c => !c)}
                    className="hidden md:flex absolute -right-3 top-[4.5rem] z-40 w-6 h-6 bg-white border border-slate-200 rounded-full items-center justify-center shadow-md text-slate-500 hover:text-primary-600 transition-colors"
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <svg className={`w-3 h-3 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-4 space-y-0.5 scrollbar-thin" aria-label="Main">
                    {!collapsed && (
                        <p className="px-3 pb-1.5 text-2xs font-black uppercase tracking-[0.12em] text-slate-400 select-none">
                            {['ADMIN', 'HR'].includes(userRole) ? 'Operations' : 'Navigation'}
                        </p>
                    )}

                    {operational.map((item) => (
                        <NavItem
                            key={item.name}
                            item={item}
                            isActive={isModuleActive(item)}
                            collapsed={collapsed}
                            onLinkClick={closeMobile}
                        />
                    ))}

                    {/* System group divider — Admin only */}
                    {systemGroup.length > 0 && (
                        <>
                            {collapsed ? (
                                <div className="h-px bg-slate-200 mx-2 my-3" />
                            ) : (
                                <div className="pt-4 pb-1.5 px-3">
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-px bg-slate-200" />
                                        <span className="text-2xs font-black uppercase tracking-[0.12em] text-slate-400 whitespace-nowrap select-none">
                                            System
                                        </span>
                                        <div className="flex-1 h-px bg-slate-200" />
                                    </div>
                                </div>
                            )}
                            {systemGroup.map((item) => (
                                <NavItem
                                    key={item.name}
                                    item={item}
                                    isActive={isModuleActive(item)}
                                    collapsed={collapsed}
                                    onLinkClick={closeMobile}
                                />
                            ))}
                        </>
                    )}
                </nav>

                {/* Sign Out — pinned bottom */}
                <div className={`shrink-0 border-t border-slate-200 bg-slate-50/60 ${collapsed ? 'p-2' : 'p-2.5'}`}>
                    {!collapsed && (
                        <p className="px-3 pb-1 text-2xs font-black uppercase tracking-[0.12em] text-slate-400 select-none">Account</p>
                    )}
                    <button
                        onClick={logout}
                        title={collapsed ? 'Sign Out' : undefined}
                        aria-label="Sign out"
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-700 text-sm font-semibold transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 ${collapsed ? 'justify-center' : ''}`}
                    >
                        <span className="shrink-0 text-slate-400 group-hover:text-rose-500 transition-colors">
                            <Icon d={ICONS.signout} className="w-[18px] h-[18px]" />
                        </span>
                        {!collapsed && <span>Sign Out</span>}
                    </button>
                </div>
            </aside>
        </>
    );
}
