export type CanonicalStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'BLOCKED' | 'DONE' | 'ARCHIVED';

export const STATUS_MAPPING: Record<string, CanonicalStatus> = {
    'open': 'TODO',
    'to do': 'TODO',
    'in progress': 'IN_PROGRESS',
    'doing': 'IN_PROGRESS',
    'review': 'REVIEW',
    'qa': 'REVIEW',
    'blocked': 'BLOCKED',
    'complete': 'DONE',
    'closed': 'DONE',
};

/**
 * Normalizes a ClickUp status string into a canonical PMS state.
 * Mapping Priority:
 * 1. Explicit mapping
 * 2. status_type (if provided)
 * 3. archived flag (if provided)
 */
export function normalizeStatus(
    status: string,
    statusType?: string,
    isArchived: boolean = false
): CanonicalStatus {
    if (isArchived) return 'ARCHIVED';

    const normalizedInput = status.toLowerCase().trim();

    // 1. Explicit mapping
    if (STATUS_MAPPING[normalizedInput]) {
        return STATUS_MAPPING[normalizedInput];
    }

    // 2. Fallback to statusType
    if (statusType) {
        const type = statusType.toLowerCase();
        if (type === 'open') return 'TODO';
        if (type === 'custom') return 'IN_PROGRESS';
        if (type === 'closed') return 'DONE';
    }

    // 3. Keyword matching as last resort
    if (normalizedInput.includes('progress') || normalizedInput.includes('dev')) return 'IN_PROGRESS';
    if (normalizedInput.includes('done') || normalizedInput.includes('finish') || normalizedInput.includes('complete')) return 'DONE';
    if (normalizedInput.includes('review') || normalizedInput.includes('test')) return 'REVIEW';

    return 'TODO';
}
