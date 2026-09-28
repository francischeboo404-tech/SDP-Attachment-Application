/**
 * downloadUtils.js
 * Shared utilities for exporting data as CSV, printing tables, and downloading blobs.
 * Used across Reports, Deployments, Clearance, Applications, and Audit Logs.
 */

/** Rendered in place of an empty value so an export never has a silently blank cell. */
export const EMPTY_CELL = 'Not recorded';

/**
 * Normalises a single cell for export/print.
 *
 * `null`, `undefined` and whitespace-only strings used to be written as an empty
 * cell, which is indistinguishable from a column that failed to export — a
 * records officer reading the file has no way to tell "we don't know this" from
 * "this field was dropped". An explicit placeholder keeps the column count
 * honest and any gap explainable.
 */
export function formatCell(value, placeholder = EMPTY_CELL) {
    if (value === null || value === undefined) return placeholder;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    const str = String(value);
    return str.trim() ? str : placeholder;
}

/** Escapes text for safe interpolation into the print window's HTML. */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Pads/normalises every row to the header width and fills every cell.
 * A rectangular, hole-free grid is what makes an export trustworthy as a record.
 */
function normalizeRows(rows, headers, emptyCell) {
    const width = headers.length;
    return (rows || []).map((row) =>
        Array.from({ length: width }, (_, i) => formatCell(row?.[i], emptyCell))
    );
}

/**
 * Export an array of objects as a professionally formatted CSV file download.
 * Includes official metadata header block with Republic of Kenya branding.
 * @param {string} filename - The desired filename (without extension)
 * @param {string[]} headers - Column header labels
 * @param {Array<Array<string|number>>} rows - 2D array of row data
 * @param {Object} [options] - Optional config
 * @param {string} [options.reportTitle] - Custom report title (defaults to filename)
 * @param {string} [options.subtitle] - Additional subtitle text
 */
export function exportToCSV(filename, headers, rows, options = {}) {
    const emptyCell = options.emptyCell || EMPTY_CELL;
    const normalizedRows = normalizeRows(rows, headers, emptyCell);

    const escapeCell = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const reportTitle = options.reportTitle || filename.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const subtitle = options.subtitle || '';

    // Build professional metadata header block
    const metaBlock = [
        '""',
        '"REPUBLIC OF KENYA"',
        '"STATE DEPARTMENT FOR PETROLEUM"',
        '"INDUSTRIAL ATTACHMENT SYSTEM"',
        '""',
        `"Report:  ${reportTitle}"`,
        ...(subtitle ? [`"${escapeCell(subtitle)}"`] : []),
        `"Generated:  ${dateStr} at ${timeStr}"`,
        `"Columns:  ${headers.length}"`,
        `"Total Records:  ${normalizedRows.length}"`,
        '""',
        '"' + '='.repeat(80) + '"',
        '""',
    ];

    const csvContent = [
        ...metaBlock,
        headers.map(escapeCell).join(','),
        ...normalizedRows.map(row => row.map(escapeCell).join(',')),
        '""',
        '"' + '-'.repeat(80) + '"',
        `"End of Report — ${reportTitle} — ${normalizedRows.length} records"`,
        '"State Department for Petroleum — Industrial Attachment System"',
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${now.toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Print a formatted HTML table in a new window.
 * @param {string} title - Document title shown in header
 * @param {string} subtitle - Subtitle / description
 * @param {string[]} headers - Column headers
 * @param {Array<Array<string|number>>} rows - 2D array of row data
 * @param {Object} [options] - Optional config
 * @param {string} [options.orientation='landscape'] - 'portrait' or 'landscape'
 */
export function printTable(title, subtitle, headers, rows, options = {}) {
    const orientation = options.orientation || 'landscape';
    const emptyCell = options.emptyCell || EMPTY_CELL;
    const now = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // Same guarantees as the CSV path: one cell per column, none blank, and all
    // values HTML-escaped so an apostrophe or a "<" in a name cannot corrupt the
    // printed document.
    const normalizedRows = normalizeRows(rows, headers, emptyCell);
    const headerCells = headers.map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const bodyRows = normalizedRows.map(row =>
        `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
    ).join('');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>${escapeHtml(title)}</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: 'Segoe UI', Arial, sans-serif;
                        padding: 24px;
                        color: #1e293b;
                        font-size: 10pt;
                        line-height: 1.4;
                    }
                    .print-header {
                        text-align: center;
                        border-bottom: 3px double #64748b;
                        padding-bottom: 16px;
                        margin-bottom: 20px;
                    }
                    .print-header h1 {
                        font-size: 11pt;
                        text-transform: uppercase;
                        letter-spacing: 2px;
                        color: #334155;
                        margin-bottom: 2px;
                    }
                    .print-header h2 {
                        font-size: 14pt;
                        font-weight: 800;
                        color: #0f172a;
                        margin-bottom: 2px;
                    }
                    .print-header .subtitle {
                        font-size: 9pt;
                        color: #64748b;
                    }
                    .print-header .date {
                        font-size: 8pt;
                        color: #94a3b8;
                        margin-top: 4px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 9pt;
                    }
                    th {
                        background: #f1f5f9;
                        border: 1px solid #cbd5e1;
                        padding: 6px 8px;
                        text-align: left;
                        font-weight: 700;
                        text-transform: uppercase;
                        font-size: 7.5pt;
                        letter-spacing: 0.5px;
                        color: #334155;
                    }
                    td {
                        border: 1px solid #e2e8f0;
                        padding: 5px 8px;
                        vertical-align: top;
                    }
                    tr:nth-child(even) { background: #f8fafc; }
                    .print-footer {
                        margin-top: 20px;
                        padding-top: 12px;
                        border-top: 1px solid #e2e8f0;
                        font-size: 7.5pt;
                        color: #94a3b8;
                        display: flex;
                        justify-content: space-between;
                    }
                    @media print {
                        body { padding: 0; }
                        @page {
                            size: ${orientation};
                            margin: 1.5cm;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="print-header">
                    <h1>Republic of Kenya — State Department for Petroleum</h1>
                    <h2>${escapeHtml(title)}</h2>
                    <p class="subtitle">${escapeHtml(subtitle)}</p>
                    <p class="date">Generated on ${now}</p>
                </div>
                <table>
                    <thead><tr>${headerCells}</tr></thead>
                    <tbody>${bodyRows}</tbody>
                </table>
                <div class="print-footer">
                    <span>State Department for Petroleum — Industrial Attachment System</span>
                    <span>Total Records: ${normalizedRows.length}</span>
                </div>
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
}
