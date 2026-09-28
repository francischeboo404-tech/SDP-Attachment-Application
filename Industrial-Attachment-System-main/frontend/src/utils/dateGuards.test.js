import { describe, it, expect } from 'vitest';
import { isBackdated, minStartDate, startDateError, todayISO } from './dateGuards';

/** Local `YYYY-MM-DD`, matching how a date input reports its value. */
function localISO(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('-');
}

describe('dateGuards', () => {
    describe('todayISO', () => {
        it('uses the local calendar day, not the UTC one', () => {
            // Built from local getters, so this fails anywhere the helper
            // would wrongly reach for toISOString() and slip a day.
            expect(todayISO()).toBe(localISO(0));
        });
    });

    describe('minStartDate', () => {
        it('bounds the picker at today', () => {
            expect(minStartDate()).toBe(localISO(0));
        });
    });

    describe('isBackdated', () => {
        it('accepts today', () => {
            expect(isBackdated(localISO(0))).toBe(false);
        });

        it('accepts a future date', () => {
            expect(isBackdated(localISO(30))).toBe(false);
        });

        it('rejects a past date', () => {
            expect(isBackdated(localISO(-5))).toBe(true);
        });

        it('treats an empty value as missing rather than backdated', () => {
            // The required-field validation owns that message. Reporting a
            // blank required date as "in the past" would be simply wrong.
            expect(isBackdated('')).toBe(false);
            expect(isBackdated(null)).toBe(false);
            expect(isBackdated(undefined)).toBe(false);
        });

        it('does not call an unparseable value backdated', () => {
            expect(isBackdated('not a date')).toBe(false);
            expect(isBackdated('13/45/2020')).toBe(false);
        });

        it('reads the date portion of a full timestamp', () => {
            expect(isBackdated(`${localISO(-3)}T09:30:00Z`)).toBe(true);
            expect(isBackdated(`${localISO(3)}T09:30:00Z`)).toBe(false);
        });
    });

    describe('startDateError', () => {
        it('returns null for an acceptable value', () => {
            expect(startDateError('')).toBeNull();
            expect(startDateError(localISO(0))).toBeNull();
            expect(startDateError(localISO(45))).toBeNull();
        });

        it('names the field it was given', () => {
            const message = startDateError(localISO(-5), 'Requisition start date');
            expect(message).toContain('Requisition start date');
        });

        it('falls back to a generic label when the caller supplies none', () => {
            expect(startDateError(localISO(-5))).toMatch(/start date/i);
        });

        it('tells the user what to do about it', () => {
            const message = startDateError(localISO(-5));
            expect(message).toMatch(/cannot be in the past/i);
            expect(message).toMatch(/today or a future date/i);
        });
    });
});
