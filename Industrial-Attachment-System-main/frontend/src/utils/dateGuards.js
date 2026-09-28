/**
 * Start-date guards.
 *
 * A start date is a forward-looking commitment: an attachment that has already
 * begun cannot be recorded as beginning in the past. Previously these fields
 * were plain date inputs with no lower bound, so a mistyped year silently
 * created a deployment that started months ago and immediately skewed every
 * duration, clearance-velocity and age-of-attachee figure derived from it.
 *
 * Three layers, because any one of them alone is bypassable:
 *   1. `minStartDate()` sets the picker's lower bound and blocks typed values
 *      in most browsers;
 *   2. `startDateError()` catches a date the browser still let through (typed
 *      directly, or a value restored from a saved draft) and produces a message
 *      the form shows;
 *   3. the serializers reject it server-side, because a client-side check is
 *      only ever a convenience.
 *
 * NOT applied to date of birth or any other genuinely historical field.
 */

/** Today as `YYYY-MM-DD` in the browser's local calendar, not UTC. */
export function todayISO() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

/** Lower bound for a start-date input. */
export function minStartDate() {
    return todayISO();
}

/**
 * True when `value` is a real, parseable date strictly before today.
 *
 * Empty and unparseable values return false: an empty required field is the
 * form's own problem to report, and an unparseable value is not evidence of
 * backdating.
 */
export function isBackdated(value) {
    if (!value) return false;
    const chosen = String(value).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen)) return false;
    return chosen < todayISO();
}

/**
 * Human-readable message for a backdated start date, or null when the value is
 * acceptable. `label` names the field, e.g. "Intended attachment start date".
 */
export function startDateError(value, label = 'Start date') {
    if (!isBackdated(value)) return null;
    return (
        `${label} cannot be in the past. ` +
        `Today is ${formatReadable(todayISO())}, so the earliest valid start date is ` +
        `${formatReadable(todayISO())}. Pick today or a future date.`
    );
}

function formatReadable(iso) {
    const parsed = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}
