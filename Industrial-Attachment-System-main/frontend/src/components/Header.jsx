import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import NotificationsPanel from './NotificationsPanel';
import { useLiveData, unwrapList } from '../hooks/useLiveData';

export default function Header({ onMenuClick }) {
    const user = useAuthStore(state => state.user);
    // Shared poll, so notifications use the same cadence and the same
    // visibility/focus behaviour as the other live surfaces rather than a
    // second hand-rolled interval.
    const fetchNotifications = useCallback(async () => {
        const res = await api.get('jobs/notifications/');
        return unwrapList(res.data);
    }, []);

    const { data } = useLiveData(fetchNotifications, { enabled: !!user });

    // Ids marked read locally but not yet reflected by the server. A read
    // receipt is immediate feedback, so it is applied on click and the next
    // poll's payload is overlaid with it; without this the bell jumps back to
    // "unread" for up to a poll interval after being clicked.
    const [locallyRead, setLocallyRead] = useState(() => new Set());

    const notifications = useMemo(
        () => (data || []).map((n) => (locallyRead.has(n.id) ? { ...n, is_read: true } : n)),
        [data, locallyRead]
    );
    const unreadCount = notifications.filter((n) => !n.is_read).length;

    const markLocallyRead = (id) => {
        setLocallyRead((prev) => new Set(prev).add(id));
    };
    const markAllLocallyRead = () => {
        setLocallyRead(new Set((data || []).map((n) => n.id)));
    };
    const [showPopover, setShowPopover] = useState(false);
    const [loading, setLoading] = useState(false);
    const popoverRef = useRef(null);

    // Handle outside clicks to close popover
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                setShowPopover(false);
            }
        };
        if (showPopover) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showPopover]);

    const markAsRead = async (id) => {
        try {
            await api.patch(`jobs/notifications/${id}/read/`);
            // Optimistic: the poll will reconcile, but a read receipt should
            // not wait on a network round trip to stop showing as unread.
            markLocallyRead(id);
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const markAllAsRead = async () => {
        try {
            setLoading(true);
            await api.post('jobs/notifications/mark-all-read/');
            markAllLocallyRead();
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        } finally {
            setLoading(false);
        }
    };

    // Role display helper
    const roleLabel = (role) => {
        const map = {
            ADMIN: 'Administrator',
            HR: 'Human Resources',
            DEPARTMENT_DIRECTOR: 'Dept. Director',
            DEPARTMENT: 'Department',
            APPLICANT: 'Applicant',
        };
        return map[role] || role || 'Applicant';
    };

    return (
        // The 2px gold rule under the header is the page's main brand surface.
        // It is a non-text UI element, so the exact #bf7d2a is used here
        // (3.40:1 against white, which clears the 3:1 threshold required of UI
        // components), while the header keeps a white background as the
        // identity guideline requires.
        <header className="bg-white border-b-2 border-primary-600 h-16 flex items-center justify-between px-4 md:px-6 z-20 sticky top-0 shadow-sm">
            <div className="flex items-center gap-3">
                <button 
                    onClick={onMenuClick}
                    className="md:hidden p-2 rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 transition-colors"
                    aria-label="Open navigation"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
                <div className="flex items-center gap-2.5">
                    {/* National identity accent: the official three-bar mark
                        (black/red/green) beside the Ministry name, per the
                        identity guideline. aria-hidden -- it carries no
                        information a screen reader needs. */}
                    <span className="identity-accent" aria-hidden="true">
                        <span /><span /><span />
                    </span>
                    <div className="p-1.5 bg-primary-600 text-[var(--color-primary-on)] rounded-lg shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    </div>
                    <div className="leading-none">
                        <span className="hidden sm:block text-sm font-black text-slate-900 tracking-tight">State Department for Petroleum</span>
                        <span className="sm:hidden text-sm font-black text-slate-900 tracking-tight">Dept. Petroleum</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
                {/* Notifications Bell */}
                <div className="relative" ref={popoverRef}>
                    <button
                        onClick={() => setShowPopover(!showPopover)}
                        className="relative p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-primary-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                        title="Notifications"
                        aria-label="Notifications"
                    >
                        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        {unreadCount > 0 && (
                            /* h-5/min-w-[1.25rem] (was h-4/w-4): the badge carries
                               text-2xs (12px) and the old 16px box clipped it. */
                            <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-2xs font-black rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center shadow-sm ring-2 ring-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notification Popover. Extracted to NotificationsPanel
                        so the expand-a-long-message behaviour and its
                        accessibility live in one testable component rather
                        than inline in the header. */}
                    {showPopover && (
                        <NotificationsPanel
                            notifications={notifications}
                            onMarkRead={markAsRead}
                            onMarkAllRead={markAllAsRead}
                            markingAll={loading}
                        />
                    )}
                </div>

                {/* User info + avatar */}
                <div className="flex items-center gap-2.5">
                    <div className="text-right hidden sm:block">
                        <p className="text-sm font-bold text-slate-900 leading-tight">{user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.username || 'Guest')}</p>
                        <p className="text-2xs font-bold text-primary-800 uppercase tracking-wider">{roleLabel(user?.role)}</p>
                    </div>
                    <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary-800 to-primary-600 text-white font-black text-sm shadow-sm">
                        {user?.username?.charAt(0).toUpperCase() || 'G'}
                    </div>
                </div>
            </div>
        </header>
    );
}
