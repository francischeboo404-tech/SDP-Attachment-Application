/**
 * archiveUtils.js
 *
 * Shared column definitions and cell formatting for the System Archives and the
 * Director-scoped Department Archives.
 *
 * Both pages render four entity types in one table, so a single column list is
 * the only way to guarantee that every record has a value in every column —
 * a completed attachee has institution, qualification and completion dates that
 * a vacancy simply does not have, and without a shared definition those cells
 * end up blank in the export.
 */

/** Rendered instead of an empty cell. */
export const NOT_RECORDED = 'Not recorded';

/**
 * The archive column set. `keys` are read off each archive item returned by
 * `GET /api/jobs/archives/`; a key that an entity type does not have renders as
 * NOT_RECORDED rather than as a missing column.
 */
export const ARCHIVE_COLUMNS = [
    { header: 'Type', keys: ['entity_type'] },
    { header: 'Record Title / Identifier', keys: ['title'] },
    { header: 'Department', keys: ['department_name'] },
    { header: 'Attachee', keys: ['attachee_name'] },
    { header: 'Email', keys: ['email'] },
    { header: 'Phone', keys: ['phone_number'] },
    { header: 'National ID', keys: ['id_number'] },
    { header: 'Institution', keys: ['institution_name'] },
    { header: 'Qualification', keys: ['qualification'] },
    { header: 'Field of Study', keys: ['field_of_study'] },
    { header: 'Vacancy / Placement', keys: ['job_title'] },
    { header: 'Opportunity Type', keys: ['opportunity_type'] },
    { header: 'Duration (Weeks)', keys: ['duration_weeks'] },
    { header: 'Slots', keys: ['slots'] },
    { header: 'Application Date', keys: ['application_date'] },
    { header: 'Deployment Start Date', keys: ['deployment_start_date'] },
    { header: 'Deployment End Date', keys: ['deployment_end_date'] },
    { header: 'Department Clearance Date', keys: ['department_cleared_at'] },
    { header: 'HR Clearance Date', keys: ['clearance_date'] },
    { header: 'Completion Date', keys: ['completion_date'] },
    { header: 'Completion Year', keys: ['completion_year'] },
    { header: 'Final Report Submitted', keys: ['final_report_submitted'] },
    { header: 'Recommendation Letter', keys: ['recommendation_letter'] },
    { header: 'Archived Details', keys: ['details'] },
    { header: 'Archived Date', keys: ['archived_at'] },
    { header: 'Archived By', keys: ['archived_by'] },
];

/**
 * Coerces any archive value into a printable cell.
 *
 * Handles the three shapes the API mixes in one column: ISO date strings,
 * numbers, and already-formatted strings. A date column is rendered as a plain
 * day (not a locale time) because an archive record is referred to by the day
 * it was filed, and "26/09/2026 13:45" is harder to scan than "26/09/2026".
 */
export function formatArchiveCell(value, { dateOnly = false } = {}) {
    if (value === null || value === undefined) return NOT_RECORDED;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return String(value);
    if (typeof value !== 'string') return String(value);
    if (!value.trim()) return NOT_RECORDED;

    // Bare "YYYY-MM-DD" values are already the exact day we want to show.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-');
        return `${d}/${m}/${y}`;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    if (dateOnly || value.length <= 10) {
        return parsed.toLocaleDateString('en-GB');
    }
    return `${parsed.toLocaleDateString('en-GB')} ${parsed.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
    })}`;
}

/** Header labels, in order. */
export const archiveHeaders = () => ARCHIVE_COLUMNS.map((c) => c.header);

/**
 * Turns archive items into a dense 2D array matching `archiveHeaders()`.
 * Every row has exactly as many cells as there are columns, and no cell is
 * blank.
 */
export function archiveRows(items) {
    return (items || []).map((item) =>
        ARCHIVE_COLUMNS.map((column) => {
            // Take the first key the record actually carries.
            const source = column.keys.find(
                (key) => item[key] !== undefined && item[key] !== null
            );
            const isDateColumn = /date|year/i.test(column.header);
            return formatArchiveCell(source ? item[source] : null, {
                dateOnly: isDateColumn,
            });
        })
    );
}

/** Human-readable label for an archive entity type. */
export const ENTITY_TYPE_LABELS = {
    VACANCY: 'Vacancy',
    APPLICATION: 'Application',
    ATTACHMENT: 'Completed Attachee',
    DEPARTMENT: 'Department',
};
