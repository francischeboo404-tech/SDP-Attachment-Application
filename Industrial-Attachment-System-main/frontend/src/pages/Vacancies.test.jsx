import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Vacancies from './Vacancies';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

const APPLICANT = { id: 7, username: 'app', role: 'APPLICANT' };

function job(id) {
    return {
        id,
        title: `Geologist Attachee ${id}`,
        department: 10,
        department_name: 'Geology Directorate',
        description: '<p>Field mapping.</p>',
        requirements: 'BSc Geology',
        job_type: 'ATTACHMENT',
        location: 'Nairobi',
        slots_required: 2,
        duration_weeks: 12,
        slots_filled: 0,
        is_full: false,
        is_active: true,
        is_archived: false,
        deadline: '2099-01-01',
    };
}

function mockSuccess(ids = [1, 2]) {
    api.get.mockImplementation((url) => {
        if (url.startsWith('jobs/vacancies')) {
            return Promise.resolve({ data: { results: ids.map(job), next: null } });
        }
        if (url.startsWith('jobs/departments')) {
            return Promise.resolve({ data: { results: [{ id: 10, name: 'Geology Directorate' }] } });
        }
        if (url.startsWith('jobs/applications')) {
            return Promise.resolve({ data: { results: [], next: null } });
        }
        return Promise.resolve({ data: {} });
    });
}

describe('Vacancies page for an applicant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().setAuth(APPLICANT, 'token', 'refresh');
    });

    it('lists vacancies for an applicant', async () => {
        mockSuccess();
        render(<MemoryRouter><Vacancies /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument();
        });
        expect(screen.getByText('Geologist Attachee 2')).toBeInTheDocument();
    });

    // The defect this guards against: the catch handler cleared the list and the
    // page rendered "No vacancies found", so a 403 (or any outage) was reported
    // to an applicant as "the ministry has no openings".
    it('reports a failed request instead of claiming there are no vacancies', async () => {
        api.get.mockImplementation((url) => {
            if (url.startsWith('jobs/vacancies')) {
                return Promise.reject({ response: { status: 403, data: { detail: 'Permission denied.' } } });
            }
            if (url.startsWith('jobs/departments')) {
                return Promise.resolve({ data: { results: [] } });
            }
            return Promise.resolve({ data: { results: [], next: null } });
        });

        render(<MemoryRouter><Vacancies /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText(/Unable to load vacancies/i)).toBeInTheDocument();
        });
        expect(screen.queryByText(/No vacancies found/i)).not.toBeInTheDocument();
    });

    it('offers a retry when the request failed', async () => {
        api.get.mockImplementation((url) => {
            if (url.startsWith('jobs/vacancies')) {
                return Promise.reject({ response: { status: 500, data: { detail: 'Server error.' } } });
            }
            if (url.startsWith('jobs/departments')) {
                return Promise.resolve({ data: { results: [] } });
            }
            return Promise.resolve({ data: { results: [], next: null } });
        });

        render(<MemoryRouter><Vacancies /></MemoryRouter>);

        await waitFor(() => expect(screen.getByText(/Try again/i)).toBeInTheDocument());
    });

    it('keeps already-loaded vacancies visible when a later poll fails', async () => {
        let failNext = false;
        api.get.mockImplementation((url) => {
            if (url.startsWith('jobs/vacancies')) {
                if (failNext) return Promise.reject({ response: { status: 503, data: {} } });
                return Promise.resolve({ data: { results: [job(1)], next: null } });
            }
            if (url.startsWith('jobs/departments')) {
                return Promise.resolve({ data: { results: [] } });
            }
            return Promise.resolve({ data: { results: [], next: null } });
        });

        const { rerender } = render(<MemoryRouter><Vacancies /></MemoryRouter>);
        await waitFor(() => expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument());

        failNext = true;
        rerender(<MemoryRouter><Vacancies /></MemoryRouter>);

        // A transient failure must not wipe what the applicant was already shown.
        await waitFor(() => {
            expect(screen.getByText('Geologist Attachee 1')).toBeInTheDocument();
        });
    });
});
