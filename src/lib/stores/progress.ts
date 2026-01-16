// In-memory progress store (in production, use Redis or a database)

export interface ProgressData {
    current: number;
    total: number;
    currentQuestion: string;
    status: 'processing' | 'completed' | 'error';
    successCount: number;
    errorCount: number;
    result?: string;
    error?: string;
}

const progressStore = new Map<string, ProgressData>();

export function setProgress(jobId: string, progress: ProgressData) {
    progressStore.set(jobId, progress);
}

export function getProgress(jobId: string) {
    return progressStore.get(jobId);
}

export function deleteProgress(jobId: string) {
    progressStore.delete(jobId);
}
