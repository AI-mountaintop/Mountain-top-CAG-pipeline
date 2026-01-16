// In-memory progress store (in production, use Redis or a database)
const progressStore = new Map<string, {
    current: number;
    total: number;
    currentQuestion: string;
    status: 'processing' | 'completed' | 'error';
    successCount: number;
    errorCount: number;
    result?: string;
    error?: string;
}>();

export function setProgress(jobId: string, progress: {
    current: number;
    total: number;
    currentQuestion: string;
    status: 'processing' | 'completed' | 'error';
    successCount: number;
    errorCount: number;
    result?: string;
    error?: string;
}) {
    progressStore.set(jobId, progress);
}

export function getProgress(jobId: string) {
    return progressStore.get(jobId);
}

export function deleteProgress(jobId: string) {
    progressStore.delete(jobId);
}

