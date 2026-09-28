import { describe, it, expect } from 'vitest';
import { getDerivedStatus, getDerivedStatusBadgeClass, DECISION_STATUSES, PENDING_STATUSES, APPLICATION_STATUSES } from './statusUtils';

describe('statusUtils - getDerivedStatus', () => {
    it('returns authoritative displayStatus when provided by backend', () => {
        const result = getDerivedStatus({
            applicationStatus: 'SUCCESSFUL',
            deploymentStatus: 'DEPLOYED',
            clearanceStatus: 'CLEARED',
            displayStatus: 'Special Overridden Status',
        });
        expect(result).toBe('Special Overridden Status');
    });

    it('returns "Industrial Attachment Trainee" when deploymentStatus is DEPLOYED', () => {
        const result = getDerivedStatus({
            applicationStatus: 'SUCCESSFUL',
            deploymentStatus: 'DEPLOYED',
            clearanceStatus: null,
        });
        expect(result).toBe('Industrial Attachment Trainee');
    });

    it('returns "Attachment Completed — Cleared" when EXITED and CLEARED', () => {
        const result = getDerivedStatus({
            applicationStatus: 'SUCCESSFUL',
            deploymentStatus: 'EXITED',
            clearanceStatus: 'CLEARED',
        });
        expect(result).toBe('Attachment Completed — Cleared');
    });

    it('returns "Attachment Completed — Clearance in Progress" when EXITED and clearance pending or null', () => {
        const result = getDerivedStatus({
            applicationStatus: 'SUCCESSFUL',
            deploymentStatus: 'EXITED',
            clearanceStatus: 'PENDING_DEPARTMENT',
        });
        expect(result).toBe('Attachment Completed — Clearance in Progress');
    });

    it('returns "Successful — Awaiting Deployment" when applicationStatus is SUCCESSFUL and not deployed', () => {
        const result = getDerivedStatus({
            applicationStatus: 'SUCCESSFUL',
            deploymentStatus: 'PENDING_DEPLOYMENT',
            clearanceStatus: null,
        });
        expect(result).toBe('Successful — Awaiting Deployment');
    });

    it('maps applicationStatus correctly for standard candidate stages', () => {
        expect(getDerivedStatus({ applicationStatus: 'PENDING' })).toBe('Pending Review');
        expect(getDerivedStatus({ applicationStatus: 'REVIEWED' })).toBe('Reviewed');
        expect(getDerivedStatus({ applicationStatus: 'SUCCESSFUL' })).toBe('Successful — Awaiting Deployment');
        expect(getDerivedStatus({ applicationStatus: 'REJECTED' })).toBe('Rejected');
        expect(getDerivedStatus({ applicationStatus: 'WITHDRAWN' })).toBe('Withdrawn');
    });

    it('formats unmapped statuses by replacing underscores with spaces or defaults to Pending Review', () => {
        expect(getDerivedStatus({ applicationStatus: 'CUSTOM_STATUS_TEST' })).toBe('CUSTOM STATUS TEST');
        expect(getDerivedStatus({})).toBe('Pending Review');
    });
});

describe('statusUtils - status vocabulary', () => {
    it('offers exactly two decisions', () => {
        // The point of the binary model: there is no intermediate
        // shortlisting outcome that a consumer has to treat as a success.
        expect(DECISION_STATUSES).toEqual(['SUCCESSFUL', 'REJECTED']);
    });

    it('treats PENDING and REVIEWED as markers rather than decisions', () => {
        // Both describe progress towards a decision, so neither may be
        // offered as an outcome in a decision control.
        expect(PENDING_STATUSES).toEqual(['PENDING', 'REVIEWED']);
        for (const marker of PENDING_STATUSES) {
            expect(DECISION_STATUSES).not.toContain(marker);
        }
    });

    it('no longer exposes the retired intermediate statuses', () => {
        const vocabulary = Object.keys(APPLICATION_STATUSES);
        expect(vocabulary).not.toContain('SHORTLISTED');
        expect(vocabulary).not.toContain('HIRED');
        expect(vocabulary.sort()).toEqual(
            ['PENDING', 'REJECTED', 'REVIEWED', 'SUCCESSFUL'].sort()
        );
    });
});

describe('statusUtils - getDerivedStatusBadgeClass', () => {
    it('returns default fallback class when derivedStatus is null or empty', () => {
        expect(getDerivedStatusBadgeClass(null)).toContain('bg-slate-100');
        expect(getDerivedStatusBadgeClass('')).toContain('bg-slate-100');
    });

    it('returns appropriate styling for Trainee status', () => {
        const cls = getDerivedStatusBadgeClass('Industrial Attachment Trainee');
        expect(cls).toContain('bg-amber-50');
        expect(cls).toContain('text-amber-900');
    });

    it('returns emerald styling for Cleared status', () => {
        const cls = getDerivedStatusBadgeClass('Attachment Completed — Cleared');
        expect(cls).toContain('bg-emerald-50');
        expect(cls).toContain('text-emerald-800');
    });

    it('returns blue styling for Clearance in Progress and teal for a successful outcome', () => {
        expect(getDerivedStatusBadgeClass('Attachment Completed — Clearance in Progress')).toContain('bg-blue-50');
        expect(getDerivedStatusBadgeClass('Successful — Awaiting Deployment')).toContain('bg-teal-50');
    });

    it('returns teal styling for Awaiting Deployment', () => {
        expect(getDerivedStatusBadgeClass('Awaiting Deployment')).toContain('bg-teal-50');
    });

    it('returns purple styling for Reviewed', () => {
        expect(getDerivedStatusBadgeClass('Reviewed')).toContain('bg-purple-50');
    });

    it('returns rose styling for Rejected', () => {
        expect(getDerivedStatusBadgeClass('Rejected')).toContain('bg-rose-50');
    });
});
