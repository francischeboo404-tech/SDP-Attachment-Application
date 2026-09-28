import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DepartmentReports from './DepartmentReports';
import DepartmentArchives from './DepartmentArchives';
import useAuthStore from '../store/authStore';
import api from '../services/api';

vi.mock('../services/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../utils/downloadUtils', () => ({
    exportToCSV: vi.fn(),
    printTable: vi.fn(),
}));

const DIRECTOR = {
    id: 1,
    username: 'dir_x',
    first_name: 'Xavier',
    last_name: 'Director',
    role: 'DEPARTMENT_DIRECTOR',
    department: 10,
};

function authAs(user) {
    useAuthStore.getState().setAuth(user, 'token', 'refresh');
}

const analyticsPayload = {
    role: 'DEPARTMENT_DIRECTOR',
    department_info: { id: 10, name: 'Directorate X' },
    total_slots_required: 3,
    total_slots_filled: 1,
    available_headroom: 2,
    fill_rate: 33.3,
    total_applications: 2,
    average_ats_score: 88.5,
    statistical_quality_metrics: { mean: 88.5 },
    active_attachees_count: 1,
    exited_attachees_count: 0,
    pending_stage1_clearances: 1,
    approved_stage1_clearances: 0,
    stage1_velocity_rate: 0,
    requisitions_summary: { total: 1, pending: 1, approved: 0, fulfilled: 0, rejected: 0, candidates_requested: 2 },
};

const attacheesPayload = {
    attachees: [
        {
            application_id: 1,
            applicant_name: 'Xavierina AttacheeX',
            applicant_email: 'attachee_x@uni.ac.ke',
            department_name: 'Directorate X',
            job_title: 'X Geologist Attachee',
            application_date: '2026-01-05',
            ats_score: 88.5,
            clearance_status: 'PENDING_DEPARTMENT',
            department_cleared: false,
            hr_cleared: false,
            hr_cleared_by: null,
            hr_cleared_at: null,
        },
    ],
    total_count: 1,
};

const vacanciesPayload = {
    vacancies: [
        {
            job_id: 1, title: 'X Geologist Attachee', department_name: 'Directorate X',
            job_type: 'ATTACHMENT', slots_required: 3, slots_filled: 1, fill_rate: 33.3,
            is_full: false, is_archived: false, deadline: '2026-09-30',
        },
    ],
    total_count: 1,
};

function mockReportEndpoints() {
    api.get.mockImplementation((url) => {
        if (url.startsWith('jobs/reports/analytics/')) {
            return Promise.resolve({ data: analyticsPayload });
        }
        if (url.startsWith('jobs/reports/attachees/')) {
            return Promise.resolve({ data: attacheesPayload });
        }
        if (url.startsWith('jobs/reports/fill-rates/')) {
            return Promise.resolve({ data: vacanciesPayload });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
}

describe('DepartmentReports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().logout();
    });

    it('denies access to non-director roles', () => {
        authAs({ id: 5, username: 'hr', role: 'HR' });
        render(<DepartmentReports />);
        expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalled();
    });

    it('calls the shared report endpoints without ever sending a department', async () => {
        authAs(DIRECTOR);
        mockReportEndpoints();

        render(<DepartmentReports />);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('jobs/reports/analytics/');
            expect(api.get).toHaveBeenCalledWith('jobs/reports/attachees/');
            expect(api.get).toHaveBeenCalledWith('jobs/reports/fill-rates/');
        });

        const requestedUrls = api.get.mock.calls.map(([url]) => url);
        requestedUrls.forEach((url) => {
            expect(url).not.toMatch(/[?&]department=/);
        });
    });

    it('renders only the signed-in director’s department metrics', async () => {
        authAs(DIRECTOR);
        mockReportEndpoints();

        render(<DepartmentReports />);

        await waitFor(() => {
            expect(screen.getByText('Xavierina AttacheeX')).toBeInTheDocument();
        });

        expect(screen.getByText(/Directorate X attachment metrics/i)).toBeInTheDocument();
        expect(screen.getByText('X Geologist Attachee')).toBeInTheDocument();
        expect(screen.queryByText(/Directorate Y/)).not.toBeInTheDocument();
    });

    it('sends clearance/date filters to the shared endpoint, still without a department', async () => {
        authAs(DIRECTOR);
        mockReportEndpoints();

        render(<DepartmentReports />);
        await waitFor(() => expect(api.get).toHaveBeenCalledWith('jobs/reports/attachees/'));

        fireEvent.change(screen.getByLabelText(/Clearance Status/i), {
            target: { value: 'CLEARED' },
        });

        await waitFor(() => {
            const attacheesCalls = api.get.mock.calls
                .map(([url]) => url)
                .filter((url) => url.startsWith('jobs/reports/attachees/'));
            expect(attacheesCalls[attacheesCalls.length - 1]).toContain('status=CLEARED');
            attacheesCalls.forEach((url) => expect(url).not.toMatch(/[?&]department=/));
        });
    });

    it('surfaces a 403 message rather than silently showing another department', async () => {
        authAs(DIRECTOR);
        api.get.mockRejectedValue({
            response: { data: { detail: 'You can only request data for your own assigned department.' } },
        });

        render(<DepartmentReports />);

        await waitFor(() => {
            expect(
                screen.getByText('You can only request data for your own assigned department.')
            ).toBeInTheDocument();
        });
    });
});

describe('DepartmentArchives', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().logout();
    });

    it('denies access to non-director roles', () => {
        authAs({ id: 5, username: 'hr', role: 'HR' });
        render(<DepartmentArchives />);
        expect(screen.getByText(/Access Denied/i)).toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalled();
    });

    it('never sends a department filter and offers only department-scoped types', async () => {
        authAs(DIRECTOR);
        api.get.mockResolvedValue({
            data: {
                counts: { total: 1, vacancies: 1, applications: 0, departments: 0 },
                results: [
                    {
                        id: 1, entity_type: 'VACANCY', title: 'X Archived Vacancy',
                        department_id: 10, department_name: 'Directorate X', slots: 1,
                        archived_at: '2026-02-01T00:00:00Z', archived_by: 'admin',
                        details: 'Attachment Vacancy (1 slots, 12 weeks)',
                    },
                ],
                department: { id: 10, name: 'Directorate X' },
                read_only: true,
            },
        });

        render(<DepartmentArchives />);

        await waitFor(() => {
            expect(screen.getByText('X Archived Vacancy')).toBeInTheDocument();
        });

        const archiveCalls = api.get.mock.calls.map(([url]) => url);
        archiveCalls.forEach((url) => expect(url).not.toMatch(/[?&]department=/));

        // Archived department profiles stay an institutional record, so
        // DEPARTMENT is absent. Completed attachees are department-scoped, so
        // ATTACHMENT is offered alongside vacancies and applications.
        const typeSelect = screen.getByLabelText(/Filter By Entity Type/i);
        const optionValues = Array.from(typeSelect.options).map((o) => o.value);
        expect(optionValues).toEqual(['ALL', 'VACANCY', 'APPLICATION', 'ATTACHMENT']);
    });

    it('is read-only: no restore or purge controls are rendered', async () => {
        authAs(DIRECTOR);
        api.get.mockResolvedValue({
            data: {
                counts: { total: 1, vacancies: 1, applications: 0, departments: 0 },
                results: [
                    {
                        id: 1, entity_type: 'VACANCY', title: 'X Archived Vacancy',
                        department_id: 10, department_name: 'Directorate X', slots: 1,
                        archived_at: '2026-02-01T00:00:00Z', archived_by: 'admin',
                        details: 'Attachment Vacancy (1 slots, 12 weeks)',
                    },
                ],
                department: { id: 10, name: 'Directorate X' },
                read_only: true,
            },
        });

        render(<DepartmentArchives />);

        await waitFor(() => {
            expect(screen.getByText('X Archived Vacancy')).toBeInTheDocument();
        });

        expect(screen.queryByText('Restore')).not.toBeInTheDocument();
        expect(screen.queryByText('Purge')).not.toBeInTheDocument();

        // The row action is Details only; the modal still offers no mutation.
        fireEvent.click(screen.getByText('Details'));
        await waitFor(() => {
            expect(
                screen.getByText('Restoring this record requires HR or Admin privileges.')
            ).toBeInTheDocument();
        });
        expect(screen.queryByText('Restore')).not.toBeInTheDocument();
        expect(screen.queryByText('Purge')).not.toBeInTheDocument();
    });
});
