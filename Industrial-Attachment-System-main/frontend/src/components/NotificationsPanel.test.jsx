import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import NotificationsPanel from './NotificationsPanel';

/**
 * The behaviour under test: a notification body longer than two lines can be
 * expanded and read in full.
 *
 * `useIsClamped` decides whether to offer "Show more" by comparing scrollHeight
 * with clientHeight on the rendered element. jsdom reports both as 0 for every
 * element, so the clamp is never detected through measurement and no toggle
 * would ever appear. These tests therefore drive `scrollHeight`/`clientHeight`
 * directly, which is what the browser would report, so the component's real
 * decision logic runs rather than a stubbed-out version of it.
 */

/**
 * Minimal ResizeObserver stub whose callbacks can be fired by hand.
 *
 * jsdom has none, and the component measures the rendered element to decide
 * whether a body is genuinely clipped. Without an observer the measurement only
 * ever runs once on mount, so a test can never model the resize that reveals
 * the clamp. This stub records the callback so a test can report the element's
 * dimensions and trigger a re-measure, which is the same path a real browser
 * takes when a reflow changes the line count.
 */
function installResizeObserver() {
    const observed = new Set();
    const observers = new Set();

    global.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            observers.add(this);
        }
        observe(target) {
            observed.add(target);
        }
        unobserve(target) {
            observed.delete(target);
        }
        disconnect() {
            observers.delete(this);
        }
    };

    return {
        /** Report this element's dimensions and re-run the measurement. */
        report(element, { scrollHeight, clientHeight }) {
            Object.defineProperty(element, 'scrollHeight', {
                configurable: true,
                value: scrollHeight,
            });
            Object.defineProperty(element, 'clientHeight', {
                configurable: true,
                value: clientHeight,
            });
            observers.forEach((o) => o.callback([], o));
        },
    };
}

const CLIPPED = { scrollHeight: 100, clientHeight: 40 };
const NOT_CLIPPED = { scrollHeight: 40, clientHeight: 40 };

const LONG =
    'Your department has requested revisions to the final report. ' +
    'The attendance register for the second rotation was not signed by the ' +
    'supervisor, and the technical log is missing the final week of entries. ' +
    'Please re-upload both documents and resubmit for clearance.';

const SHORT = 'Your clearance has been approved.';

function notification(overrides = {}) {
    return {
        id: 1,
        title: 'Clearance Revision Requested',
        message: LONG,
        notification_type: 'CLEARANCE_UPDATE',
        is_read: false,
        created_at: '2026-05-01T10:00:00Z',
        department_name: 'Geology',
        ...overrides,
    };
}

/** Renders the panel and returns helpers bound to its rendered bodies. */
function renderPanel(notifications, props = {}) {
    const observer = installResizeObserver();
    const view = render(
        <NotificationsPanel
            notifications={notifications}
            onMarkRead={props.onMarkRead || vi.fn()}
            onMarkAllRead={props.onMarkAllRead || vi.fn()}
            markingAll={props.markingAll}
        />
    );
    const bodies = () =>
        Array.from(view.container.querySelectorAll('p[id^="notification-body"]'));
    return { ...view, bodies, observer };
}

describe('NotificationsPanel', () => {
    afterEach(() => {
        delete global.ResizeObserver;
    });

    it('renders the full message text in the DOM even while collapsed', () => {
        renderPanel([notification()]);
        // The whole text was always rendered; it was only visually clipped. A
        // reader using a screen reader or select-all was never missing it.
        expect(screen.getByText(LONG)).toBeInTheDocument();
    });

    it('offers a way to expand a message that is clipped', async () => {
        const { bodies, observer } = renderPanel([notification()]);
        await act(async () => {
            observer.report(bodies()[0], CLIPPED);
        });

        const toggle = screen.getByRole('button', { name: /show more/i });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    it('reveals the whole message when expanded and collapses it again', async () => {
        const { bodies, observer } = renderPanel([notification()]);
        await act(async () => {
            observer.report(bodies()[0], CLIPPED);
        });

        fireEvent.click(screen.getByRole('button', { name: /show more/i }));

        // Expanded: the clamp classes are gone and the tail of the message is
        // reachable.
        expect(bodies()[0].className).not.toContain('line-clamp-2');
        expect(bodies()[0].className).toContain('whitespace-pre-line');
        expect(bodies()[0].textContent).toContain('Please re-upload both documents');

        fireEvent.click(screen.getByRole('button', { name: /show less/i }));
        expect(bodies()[0].className).toContain('line-clamp-2');
    });

    it('the expand control is wired to the body it controls', async () => {
        const { bodies, observer } = renderPanel([notification({ id: 77 })]);
        await act(async () => {
            observer.report(bodies()[0], CLIPPED);
        });

        const toggle = screen.getByRole('button', { name: /show more/i });
        expect(toggle.getAttribute('aria-controls')).toBe(bodies()[0].id);
        expect(bodies()[0].id).toBe('notification-body-77');
    });

    it('offers no expand control for a short message that is not clipped', async () => {
        const { bodies, observer } = renderPanel([notification({ id: 5, message: SHORT })]);
        await act(async () => {
            observer.report(bodies()[0], NOT_CLIPPED);
        });

        expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
    });

    it('preserves the line breaks in a multi-paragraph message', () => {
        const multiLine = 'Line one.\n\nLine two after a blank line.';
        const { bodies } = renderPanel([notification({ message: multiLine })]);
        // Reviewer notes arrive as free text and routinely contain paragraphs.
        // Without whitespace-pre-line they would be flattened into one run.
        expect(bodies()[0].className).toContain('whitespace-pre-line');
        expect(bodies()[0].textContent).toBe(multiLine);
    });

    it('keeps each expanded message open when another is expanded', async () => {
        const { bodies, observer } = renderPanel([
            notification({ id: 1 }),
            notification({ id: 2, message: SHORT }),
        ]);
        await act(async () => {
            bodies().forEach((b) => observer.report(b, CLIPPED));
        });

        // Expand each row in turn, picking up whatever is still collapsed.
        // After the first click row 1 reads "Show less", so a positional index
        // into getAllByRole would be wrong.
        fireEvent.click(screen.getAllByRole('button', { name: /^show more$/i })[0]);
        fireEvent.click(screen.getAllByRole('button', { name: /^show more$/i })[0]);

        // Reading the second message must not close the first.
        bodies().forEach((b) => expect(b.className).not.toContain('line-clamp-2'));
    });

    it('expands and collapses every message at once', async () => {
        const { bodies, observer } = renderPanel([
            notification({ id: 1 }),
            notification({ id: 2, message: SHORT }),
        ]);
        await act(async () => {
            bodies().forEach((b) => observer.report(b, CLIPPED));
        });

        fireEvent.click(screen.getByRole('button', { name: /expand all/i }));
        bodies().forEach((b) => expect(b.className).not.toContain('line-clamp-2'));

        fireEvent.click(screen.getByRole('button', { name: /collapse all/i }));
        bodies().forEach((b) => expect(b.className).toContain('line-clamp-2'));
    });

    it('marks a notification read from the keyboard, not only the mouse', () => {
        const onMarkRead = vi.fn();
        renderPanel([notification()], { onMarkRead });
        // A div with onClick is unreachable by keyboard, which is how reading a
        // notification and marking it read became a mouse-only action.
        fireEvent.click(screen.getByRole('button', { name: 'Clearance Revision Requested' }));
        expect(onMarkRead).toHaveBeenCalledWith(1);
    });

    it('reports how many notifications are unread', () => {
        renderPanel([
            notification({ id: 1, is_read: false }),
            notification({ id: 2, is_read: false }),
            notification({ id: 3, is_read: true }),
        ]);
        expect(screen.getByText('2 unread')).toBeInTheDocument();
    });

    it('says so plainly when there is nothing to read', () => {
        renderPanel([]);
        expect(screen.getByText('No notifications yet')).toBeInTheDocument();
    });
});
