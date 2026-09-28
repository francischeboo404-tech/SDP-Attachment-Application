import React from 'react';

/**
 * ApplicationTimeline
 *
 * The applicant's step-by-step screening history, read from the server-recorded
 * `status_history` rather than inferred from the current status.
 *
 * Why this is a separate component and not more inline JSX in Applications.jsx:
 * the history is the authoritative record of what happened and when, including
 * a decision that was later reversed by HR. The earlier bar chart could only
 * show the *current* status, so a reversal looked identical to never having
 * been decided, and reloading could not recover the sequence.
 *
 * The server returns events oldest-first with a guaranteed fallback, so this
 * never renders an empty timeline for a real application.
 */

const STEP_LABELS = {
    PENDING: 'Application submitted',
    REVIEWED: 'Reviewed by HR',
    SUCCESSFUL: 'Opportunity granted',
    REJECTED: 'Application not successful',
};

function formatTimestamp(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// The current status is the last thing that happened, so a decision that was
// reversed is visibly marked as superseded rather than silently overwritten.
function toneFor(event, isLatest, currentStatus) {
    if (!isLatest) {
        return 'bg-slate-200 text-slate-600 border-slate-300';
    }
    if (event.to_status === 'SUCCESSFUL' && currentStatus === 'SUCCESSFUL') {
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
    }
    if (event.to_status === 'REJECTED' && currentStatus === 'REJECTED') {
        return 'bg-rose-50 text-rose-800 border-rose-300';
    }
    if (event.to_status === 'REVIEWED' || event.to_status === 'SUCCESSFUL') {
        return 'bg-primary-50 text-primary-800 border-primary-300';
    }
    return 'bg-amber-50 text-amber-800 border-amber-300';
}

export default function ApplicationTimeline({ history, currentStatus }) {
    const events = Array.isArray(history) ? history : [];
    if (!events.length) return null;

    return (
        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 mb-4">
            <h4 className="text-2xs font-black uppercase tracking-wider text-slate-500 mb-3">
                Screening progress
            </h4>
            <ol className="space-y-0" data-testid="application-timeline">
                {events.map((event, index) => {
                    const isLatest = index === events.length - 1;
                    const label = STEP_LABELS[event.to_status]
                        || event.to_status.charAt(0) + event.to_status.slice(1).toLowerCase();
                    const stamp = formatTimestamp(event.created_at);
                    // Only a decision can be reversed. Marking the submission
                    // step "superseded" would be wrong: nothing later undoes the
                    // fact that the applicant applied, so only an actual
                    // SUCCESSFUL/REJECTED step that a later step overrode is
                    // flagged, and never the current one.
                    const isDecision = event.to_status === 'SUCCESSFUL' || event.to_status === 'REJECTED';
                    const superseded = isDecision
                        && !isLatest
                        && events.slice(index + 1).some(later => later.to_status !== event.to_status);

                    return (
                        <li key={event.id ?? `${event.to_status}-${index}`} className="flex gap-3">
                            <div className="flex flex-col items-center shrink-0">
                                <span
                                    className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 mt-1 ${toneFor(event, isLatest, currentStatus)}`}
                                />
                                {index < events.length - 1 && (
                                    <span className="w-0.5 flex-1 min-h-[1.25rem] bg-slate-300 my-0.5" />
                                )}
                            </div>
                            <div className="pb-3 min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-800 leading-snug">
                                    {label}
                                    {isLatest && (
                                        <span className="ml-1.5 text-2xs font-black uppercase tracking-wider text-primary-700">
                                            Current
                                        </span>
                                    )}
                                    {superseded && (
                                        <span className="ml-1.5 text-2xs font-black uppercase tracking-wider text-slate-400">
                                            Superseded
                                        </span>
                                    )}
                                </p>
                                <p className="text-2xs text-slate-500 font-medium mt-0.5">
                                    {stamp || 'Time not recorded'}
                                    {event.note ? ` Â· ${event.note}` : ''}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
