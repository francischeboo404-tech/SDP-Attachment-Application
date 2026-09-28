import React, { useEffect, useRef } from 'react';
import Reports from '../pages/Reports';

/**
 * ReportsModal
 * Full-height slide-in panel from the right — far better UX for data tables
 * and analytics content than a centered overlay.
 * - Escape key closes
 * - Click outside (on backdrop) closes
 * - Body scroll lock while open
 * - Smooth slide + fade animation
 *
 * Reused for every reports presentation in the product:
 * - Admin/HR (from the Dashboard) get the institutional <Reports /> component.
 * - Directors get the department-scoped <DepartmentReports /> component passed
 *   as `children`, so both roles share one modal/dialog presentation while
 *   consuming entirely different, server-scoped data.
 */
export default function ReportsModal({
    isOpen,
    onClose,
    title = 'Reports & Analytics',
    subtitle = 'Attachee reports, vacancy fill rates, and programme analytics',
    children,
}) {
    const panelRef = useRef(null);

    // Escape key handler
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    // Lock body scroll while open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    // Focus panel on open
    useEffect(() => {
        if (isOpen && panelRef.current) {
            panelRef.current.focus();
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex"
            aria-modal="true"
            role="dialog"
            aria-labelledby="reports-panel-title"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] transition-opacity duration-300"
                onClick={onClose}
                aria-hidden="true"
                style={{ animation: 'fadeIn 200ms ease-out' }}
            />

            {/* Slide-in panel from right */}
            <div
                ref={panelRef}
                tabIndex={-1}
                className="relative ml-auto bg-white flex flex-col w-full max-w-[900px] shadow-2xl border-l border-slate-200"
                style={{
                    outline: 'none',
                    height: '100vh',
                    animation: 'slideInRight 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Panel header */}
                <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-primary-100 to-primary-200 text-primary-800 rounded-xl shadow-sm">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                        </div>
                        <div>
                            <h2 id="reports-panel-title" className="text-base font-black text-slate-900 tracking-tight">
                                {title}
                            </h2>
                            <p className="text-2xs text-slate-500 font-medium mt-0.5">{subtitle}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        aria-label="Close reports panel"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Scrollable content — renders the caller's content, falling back to Reports */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 bg-slate-50/40">
                    {children ?? <Reports />}
                </div>
            </div>

            {/* Inline keyframe animations */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0.5; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
