import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import RequisitionQueue from './RequisitionQueue';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('../components/PageGuideHeader', () => ({
    default: ({ actions }) => <div data-testid="guide-header">{actions}</div>,
}));

const HR = { id: 2, username: 'hr', role: 'HR' };

describe('RequisitionQueue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().setAuth(HR, 'token', 'refresh');
    });

    it('reports a clear queue only when the request actually succeeded', async () => {
        api.get.mockResolvedValue({ data: [] });

        render(<RequisitionQueue />);

        await waitFor(() => {
            expect(screen.getByText(/Queue is Clear/i)).toBeInTheDocument();
        });
    });

    // Regression: a failed request also yields an empty list, so the "Queue is
    // Clear" state used to render for network errors. That told HR nothing was
    // awaiting review when in fact nothing had been fetched -- the exact inverse
    // of the truth, on the screen that drives recruitment decisions.
    it('does not claim the queue is clear when the request failed', async () => {
        api.get.mockRejectedValue({ response: { data: { detail: 'Service unavailable.' } } });

        render(<RequisitionQueue />);

        await waitFor(() => {
            expect(screen.getByText('Service unavailable.')).toBeInTheDocument();
        });
        expect(screen.queryByText(/Queue is Clear/i)).not.toBeInTheDocument();
    });

    it('offers a retry when the request failed', async () => {
        api.get.mockRejectedValue({ response: { data: { detail: 'Service unavailable.' } } });

        render(<RequisitionQueue />);

        await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());
    });

    it('re-fetches on retry and recovers', async () => {
        api.get
            .mockRejectedValueOnce({ response: { data: { detail: 'Service unavailable.' } } })
            .mockResolvedValueOnce({ data: [] });

        render(<RequisitionQueue />);

        await waitFor(() => expect(screen.getByText('Try again')).toBeInTheDocument());
        screen.getByText('Try again').click();

        await waitFor(() => {
            expect(screen.getByText(/Queue is Clear/i)).toBeInTheDocument();
        });
    });
});
