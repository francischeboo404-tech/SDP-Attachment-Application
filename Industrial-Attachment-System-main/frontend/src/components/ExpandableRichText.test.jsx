import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpandableRichText from './ExpandableRichText';
import { richTextToPlainText, decodeHtmlEntities } from '../utils/richText';

/**
 * jsdom performs no layout, so scrollHeight and clientHeight are both 0 and the
 * clamp measurement can never report "clipped" on its own. These tests stub the
 * two properties to drive the measurement deterministically, which is the only
 * honest way to test a layout-dependent control under jsdom.
 */
function stubClipping({ clipped }) {
    const proto = window.HTMLElement.prototype;
    const originalScrollHeight = Object.getOwnPropertyDescriptor(proto, 'scrollHeight');
    const originalClientHeight = Object.getOwnPropertyDescriptor(proto, 'clientHeight');

    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get() { return clipped ? 200 : 40; } });
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return 40; } });

    return () => {
        if (originalScrollHeight) Object.defineProperty(proto, 'scrollHeight', originalScrollHeight);
        else delete proto.scrollHeight;
        if (originalClientHeight) Object.defineProperty(proto, 'clientHeight', originalClientHeight);
        else delete proto.clientHeight;
    };
}

describe('decodeHtmlEntities', () => {
    it('decodes the entities the sanitizer introduces', () => {
        expect(decodeHtmlEntities('R&amp;D')).toBe('R&D');
        expect(decodeHtmlEntities('&lt;script&gt;')).toBe('<script>');
        expect(decodeHtmlEntities('&quot;quoted&quot;')).toBe('"quoted"');
        expect(decodeHtmlEntities('&#8212;')).toBe('—');
        expect(decodeHtmlEntities('&#x2014;')).toBe('—');
    });

    it('leaves unknown entities alone rather than dropping text', () => {
        expect(decodeHtmlEntities('&notarealentity;')).toBe('&notarealentity;');
    });

    it('leaves a lone surrogate escaped instead of producing invalid text', () => {
        expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;');
    });

    it('passes through text with no entities untouched', () => {
        const input = 'Geology department, Nairobi';
        expect(decodeHtmlEntities(input)).toBe(input);
    });
});

describe('richTextToPlainText', () => {
    it('measures visible words rather than markup', () => {
        expect(richTextToPlainText('<p><strong>Short</strong> role</p>')).toBe('Short role');
        expect(richTextToPlainText('<ul><li>Alpha</li><li>Beta</li></ul>')).toBe('Alpha Beta');
    });

    it('decodes entities so search matches what a reader sees', () => {
        expect(richTextToPlainText('<p>Research &amp; Development</p>')).toBe('Research & Development');
    });

    it('returns an empty string for non-strings', () => {
        expect(richTextToPlainText(null)).toBe('');
        expect(richTextToPlainText(undefined)).toBe('');
    });
});

describe('ExpandableRichText', () => {
    let restore = null;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        if (restore) restore();
        restore = null;
    });

    it('offers Read more when the text is actually clipped', async () => {
        restore = stubClipping({ clipped: true });
        render(<ExpandableRichText html="<p>A long mandate.</p>" expanded={false} onToggle={vi.fn()} id="d1" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /read more/i })).toBeInTheDocument();
        });
    });

    it('shows Read less once expanded', async () => {
        restore = stubClipping({ clipped: true });
        render(<ExpandableRichText html="<p>A long mandate.</p>" expanded onToggle={vi.fn()} id="d1" />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /read less/i })).toBeInTheDocument();
        });
    });

    // A character threshold would offer a control that does nothing, which
    // looks broken to the reader.
    it('shows no control when the text already fits', async () => {
        restore = stubClipping({ clipped: false });
        render(<ExpandableRichText html="<p>Short.</p>" expanded={false} onToggle={vi.fn()} id="d1" />);

        await waitFor(() => {
            expect(screen.getByText('Short.')).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: /read more|read less/i })).not.toBeInTheDocument();
    });

    it('shows no control when there is no content at all', async () => {
        restore = stubClipping({ clipped: true });
        render(<ExpandableRichText html="" expanded={false} onToggle={vi.fn()} id="d1" />);

        await waitFor(() => {
            expect(screen.getByText(/no description/i)).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: /read more/i })).not.toBeInTheDocument();
    });

    it('calls onToggle when activated', async () => {
        restore = stubClipping({ clipped: true });
        const onToggle = vi.fn();
        render(<ExpandableRichText html="<p>A long mandate.</p>" expanded={false} onToggle={onToggle} id="d1" />);

        await waitFor(() => expect(screen.getByRole('button', { name: /read more/i })).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /read more/i }));
        expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('exposes expansion state to assistive technology', async () => {
        restore = stubClipping({ clipped: true });
        render(<ExpandableRichText html="<p>A long mandate.</p>" expanded={false} onToggle={vi.fn()} id="dept-7" />);

        await waitFor(() => expect(screen.getByRole('button', { name: /read more/i })).toBeInTheDocument());
        const button = screen.getByRole('button', { name: /read more/i });
        expect(button).toHaveAttribute('aria-expanded', 'false');
        expect(button).toHaveAttribute('aria-controls', 'expandable-body-dept-7');
    });

    it('renders formatted rich text rather than raw markup', () => {
        restore = stubClipping({ clipped: false });
        const { container } = render(
            <ExpandableRichText html="<h3>Mandate</h3><ul><li>Upstream</li></ul>" expanded={false} onToggle={vi.fn()} id="d1" />,
        );

        expect(container.querySelector('h3')).toBeTruthy();
        expect(container.querySelector('li')).toBeTruthy();
        expect(container.textContent).not.toContain('<h3>');
    });

    // The whole component rests on the clamp actually applying. If it does not,
    // the text is not truncated, the measurement reports "fits", and the Read
    // more button silently never appears -- with no error anywhere. Pin the
    // class so that regression fails here instead of in production.
    it('applies a real line-clamp class while collapsed and drops it when expanded', () => {
        restore = stubClipping({ clipped: true });
        const { container, rerender } = render(
            <ExpandableRichText html="<p>Long.</p>" expanded={false} onToggle={vi.fn()} id="d1" lines={3} />,
        );

        const body = container.querySelector('#expandable-body-dt1') || container.querySelector('[id^="expandable-body"]');
        expect(body.className).toContain('line-clamp-3');
        expect(body.className).toContain('overflow-hidden');

        rerender(<ExpandableRichText html="<p>Long.</p>" expanded onToggle={vi.fn()} id="d1" lines={3} />);
        expect(body.className).not.toContain('line-clamp-3');
    });

    it('falls back to a known clamp class for an out-of-range line count', () => {
        restore = stubClipping({ clipped: true });
        const { container } = render(
            <ExpandableRichText html="<p>Long.</p>" expanded={false} onToggle={vi.fn()} id="d1" lines={99} />,
        );
        const body = container.querySelector('[id^="expandable-body"]');
        // Must still be clamped, not silently unbounded.
        expect(body.className).toMatch(/line-clamp-\d/);
    });
});
