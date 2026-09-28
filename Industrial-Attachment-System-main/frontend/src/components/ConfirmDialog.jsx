import React, { useEffect, useRef } from 'react';

/**
 * ConfirmDialog
 *
 * A confirmation prompt for consequential, irreversible actions, plus an
 * outcome report afterwards.
 *
 * Replaces `window.alert()` for the actions that actually matter. A native
 * alert cannot be styled, cannot name the specific action, and â€” critically â€”
 * presents "OK" and "Cancel" identically, so an HR officer recording a
 * rejection sees no difference between the two outcomes until after the fact.
 * This states what is about to happen, to whom, and that the applicant will be
 * notified.
 *
 * The confirm button colour is semantic, not decorative: `success` uses the
 * functional green and `danger` the functional red, deliberately NOT the
 * official identity Red/Green, which are reserved for the national identity
 * mark and would otherwise be read as "error" / "success" by users.
 */
export default function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'primary', // 'primary' | 'success' | 'danger'
    busy = false,
    onConfirm,
    onCancel,
}) {
    const cancelRef = useRef(null);

    // Move focus to Cancel, not Confirm: a destructive or irreversible action
    // must not be one stray Enter keypress away from firing.
    useEffect(() => {
        if (open && cancelRef.current) {
            cancelRef.current.focus();
        }
    }, [open]);

    // Escape cancels, Enter confirms.
    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCancel?.();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open, onCancel]);

    if (!open) return null;

    const toneClasses = {
        primary: 'bg-primary-600 hover:bg-primary-500 text-[var(--color-primary-on)]',
        // --color-status-success / --color-status-error, not the identity hues.
        success: 'bg-[var(--color-status-success)] hover:bg-[var(--color-status-success-readable)] text-white',
        danger: 'bg-[var(--color-status-error)] hover:bg-[var(--color-status-error-readable)] text-white',
    };

    const iconClasses = {
        primary: 'bg-primary-50 text-primary-700 border-primary-200',
        success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        danger: 'bg-rose-50 text-rose-800 border-rose-200',
    };

    const iconPath = {
        primary: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        danger: 'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            data-testid="confirm-dialog"
        >
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="p-6">
                    <div className={`w-12 h-12 rounded-xl border flex items-center justify-center mb-4 ${iconClasses[tone] || iconClasses.primary}`}>
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={iconPath[tone] || iconPath.primary} />
                        </svg>
                    </div>
                    <h3 id="confirm-dialog-title" className="text-lg font-black text-slate-900 mb-2">
                        {title}
                    </h3>
                    {message && (
                        <div className="text-sm text-slate-600 font-medium leading-relaxed">
                            {message}
                        </div>
                    )}
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-60"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${toneClasses[tone] || toneClasses.primary}`}
                    >
                        {busy ? 'Working...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * StatusToast
 *
 * A transient confirmation or failure notice.
 *
 * Success needs a visible acknowledgement, not just a silent state change:
 * recording a decision looks identical to a no-op if nothing confirms it, and
 * the officer cannot tell whether the applicant was notified. Failures get the
 * same treatment so a rejected save is never mistaken for a successful one.
 */
export function StatusToast({ toast, onDismiss }) {
    useEffect(() => {
        if (!toast) return undefined;
        const timer = setTimeout(() => onDismiss?.(), toast.duration || 6000);
        return () => clearTimeout(timer);
    }, [toast, onDismiss]);

    if (!toast) return null;

    const toneClasses = {
        success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        error: 'border-rose-200 bg-rose-50 text-rose-900',
        info: 'border-primary-200 bg-primary-50 text-primary-900',
    };
    const iconClasses = {
        success: 'text-emerald-700',
        error: 'text-rose-700',
        info: 'text-primary-700',
    };

    return (
        <div
            className="fixed top-20 right-4 z-[110] w-[calc(100%-2rem)] max-w-sm"
            role="status"
            aria-live="polite"
            data-testid="status-toast"
        >
            <div className={`rounded-xl border shadow-lg p-4 flex items-start gap-3 ${toneClasses[toast.type] || toneClasses.info}`}>
                <svg className={`w-5 h-5 shrink-0 mt-0.5 ${iconClasses[toast.type] || iconClasses.info}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {toast.type === 'error' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    )}
                </svg>
                <div className="flex-1 min-w-0">
                    {toast.title && (
                        <p className="text-sm font-black leading-snug">{toast.title}</p>
                    )}
                    {toast.message && (
                        <p className="text-xs font-medium leading-relaxed mt-0.5">{toast.message}</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label="Dismiss notification"
                    className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
