import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

// DepartmentsHub imports the other tab panels; they pull in heavy dependencies
// that are irrelevant to the staffing figures under test here.
vi.mock('./Departments', () => ({ default: () => <div /> }));
vi.mock('./RequisitionQueue', () => ({ default: () => <div /> }));

// The staffing tab is not exported directly, so drive it through the hub, which
// is how the page actually renders it.
const { default: DepartmentsHub } = await import('./DepartmentsHub');

const ADMIN = { id: 1, username: 'admin', role: 'ADMIN' };

// Field names mirror backend/jobs/staffing.py so the fixture cannot drift into
// agreeing with a wrong shape.
const staffingPayload = {
    summary: {
        departments: 1,
        open_vacancies: 1,
        total_capacity: 3,
        total_filled: 1,
        fill_rate: 33.3,
        total_headroom: 2,
        active_deployments: 1,
        completed_deployments: 0,
        pending_requisitions: 0,
        approved_requisitions: 1,
        departments_with_open_vacancies: 1,
    },
    departments: [
        {
            department_id: 10,
            department_name: 'Directorate X',
            director_name: 'Xavier Director',
            open_vacancies: 1,
            capacity: 3,
            filled: 1,
            pending_requisitions: 0,
            approved_requisitions: 1,
            active_deployments: 1,
            completed_deployments: 0,
            fill_rate: 33.3,
            headroom: 2,
        },
    ],
};

describe('DepartmentsHub staffing tab', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().setAuth(ADMIN, 'token', 'refresh');
    });

    async function openStaffingTab() {
        // The hub reads the active tab from the URL, so it needs a Router.
        render(
            <MemoryRouter>
                <DepartmentsHub />
            </MemoryRouter>
        );
        const tab = await screen.findByRole('tab', { name: /Staffing/i });
        fireEvent.click(tab);
    }

    it('reads staffing figures from the server endpoint', async () => {
        api.get.mockResolvedValue({ data: staffingPayload });

        await openStaffingTab();

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('jobs/staffing/');
        });
        await waitFor(() => {
            expect(screen.getByText('Directorate X')).toBeInTheDocument();
        });
    });

    // Regression: the tab rendered an empty table when the request failed, which
    // reads as "no departments have staff" rather than "the request failed".
    it('surfaces a failure instead of an empty staffing table', async () => {
        api.get.mockRejectedValue({ response: { data: { detail: 'Staffing service unavailable.' } } });

        await openStaffingTab();

        await waitFor(() => {
            expect(screen.getByText('Staffing service unavailable.')).toBeInTheDocument();
        });
        expect(screen.queryByText('Directorate X')).not.toBeInTheDocument();
    });

    it('offers a retry when staffing cannot be loaded', async () => {
        api.get.mockRejectedValue({ response: { data: { detail: 'Staffing service unavailable.' } } });

        await openStaffingTab();

        await waitFor(() => expect(screen.getByText(/Try again/i)).toBeInTheDocument());
    });
});
