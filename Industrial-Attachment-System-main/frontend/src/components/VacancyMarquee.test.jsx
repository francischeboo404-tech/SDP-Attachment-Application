import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import VacancyMarquee from './VacancyMarquee';

function job(id) {
    return {
        id,
        title: `Geologist Attachee ${id}`,
        department_name: `Directorate ${id}`,
        description: '<p>Field mapping and sampling.</p>',
        requirements: 'BSc Geology',
        location: 'Nairobi',
        slots_required: 2,
        deadline: '2026-12-31',
    };
}

const jobs = [job(1), job(2), job(3), job(4), job(5)];

/**
 * Whether the strip animates is decided by measurement -- does one set of cards
 * exceed the container width? -- because a count threshold cannot tell you that
 * (three cards overflow a phone and sit in the middle of a wide desktop). jsdom
 * performs no layout, so the card width and container width are stubbed to drive
 * that decision.
 */
function stubWidths({ cardWidth, containerWidth }) {
    const proto = window.HTMLElement.prototype;
    const originalOffsetWidth = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
    const originalClientWidth = Object.getOwnPropertyDescriptor(proto, 'clientWidth');

    Object.defineProperty(proto, 'offsetWidth', { configurable: true, get() { return cardWidth; } });
    Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return containerWidth; } });

    return () => {
        if (originalOffsetWidth) Object.defineProperty(proto, 'offsetWidth', originalOffsetWidth);
        else delete proto.offsetWidth;
        if (originalClientWidth) Object.defineProperty(proto, 'clientWidth', originalClientWidth);
        else delete proto.clientWidth;
    };
}

describe('VacancyMarquee', () => {
    let restore = null;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (restore) restore();
        restore = null;
    });

    it('renders nothing when there are no vacancies', () => {
        const { container } = render(<VacancyMarquee jobs={[]} onApply={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('animates when the cards overflow the available width', async () => {
        // 5 cards at 400px = 2000px against 1200px available.
        restore = stubWidths({ cardWidth: 400, containerWidth: 1200 });
        render(<VacancyMarquee jobs={jobs} onApply={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId('vacancy-marquee').className).toContain('vacancy-marquee');
        });
        expect(screen.getByTestId('vacancy-marquee').querySelector('.vacancy-marquee__track')).toBeInTheDocument();
    });

    // A track narrower than its container would slide the last card off the left
    // and reveal blank space on the right, so the static grid is used instead.
    it('falls back to a static grid when the cards already fit', async () => {
        // 5 narrow cards = 500px against 1200px available.
        restore = stubWidths({ cardWidth: 100, containerWidth: 1200 });
        render(<VacancyMarquee jobs={jobs} onApply={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId('vacancy-marquee').querySelector('.vacancy-marquee__track')).toBeNull();
        });
        expect(screen.getAllByText('Apply for Attachment')).toHaveLength(jobs.length);
    });

    it('sets a duration on the track so the loop is timed, not instant', async () => {
        restore = stubWidths({ cardWidth: 400, containerWidth: 1200 });
        render(<VacancyMarquee jobs={jobs} onApply={vi.fn()} />);

        await waitFor(() => {
            const track = screen.getByTestId('vacancy-marquee').querySelector('.vacancy-marquee__track');
            expect(track.style.getPropertyValue('--marquee-duration')).toMatch(/^\d+(\.\d+)?s$/);
        });
    });

    // The seamless loop needs two identical halves, but a duplicate set of
    // "Apply" buttons would be announced twice and reachable twice by keyboard.
    it('duplicates the cards but hides the copy from assistive tech and the tab order', async () => {
        restore = stubWidths({ cardWidth: 400, containerWidth: 1200 });
        render(<VacancyMarquee jobs={jobs} onApply={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByTestId('vacancy-marquee').querySelector('.vacancy-marquee__clone')).toBeInTheDocument();
        });

        expect(screen.getAllByText('Apply for Attachment')).toHaveLength(jobs.length * 2);

        const clone = screen.getByTestId('vacancy-marquee').querySelector('.vacancy-marquee__clone');
        expect(clone).toHaveAttribute('aria-hidden', 'true');
        // inert is what actually removes the clone's buttons from the tab order;
        // aria-hidden alone does not.
        expect(clone).toHaveAttribute('inert');
    });

    it('wires every card in the real copy to the apply handler', async () => {
        restore = stubWidths({ cardWidth: 400, containerWidth: 1200 });
        const onApply = vi.fn();
        render(<VacancyMarquee jobs={jobs} onApply={onApply} />);

        await waitFor(() => expect(screen.getAllByText('Apply for Attachment').length).toBe(10));
        fireEvent.click(screen.getAllByText('Apply for Attachment')[0]);
        expect(onApply).toHaveBeenCalledWith(1);
    });

    it('shows each vacancy once in the static fallback', async () => {
        restore = stubWidths({ cardWidth: 100, containerWidth: 1200 });
        render(<VacancyMarquee jobs={[job(1), job(2)]} onApply={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getAllByText('Apply for Attachment')).toHaveLength(2);
        });
    });
});
