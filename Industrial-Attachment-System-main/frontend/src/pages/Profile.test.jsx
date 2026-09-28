import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        patch: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

// Step 2 refuses a start date that has already passed, so a hard-coded
// fixture would silently start failing as the calendar moves past it.
// Relative to today, this stays a valid future date indefinitely.
const FUTURE_JOINING_DATE = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('-');
})();

const PAST_JOINING_DATE = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('-');
})();

describe('Profile 4-Step Biodata Wizard Component', () => {
    const mockProfileData = {
        first_name: 'John',
        middle_name: 'Mwangi',
        last_name: 'Doe',
        email: 'john.doe@example.com',
        dob: '2000-01-15',
        gender: 'M',
        marital_status: 'SINGLE',
        id_number: '12345678',
        phone_number: '0712345678',
        postal_address: 'P.O. Box 100, Nairobi',
        nationality: 'Kenyan',
        county_of_residence: 'Nairobi',
        kra_pin: 'A001234567Z',
        institution_name: 'University of Nairobi',
        qualification: 'Degree',
        field_of_study: 'BSc Computer Science',
        joining_date: FUTURE_JOINING_DATE,
        next_of_kin_name: 'Mary Doe',
        next_of_kin_relationship: 'Mother',
        next_of_kin_phone: '0722334455',
        next_of_kin_address: 'P.O. Box 100, Nairobi',
    };
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('loads profile and documents, rendering Step 1 by default', async () => {
        api.get.mockImplementation((url) => {
            if (url === 'accounts/profile/') return Promise.resolve({ data: mockProfileData });
            if (url === 'accounts/documents/') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: {} });
        });

        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('John')).toBeInTheDocument();
            expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
            expect(screen.getByDisplayValue('john.doe@example.com')).toBeInTheDocument();
        });

        expect(screen.getByText(/personal identification/i)).toBeInTheDocument();
        expect(screen.getByText('Next: Academic Details')).toBeInTheDocument();
    });

    it('allows navigating between steps when fields are valid', async () => {
        api.get.mockImplementation((url) => {
            if (url === 'accounts/profile/') return Promise.resolve({ data: mockProfileData });
            if (url === 'accounts/documents/') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: {} });
        });
        api.patch.mockResolvedValue({ data: mockProfileData });

        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('John')).toBeInTheDocument();
        });

        // Click next button to go from Step 1 to Step 2
        const nextButton = screen.getByRole('button', { name: /next: academic details/i });
        fireEvent.click(nextButton);

        await waitFor(() => {
            expect(screen.getByDisplayValue('University of Nairobi')).toBeInTheDocument();
        });

        // Navigate to Step 3
        const step2NextButton = screen.getByRole('button', { name: /next: emergency contact/i });
        fireEvent.click(step2NextButton);

        await waitFor(() => {
            expect(screen.getByDisplayValue('Mary Doe')).toBeInTheDocument();
        });

        // Navigate back to Step 2 using Back button
        const prevButton = screen.getByRole('button', { name: /back: academic details/i });
        fireEvent.click(prevButton);

        await waitFor(() => {
            expect(screen.getByDisplayValue('University of Nairobi')).toBeInTheDocument();
        });
    });

    it('disables next button or prevents navigation when required fields are empty', async () => {
        api.get.mockImplementation((url) => {
            if (url === 'accounts/profile/') return Promise.resolve({ data: { ...mockProfileData, first_name: '' } });
            if (url === 'accounts/documents/') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: {} });
        });

        render(
            <MemoryRouter>
                <Profile />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
        });

        const nextButton = screen.getByRole('button', { name: /next: academic details/i });
        expect(nextButton).toBeDisabled();
    });

    describe('Academic Standing / Grade Award removal', () => {
        const mockApi = () => {
            api.get.mockImplementation((url) => {
                if (url === 'accounts/profile/') return Promise.resolve({ data: mockProfileData });
                if (url === 'accounts/documents/') return Promise.resolve({ data: [] });
                            const TWO_MB = 2 * 1024 * 1024;
                            if (url === 'accounts/document-limits/') {
                                return Promise.resolve({
                                    data: {
                                        limits: {
                                            NATIONAL_ID: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            RESUME: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            COVER_LETTER: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            INSTITUTION_INTRO: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            STUDENT_INSURANCE: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            STUDENT_ID: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            TRANSCRIPT: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            GOOD_CONDUCT: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            PASSPORT_PHOTOS: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                            NEXT_OF_KIN_ID: { max_bytes: TWO_MB, label: 'Max 2MB' },
                                        },
                                    },
                                });
                            }
                return Promise.resolve({ data: {} });
            });
            // Every forward step change saves the draft first, so PATCH has to
            // resolve. Left unstubbed it returns undefined and saveDraft throws
            // on `res.data`, which blanks the page mid-assertion.
            api.patch.mockResolvedValue({ data: mockProfileData });
        };

        const gotoStep2 = async () => {
            await waitFor(() => {
                expect(screen.getByDisplayValue('John')).toBeInTheDocument();
            });
            fireEvent.click(screen.getByRole('button', { name: /next: academic details/i }));
            await waitFor(() => {
                expect(screen.getByDisplayValue('University of Nairobi')).toBeInTheDocument();
            });
        };

        it('does not render the removed field anywhere in Step 2', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            await gotoStep2();

            expect(screen.queryByText(/Academic Standing/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/Grade Award/i)).not.toBeInTheDocument();
            expect(
                document.querySelector('input[name="grade_award"]')
            ).toBeNull();
            // The fields that legitimately remain in Step 2 are still there.
            expect(screen.getByDisplayValue('BSc Computer Science')).toBeInTheDocument();
            expect(screen.getByDisplayValue(FUTURE_JOINING_DATE)).toBeInTheDocument();
        });

        it('alerts the applicant when a backdated start date is entered', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            await gotoStep2();

            const startDateInput = document.querySelector(
                'input[name="joining_date"]'
            );
            fireEvent.change(startDateInput, { target: { value: PAST_JOINING_DATE } });

            // Announced to assistive tech, not just shown in red.
            const alert = await screen.findByRole('alert');
            expect(alert).toHaveTextContent(/cannot be in the past/i);
            expect(startDateInput).toHaveAttribute('aria-invalid', 'true');
        });

        it('blocks the wizard from advancing past a backdated start date', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            await gotoStep2();

            fireEvent.change(document.querySelector('input[name="joining_date"]'), {
                target: { value: PAST_JOINING_DATE },
            });
            fireEvent.click(
                screen.getByRole('button', { name: /next: emergency contact/i })
            );

            // Still on Step 2, with the reason stated rather than silently ignored.
            expect(screen.getByDisplayValue('University of Nairobi')).toBeInTheDocument();
            expect(await screen.findByText(/Intended attachment start date cannot be in the past/i))
                .toBeInTheDocument();
        });

        it('shows each document label with its own server-supplied size limit', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            await waitFor(() => {
                expect(screen.getByDisplayValue('John')).toBeInTheDocument();
            });

            // Advance to Step 4 (Verification Documents).
            fireEvent.click(screen.getByRole('button', { name: /next: academic details/i }));
            await waitFor(() => {
                expect(screen.getByDisplayValue('University of Nairobi')).toBeInTheDocument();
            });
            fireEvent.click(screen.getByRole('button', { name: /next: emergency contact/i }));
            await waitFor(() => {
                expect(screen.getByDisplayValue('Mary Doe')).toBeInTheDocument();
            });
            // Step 4 is reached via the stepper tab rather than a "Next" button
            // (Step 3's next action submits the application directly). The tab is
            // labelled "Step 4 / Documents (10)".
            fireEvent.click(screen.getByRole('button', { name: /Documents \(10\)/i }));

            await waitFor(() => {
                expect(screen.getByText('Copy of National ID Card')).toBeInTheDocument();
            });

            // Every document shares one ceiling, so each of the ten rows
            // carries the same server-supplied size rather than one of
            // several. Rendered per document, not once globally.
            const twoMb = screen.getAllByText('(Max 2MB)');
            expect(twoMb.length).toBe(10);

            // The label sits inside the relevant heading, confirming the size is
            // per-type rather than global.
            expect(
                screen.getByText('Copy of National ID Card').closest('h4').textContent
            ).toContain('(Max 2MB)');
            expect(
                screen.getByText(/Curriculum Vitae/).closest('h4').textContent
            ).toContain('(Max 2MB)');
        });

        it('offers Transcripts and Certificate of Good Conduct at 2MB each', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            await waitFor(() => {
                expect(screen.getByDisplayValue('John')).toBeInTheDocument();
            });
            fireEvent.click(screen.getByRole('button', { name: /Documents \(10\)/i }));

            await waitFor(() => {
                expect(screen.getByText('Transcripts')).toBeInTheDocument();
            });

            // Both new documents are present, each labelled with its own 2MB cap.
            const transcript = screen.getByText('Transcripts').closest('h4');
            expect(transcript.textContent).toContain('(Max 2MB)');

            const conduct = screen.getByText('Certificate of Good Conduct').closest('h4');
            expect(conduct.textContent).toContain('(Max 2MB)');

            // KRA PIN Certificate is gone from the upload list entirely.
            expect(screen.queryByText(/KRA PIN Certificate/i)).not.toBeInTheDocument();
        });

        it('retains the Step 1 KRA PIN Number biodata field', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            // The KRA PIN *document* upload was replaced, but the Step 1 biodata
            // number is a separate field and was deliberately kept.
            await waitFor(() => {
                expect(screen.getByDisplayValue('A001234567Z')).toBeInTheDocument();
            });
            expect(screen.getByText('KRA PIN Number')).toBeInTheDocument();
        });

        it('requires ten documents, not nine', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            await waitFor(() => {
                expect(screen.getByDisplayValue('John')).toBeInTheDocument();
            });
            fireEvent.click(screen.getByRole('button', { name: /Documents \(10\)/i }));

            await waitFor(() => {
                expect(screen.getByText('Copy of National ID Card')).toBeInTheDocument();
            });
            // The heading states the total, and the counter tracks ten.
            expect(
                screen.getByText(/Mandatory Verification Documents \(10 Documents\)/i)
            ).toBeInTheDocument();
            expect(screen.getByText(/0 of 10 Uploaded/i)).toBeInTheDocument();
        });

        it('requests the limits from the API rather than hardcoding them', async () => {
            mockApi();
            render(
                <MemoryRouter>
                    <Profile />
                </MemoryRouter>
            );
            await waitFor(() => {
                expect(api.get).toHaveBeenCalledWith('accounts/document-limits/');
            });
        });
    });
});
