import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import ApplicationTimeline from './ApplicationTimeline';
import RichText from './RichText';
import { richTextToPlainText } from '../utils/richText';

const HISTORY = [
    { id: 1, from_status: '', to_status: 'PENDING', note: 'Application submitted', created_at: '2026-05-01T09:00:00Z' },
    { id: 2, from_status: 'PENDING', to_status: 'REVIEWED', changed_by: 'hr', created_at: '2026-05-03T11:00:00Z' },
    { id: 3, from_status: 'REVIEWED', to_status: 'SUCCESSFUL', changed_by: 'hr', created_at: '2026-05-04T08:30:00Z' },
];

describe('ApplicationTimeline', () => {
    it('renders every recorded step in order', () => {
        render(<ApplicationTimeline history={HISTORY} currentStatus="SUCCESSFUL" />);
        expect(screen.getByText('Application submitted')).toBeInTheDocument();
        expect(screen.getByText('Reviewed by HR')).toBeInTheDocument();
        expect(screen.getByText('Opportunity granted')).toBeInTheDocument();
    });

    it('marks only the final step as current', () => {
        render(<ApplicationTimeline history={HISTORY} currentStatus="SUCCESSFUL" />);
        const current = screen.getAllByText('Current');
        expect(current).toHaveLength(1);
    });

    it('shows the rejection wording rather than a success label', () => {
        render(
            <ApplicationTimeline
                history={[{ id: 1, to_status: 'REJECTED', created_at: '2026-05-03T10:00:00Z' }]}
                currentStatus="REJECTED"
            />
        );
        expect(screen.getByText('Application not successful')).toBeInTheDocument();
        expect(screen.queryByText('Opportunity granted')).toBeNull();
    });

    it('marks a reversed decision as superseded but not the submission', () => {
        // HR rejected, then reversed to successful. The rejection must remain
        // visible as history, while the original submission must NOT be marked
        // superseded -- nothing later undoes the fact that the applicant applied.
        const trail = [
            HISTORY[0],
            { id: 2, from_status: 'PENDING', to_status: 'REJECTED', created_at: '2026-05-03T10:00:00Z' },
            { id: 3, from_status: 'REJECTED', to_status: 'SUCCESSFUL', created_at: '2026-05-04T10:00:00Z' },
        ];
        render(<ApplicationTimeline history={trail} currentStatus="SUCCESSFUL" />);
        // Exactly one superseded marker: the rejected decision only.
        expect(screen.getAllByText('Superseded')).toHaveLength(1);
        const rejectedRow = screen.getByText('Application not successful').parentElement;
        expect(rejectedRow).toHaveTextContent('Superseded');
    });

    it('renders nothing rather than a broken shell when history is empty', () => {
        const { container } = render(<ApplicationTimeline history={[]} currentStatus="PENDING" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('copes with a missing timestamp', () => {
        render(
            <ApplicationTimeline
                history={[{ id: 1, to_status: 'PENDING', created_at: null }]}
                currentStatus="PENDING"
            />
        );
        expect(screen.getByText(/Time not recorded/i)).toBeInTheDocument();
    });
});

describe('RichText', () => {
    it('renders authored markup as formatted HTML', () => {
        const { container } = render(
            <RichText html="<h3>Heading</h3><p>Body <strong>bold</strong></p>" />
        );
        expect(container.querySelector('h3')).toBeTruthy();
        expect(container.querySelector('strong')).toBeTruthy();
        expect(container.querySelector('.rich-prose')).toBeTruthy();
    });

    it('renders plain legacy text as text, not markup', () => {
        // Vacancies authored before the rich-text editor existed must render
        // exactly as written, with no paragraph spacing injected.
        const { container } = render(<RichText html="Simple plain description" />);
        expect(container.querySelector('p')?.textContent).toBe('Simple plain description');
        expect(container.querySelector('.rich-prose')).toBeFalsy();
    });

    it('shows a placeholder when there is no content', () => {
        render(<RichText html="" />);
        expect(screen.getByText('No content provided.')).toBeInTheDocument();
    });
});

describe('richTextToPlainText', () => {
    it('measures visible words rather than markup', () => {
        // A short description written with markup measures 37 characters raw but
        // only 8 visible, so a "Read more" control keyed off the raw length
        // would appear for content that fits in three lines.
        const raw = '<p><strong>Short</strong> role</p>';
        expect(raw.length).toBeGreaterThan(30);
        expect(richTextToPlainText(raw)).toBe('Short role');
    });

    it('separates list items instead of joining them', () => {
        expect(richTextToPlainText('<ul><li>Alpha</li><li>Beta</li></ul>')).toBe('Alpha Beta');
    });

    it('handles empty and non-string input', () => {
        expect(richTextToPlainText('')).toBe('');
        expect(richTextToPlainText(null)).toBe('');
        expect(richTextToPlainText(undefined)).toBe('');
    });
});
