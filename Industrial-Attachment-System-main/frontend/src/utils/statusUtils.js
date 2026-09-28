/**
 * Shared utility for computing the dynamic display status of an applicant / attachee.
 *
 * Selection is binary: an application is either SUCCESSFUL (the opportunity is
 * granted) or REJECTED. The previous model had SHORTLISTED and HIRED as
 * intermediate steps towards the same success outcome, so every consumer had to
 * test for both. They are gone; SUCCESSFUL is the single success state.
 *
 * Rules:
 * 1. If deployment status is 'DEPLOYED' -> 'Industrial Attachment Trainee'
 * 2. If deployment status is 'EXITED':
 *    - If clearance is 'CLEARED' -> 'Attachment Completed — Cleared'
 *    - Else -> 'Attachment Completed — Clearance in Progress'
 * 3. If application status is 'SUCCESSFUL' (and not yet deployed) ->
 *    'Successful — Awaiting Deployment'
 * 4. Otherwise: formatted application status ('Pending Review', 'Reviewed', 'Rejected')
 */
export function getDerivedStatus({ applicationStatus, deploymentStatus, clearanceStatus, displayStatus }) {
    // If backend already passed the authoritative derived status, use it
    if (displayStatus) {
        return displayStatus;
    }

    if (deploymentStatus === 'DEPLOYED') {
        return 'Industrial Attachment Trainee';
    }
    if (deploymentStatus === 'EXITED') {
        if (clearanceStatus === 'CLEARED') {
            return 'Attachment Completed — Cleared';
        }
        return 'Attachment Completed — Clearance in Progress';
    }
    if (applicationStatus === 'SUCCESSFUL') {
        return 'Successful — Awaiting Deployment';
    }

    const map = {
        'PENDING': 'Pending Review',
        'REVIEWED': 'Reviewed',
        'SUCCESSFUL': 'Successful — Awaiting Deployment',
        'REJECTED': 'Rejected',
        'WITHDRAWN': 'Withdrawn',
    };

    return map[applicationStatus] || applicationStatus?.replace(/_/g, ' ') || 'Pending Review';
}

/**
 * Returns WCAG AA compliant badge styling classes for the derived status.
 */
export function getDerivedStatusBadgeClass(derivedStatus) {
    if (!derivedStatus) return 'bg-slate-100 text-slate-800 border-slate-300';

    if (derivedStatus === 'Industrial Attachment Trainee') {
        return 'bg-amber-50 text-amber-900 border-amber-300 font-black';
    }
    if (derivedStatus.includes('Cleared')) {
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-black';
    }
    if (derivedStatus.includes('Clearance in Progress')) {
        return 'bg-blue-50 text-blue-800 border-blue-300 font-bold';
    }
    if (derivedStatus.includes('Successful') || derivedStatus.includes('Awaiting Deployment')) {
        return 'bg-teal-50 text-teal-800 border-teal-300 font-bold';
    }
    if (derivedStatus.includes('Reviewed')) {
        return 'bg-purple-50 text-purple-800 border-purple-300 font-bold';
    }
    if (derivedStatus.includes('Rejected')) {
        return 'bg-rose-50 text-rose-800 border-rose-300 font-bold';
    }
    return 'bg-amber-50 text-amber-800 border-amber-300 font-bold';
}

/**
 * The complete Application status vocabulary.
 *
 * Exported so the decision controls render exactly these options instead of
 * hardcoding a list in each screen, which is how the old three-way
 * Shortlist / Hired / Reject set drifted between the ManageJobs table, the
 * applicant timeline and the deployment picker.
 */
export const APPLICATION_STATUSES = {
    PENDING: 'PENDING',
    REVIEWED: 'REVIEWED',
    SUCCESSFUL: 'SUCCESSFUL',
    REJECTED: 'REJECTED',
};

/**
 * The only two outcomes HR may record. PENDING and REVIEWED are workflow
 * markers, not decisions, so they are excluded from decision controls.
 */
export const DECISION_STATUSES = ['SUCCESSFUL', 'REJECTED'];

/** Statuses meaning "no decision recorded yet". */
export const PENDING_STATUSES = ['PENDING', 'REVIEWED'];

/** Human labels for the decision controls. */
export const DECISION_LABELS = {
    SUCCESSFUL: 'Successful',
    REJECTED: 'Rejected',
};
