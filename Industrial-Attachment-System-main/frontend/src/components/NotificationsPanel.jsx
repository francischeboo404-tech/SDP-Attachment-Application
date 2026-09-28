import React, { useCallback, useState } from 'react';
import { useIsClamped } from '../hooks/useIsClamped';

/**
 * Notification list with expandable bodies.
 *
 * A notification body is a plain-text ``message`` that can be arbitrarily long
 * -- a clearance revision request carries the reviewer's free-text notes, and a
 * rejected requisition carries HR's feedback. Those are the messages a reader
 * most needs to read in full, and they are exactly the ones that were being
 * cut off. The list previously applied ``line-clamp-2`` to every message with no
 * way to see the rest: the full text was in the DOM but visually unreachable,
 * and nothing told the reader that anything had been hidden.
 *
 * A collapsed row is clamped to two lines and offers "Show more" only when the
 * text is genuinely clipped, so short messages get no pointless control. The
 * "Show more / Show less" state is a button with `aria-expanded` and
 * `aria-controls` rather than a bare div, and the row itself is a real button so
 * it is reachable by keyboard -- marking a notification read by clicking a
 * non-focusable div meant the action was unavailable to anyone not using a
 * mouse.
 */

/** Lines shown while collapsed. */
const COLLAPSED_LINES = 2;

function NotificationRow({ notification, expanded, onToggle, onMarkRead }) {
    const [ref, clamped] = useIsClamped([notification.message || ''], { disabled: expanded });
    const isUnread = !notification.is_read;
    // Showing the rest of the body is an act of reading it, so expanding is
    // treated as a read receipt even if the click never reached the row.
    const bodyId = `notification-body-${notification.id}`;

    return (
        <div className={`px-5 py-3.5 transition-colors ${isUnread ? 'bg-primary-100/30' : ''}`}>
            <div className="flex gap-3 items-start">
                <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${isUnread ? 'bg-primary-600' : 'bg-transparent'}`}
                    aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        {/* A button, not a div: reading a notification marks it
                            read, and that action has to be reachable by
                            keyboard and announced. */}
                        <button
                            type="button"
                            onClick={() => onMarkRead(notification.id)}
                            className={`text-xs font-bold text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded ${
                                isUnread ? 'text-slate-900' : 'text-slate-600'
                            }`}
                        >
                            <span className="line-clamp-2">{notification.title}</span>
                        </button>
                        <span className="text-2xs text-slate-400 font-medium shrink-0">
                            {new Date(notification.created_at).toLocaleDateString([], {
                                month: 'short',
                                day: 'numeric',
                            })}
                        </span>
                    </div>

                    <p
                        ref={ref}
                        id={bodyId}
                        className={`text-2xs text-slate-500 mt-1 leading-relaxed whitespace-pre-line ${
                            expanded ? '' : 'line-clamp-2 overflow-hidden'
                        }`}
                    >
                        {notification.message}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        {/* Stays visible while expanded. Gating on `clamped`
                            alone made the control vanish the moment the message
                            was shown in full, leaving it impossible to
                            collapse again. */}
                        {(clamped || expanded) && (
                            <button
                                type="button"
                                onClick={onToggle}
                                aria-expanded={expanded}
                                aria-controls={bodyId}
                                className="inline-flex items-center gap-1 text-2xs font-bold text-primary-800 hover:text-primary-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded"
                            >
                                {expanded ? 'Show less' : 'Show more'}
                                <svg
                                    className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden="true"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2.5"
                                        d="M19 9l-7 7-7-7"
                                    />
                                </svg>
                            </button>
                        )}
                        {notification.department_name && (
                            <span className="inline-block text-2xs font-bold uppercase tracking-wider text-[var(--color-primary-on)] bg-primary-600 px-2 py-1 rounded border border-primary-200">
                                {notification.department_name}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function NotificationsPanel({ notifications, onMarkRead, onMarkAllRead, markingAll }) {
    // Set of expanded ids rather than a single one: reading a long message and
    // then opening the next one should not collapse the first back to two lines.
    const [expanded, setExpanded] = useState(() => new Set());

    const toggle = useCallback((id) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const allExpanded = notifications.length > 0 && expanded.size >= notifications.length;
    const toggleAll = useCallback(() => {
        setExpanded((prev) => (prev.size >= notifications.length ? new Set() : new Set(notifications.map((n) => n.id))));
    }, [notifications]);

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    return (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 max-h-[85vh] flex flex-col overflow-hidden" style={{ animation: 'fadeIn 150ms ease-out' }}>
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-slate-50/60">
                <div>
                    <h3 className="font-black text-slate-900 text-sm">Notifications</h3>
                    <p className="text-2xs text-slate-500 font-medium">
                        {unreadCount > 0 ? `${unreadCount} unread` : 'Department alerts & vacancy updates'}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {notifications.length > 1 && (
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="text-2xs font-bold text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded"
                        >
                            {allExpanded ? 'Collapse all' : 'Expand all'}
                        </button>
                    )}
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={onMarkAllRead}
                            disabled={markingAll}
                            className="text-2xs font-bold text-primary-800 hover:text-primary-900 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded"
                        >
                            Mark all read
                        </button>
                    )}
                </div>
            </div>

            <div className="overflow-y-auto max-h-[420px] divide-y divide-slate-50">
                {notifications.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">
                        <svg className="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <p className="text-xs font-semibold">No notifications yet</p>
                    </div>
                ) : (
                    notifications.map((n) => (
                        <NotificationRow
                            key={n.id}
                            notification={n}
                            expanded={expanded.has(n.id)}
                            onToggle={() => toggle(n.id)}
                            onMarkRead={onMarkRead}
                        />
                    ))
                )}
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
