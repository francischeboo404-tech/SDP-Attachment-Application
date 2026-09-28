/**
 * Tests for the completed-attachee archive record and the export/print cell
 * formatting that backs it.
 *
 * The requirement these protect: an attachee who finished their attachment is
 * listed in the archives with their full record, and every export column is
 * populated — a blank cell is indistinguishable from a column that failed to
 * export, which makes an official export unusable as a record.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Archives from './Archives';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import { exportToCSV, printTable } from '../utils/downloadUtils';
import {
    ARCHIVE_COLUMNS,
    archiveHeaders,
    archiveRows,
    formatArchiveCell,
    NOT_RECORDED,
} from '../utils/archiveUtils';

vi.mock('../services/api', () => ({
    default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('../utils/downloadUtils', () => ({
    exportToCSV: vi.fn(),
    printTable: vi.fn(),
}));

const ADMIN = { id: 1, username: 'admin_x', first_name: 'Ada', last_name: 'Admin', role: 'ADMIN' };

function authAs(user) {
    useAuthStore.getState().setAuth(user, 'token', 'refresh');
}

const attacheeRow = {
    id: 7,
    entity_type: 'ATTACHMENT',
    title: 'Grace Njeri - Geology Attachment',
    department_id: 10,
    department_name: 'Directorate X',
    slots: null,
    archived_at: '2024-03-15T09:30:00Z',
    archived_by: 'hr_x',
    details: 'Attachment Completed & Cleared — Geology Attachment (Directorate X, 12 weeks)',
    application_id: 7,
    attachee_name: 'Grace Njeri',
    username: 'grace_njeri',
    email: 'grace_njeri@uni.ac.ke',
    phone_number: '+254700000000',
    id_number: 'GRACE1234A',
    institution_name: 'University of Nairobi',
    qualification: 'BSc Geology',
    field_of_study: 'Geology',
    job_title: 'Geology Attachment',
    department_label: 'Directorate X',
    opportunity_type: 'Industrial Attachment',
    duration_weeks: 12,
    ats_score: '88.50',
    application_date: '2023-05-02',
    deployment_start_date: '2023-06-01',
    deployment_end_date: '2024-03-01',
    department_cleared_at: '2024-03-10 10:00',
    clearance_date: '2024-03-15 09:30',
    completion_date: '2024-03-15',
    completion_year: 2024,
    final_report_submitted: 'Yes',
    recommendation_letter: 'Yes',
    is_archived: true,
};

const vacancyRow = {
    id: 1,
    entity_type: 'VACANCY',
    title: 'X Archived Vacancy',
    department_id: 10,
    department_name: 'Directorate X',
    slots: 2,
    archived_at: '2024-01-05T00:00:00Z',
    archived_by: 'admin',
    details: 'Attachment Vacancy (2 slots, 12 weeks)',
};

function mockArchive() {
    api.get.mockResolvedValue({
        data: {
            counts: { total: 2, vacancies: 1, applications: 0, attachments: 1, departments: 0 },
            results: [vacancyRow, attacheeRow],
            department: null,
            read_only: false,
        },
    });
}

describe('formatArchiveCell', () => {
    it('never returns an empty string', () => {
        for (const value of [null, undefined, '', '   ']) {
            expect(formatArchiveCell(value)).toBe(NOT_RECORDED);
            expect(formatArchiveCell(value).length).toBeGreaterThan(0);
        }
    });

    it('renders booleans and numbers readably', () => {
        expect(formatArchiveCell(true)).toBe('Yes');
        expect(formatArchiveCell(false)).toBe('No');
        expect(formatArchiveCell(0)).toBe('0');
        expect(formatArchiveCell(12)).toBe('12');
    });

    it('formats bare ISO dates as a plain day', () => {
        expect(formatArchiveCell('2024-03-15')).toBe('15/03/2024');
    });

    it('formats ISO timestamps as day and time', () => {
        expect(formatArchiveCell('2024-03-15T09:30:00Z')).toMatch(/\d{2}\/\d{2}\/\d{4}/);
        expect(formatArchiveCell('2024-03-15T09:30:00Z')).toMatch(/\d{2}:\d{2}/);
    });

    it('leaves an unparseable string alone rather than blanking it', () => {
        expect(formatArchiveCell('Not Started')).toBe('Not Started');
    });
});

describe('archiveRows', () => {
    it('produces a cell for every column on every row', () => {
        const rows = archiveRows([vacancyRow, attacheeRow]);
        expect(rows).toHaveLength(2);
        for (const row of rows) {
            expect(row).toHaveLength(ARCHIVE_COLUMNS.length);
            row.forEach((cell) => expect(cell.trim()).not.toBe(''));
        }
    });

    it('fills a vacancy row even though it has no attachee fields', () => {
        const [row] = archiveRows([vacancyRow]);
        const institutionIndex = archiveHeaders().indexOf('Institution');
        expect(row[institutionIndex]).toBe(NOT_RECORDED);
    });

    it('carries the attachee record fields', () => {
        const [row] = archiveRows([attacheeRow]);
        const headers = archiveHeaders();
        expect(row[headers.indexOf('National ID')]).toBe('GRACE1234A');
        expect(row[headers.indexOf('Institution')]).toBe('University of Nairobi');
        expect(row[headers.indexOf('Qualification')]).toBe('BSc Geology');
        expect(row[headers.indexOf('Completion Date')]).toBe('15/03/2024');
        expect(row[headers.indexOf('Recommendation Letter')]).toBe('Yes');
    });

    it('tolerates a missing results array', () => {
        expect(archiveRows(undefined)).toEqual([]);
        expect(archiveRows(null)).toEqual([]);
    });
});

describe('System Archives — completed attachees', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useAuthStore.getState().logout();
    });

    it('shows the completed attachee count as its own tile', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        // The label also appears as a filter <option>, so target the tile itself.
        const tile = await screen.findByRole('button', { name: /Completed Attachees/i });
        expect(tile).toHaveTextContent('1');
    });

    it('renders the attachee with a Completed Attachee badge', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        await waitFor(() => {
            expect(screen.getByText('Grace Njeri - Geology Attachment')).toBeInTheDocument();
        });
        expect(screen.getByText('Completed Attachee')).toBeInTheDocument();
    });

    it('surfaces the completion date and institution in the row', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        await waitFor(() => {
            expect(screen.getByText(/Completed 15\/03\/2024/)).toBeInTheDocument();
        });
        expect(screen.getByText(/University of Nairobi/)).toBeInTheDocument();
    });

    it('offers ATTACHMENT in the type filter', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        await waitFor(() => {
            expect(screen.getByLabelText(/Filter By Entity Type/i)).toBeInTheDocument();
        });
        const values = Array.from(
            screen.getByLabelText(/Filter By Entity Type/i).options
        ).map((o) => o.value);
        expect(values).toEqual(['ALL', 'VACANCY', 'APPLICATION', 'ATTACHMENT', 'DEPARTMENT']);
    });

    it('never offers a purge control for a completed attachee', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        await waitFor(() => {
            expect(screen.getByText('Grace Njeri - Geology Attachment')).toBeInTheDocument();
        });
        // One purge button, belonging to the vacancy row only.
        expect(screen.getAllByRole('button', { name: 'Purge' })).toHaveLength(1);
        expect(screen.getByText('Permanent')).toBeInTheDocument();
    });

    it('shows the full attachee record in the details modal', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        await waitFor(() => {
            expect(screen.getByText('Grace Njeri - Geology Attachment')).toBeInTheDocument();
        });
        const row = screen.getByText('Grace Njeri - Geology Attachment').closest('tr');
        fireEvent.click(row.querySelector('button'));
        await waitFor(() => {
            expect(screen.getByText('GRACE1234A')).toBeInTheDocument();
        });
        expect(screen.getByText('University of Nairobi')).toBeInTheDocument();
        expect(screen.getByText('BSc Geology')).toBeInTheDocument();
    });

    it('exports every archive column with no blank cells', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        await waitFor(() => {
            expect(screen.getByText('Grace Njeri - Geology Attachment')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: /Export CSV/i }));

        expect(exportToCSV).toHaveBeenCalledTimes(1);
        const [, headers, rows] = exportToCSV.mock.calls[0];
        expect(headers).toEqual(archiveHeaders());
        expect(rows).toHaveLength(2);
        rows.forEach((row) => {
            expect(row).toHaveLength(ARCHIVE_COLUMNS.length);
            row.forEach((cell) => expect(cell.trim()).not.toBe(''));
        });
    });

    it('prints every archive column with no blank cells', async () => {
        authAs(ADMIN);
        mockArchive();
        render(<Archives />);
        await waitFor(() => {
            expect(screen.getByText('Grace Njeri - Geology Attachment')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByRole('button', { name: /^Print$/i }));

        expect(printTable).toHaveBeenCalledTimes(1);
        const [, , headers, rows] = printTable.mock.calls[0];
        expect(headers).toEqual(archiveHeaders());
        rows.forEach((row) => {
            expect(row).toHaveLength(ARCHIVE_COLUMNS.length);
            row.forEach((cell) => expect(cell.trim()).not.toBe(''));
        });
    });
});
