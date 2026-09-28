import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import ManageJobs from './ManageJobs';
import useAuthStore from '../store/authStore';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        patch: vi.fn(),
    },
}));

vi.mock('../components/PageGuideHeader', () => ({
    default: () => <div data-testid="guide-header" />,
}));

import api from '../services/api';

const APPLICANT_APPLICATION = {
    id: 7,
    job_title: 'Geology Attachee',
    applicant_name: 'Amina Attachee',
    status: 'PENDING',
    user: 3,
    status_history: [
        { id: 1, from_status: '', to_status: 'PENDING', note: 'Application submitted', created_at: '2026-05-01T09:00:00Z' },
    ],
    attached_documents: [],
    cover_letter: '',
};

function renderAsHR() {
    useAuthStore.setState({ user: { role: 'HR', username: 'hr' } });
    return render(<MemoryRouter><ManageJobs /></MemoryRouter>);
}

describe('ManageJobs decision alerts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.get.mockResolvedValue({ data: { results: [APPLICANT_APPLICATION], next: null } });
        api.patch.mockResolvedValue({ data: { ...APPLICANT_APPLICATION, status: 'SUCCESSFUL' } });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Opening a PENDING dossier legitimately writes a REVIEWED marker, so
    // decision assertions filter for the decision payload rather than counting
    // every PATCH on the page.
    const decisionCalls = () =>
        api.patch.mock.calls.filter(([, body]) => body && body.status !== 'REVIEWED');

    async function openDossier() {
        // The row is opened by its explicit review action; the title cell is not
        // itself clickable. The button is labelled "Review Applications" -- the
        // modal it opens is the review dossier, but the user-facing label is the
        // shorter one.
        const button = await screen.findByRole('button', { name: /Review Applications/i });
        await act(async () => { fireEvent.click(button); });
        return button;
    }

    it('asks for confirmation before recording a decision', async () => {
        renderAsHR();
        await openDossier();

        fireEvent.click(screen.getByText(/Mark as Successful/i));

        // The dialog must appear...
        const dialog = await screen.findByTestId('confirm-dialog');
        expect(dialog).toBeInTheDocument();
        // ...and no decision may be written to the server until it is confirmed.
        expect(decisionCalls()).toHaveLength(0);
    });

    it('states who the decision affects and that the applicant is notified', async () => {
        renderAsHR();
        await openDossier();

        fireEvent.click(screen.getByText(/Mark as Rejected/i));

        const dialog = await screen.findByTestId('confirm-dialog');
        // Names the applicant and the vacancy, so the officer can see exactly
        // which record they are about to decide.
        expect(dialog).toHaveTextContent('Amina Attachee');
        expect(dialog).toHaveTextContent('Geology Attachee');
        expect(dialog).toHaveTextContent(/notif/i);
    });

    it('writes the decision only after confirmation', async () => {
        renderAsHR();
        await openDossier();

        fireEvent.click(screen.getByText(/Mark as Successful/i));
        const dialog = await screen.findByTestId('confirm-dialog');
        fireEvent.click(screen.getByRole('button', { name: /Yes, mark successful/i }));

        await waitFor(() => expect(decisionCalls()).toHaveLength(1));
        expect(decisionCalls()[0]).toEqual([
            'jobs/applications/7/status/',
            { status: 'SUCCESSFUL' },
        ]);
    });

    it('cancelling records nothing', async () => {
        renderAsHR();
        await openDossier();

        fireEvent.click(screen.getByText(/Mark as Rejected/i));
        const dialog = await screen.findByTestId('confirm-dialog');
        fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

        await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument());
        expect(decisionCalls()).toHaveLength(0);
    });

    it('acknowledges a successful decision and re-reads the list', async () => {
        renderAsHR();
        await openDossier();

        fireEvent.click(screen.getByText(/Mark as Successful/i));
        fireEvent.click(await screen.findByRole('button', { name: /Yes, mark successful/i }));

        const toast = await screen.findByTestId('status-toast');
        await waitFor(() => expect(toast).toHaveTextContent(/marked successful/i));
        // The list is re-fetched so the shown state is the server's, not an
        // optimistic guess that could disagree with what was stored.
        await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(1));
    });

    it('reports a failure instead of silently doing nothing', async () => {
        api.patch.mockRejectedValue({ response: { data: { detail: 'Not permitted.' } } });
        renderAsHR();
        await openDossier();

        fireEvent.click(screen.getByText(/Mark as Successful/i));
        fireEvent.click(await screen.findByRole('button', { name: /Yes, mark successful/i }));

        const toast = await screen.findByTestId('status-toast');
        await waitFor(() => expect(toast).toHaveTextContent(/Not permitted/i));
        // The dialog must close so the officer is not left with a stuck prompt.
        await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument());
    });

    it('does not offer decision controls to a read-only Admin', async () => {
        useAuthStore.setState({ user: { role: 'ADMIN', username: 'admin' } });
        render(<MemoryRouter><ManageJobs /></MemoryRouter>);

        await screen.findByText('Geology Attachee');
        expect(screen.queryByText(/Mark as Successful/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Mark as Rejected/i)).not.toBeInTheDocument();
    });
});
