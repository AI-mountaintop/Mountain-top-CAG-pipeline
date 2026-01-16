'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Download, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface Board {
    id: string;
    name: string;
}

interface TestCasesUploadProps {
    boards: Board[];
}

interface Progress {
    current: number;
    total: number;
    currentQuestion: string;
    status: 'processing' | 'completed' | 'error';
    successCount: number;
    errorCount: number;
}

export default function TestCasesUpload({ boards }: TestCasesUploadProps) {
    const [selectedBoardId, setSelectedBoardId] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [progress, setProgress] = useState<Progress | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            if (selectedFile.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                selectedFile.type === 'application/vnd.ms-excel' ||
                selectedFile.name.endsWith('.xlsx') ||
                selectedFile.name.endsWith('.xls')) {
                setFile(selectedFile);
                setError('');
            } else {
                setError('Please upload a valid Excel file (.xlsx or .xls)');
                setFile(null);
            }
        }
    };

    // Poll for progress updates
    useEffect(() => {
        if (jobId && loading) {
            progressIntervalRef.current = setInterval(async () => {
                try {
                    const response = await fetch(`/api/test-cases/progress?jobId=${jobId}`);
                    if (response.ok) {
                        const progressData = await response.json();
                        setProgress(progressData);

                        if (progressData.status === 'completed') {
                            // Download the file
                            const downloadResponse = await fetch(`/api/test-cases/download?jobId=${jobId}`);
                            if (downloadResponse.ok) {
                                const blob = await downloadResponse.blob();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `test-results-${new Date().toISOString().split('T')[0]}.xlsx`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);

                                setSuccess(`Test cases processed successfully! Processed ${progressData.successCount} successfully, ${progressData.errorCount} errors. File downloaded.`);
                                setLoading(false);
                                setJobId(null);
                                setProgress(null);
                                setFile(null);
                            }
                        } else if (progressData.status === 'error') {
                            setError(progressData.error || 'Processing failed');
                            setLoading(false);
                            setJobId(null);
                            setProgress(null);
                        }
                    }
                } catch (err) {
                    console.error('Error fetching progress:', err);
                }
            }, 1000); // Poll every second

            return () => {
                if (progressIntervalRef.current) {
                    clearInterval(progressIntervalRef.current);
                }
            };
        }
    }, [jobId, loading]);

    const handleUpload = async () => {
        if (!file) {
            setError('Please select an Excel file');
            return;
        }

        if (!selectedBoardId) {
            setError('Please select a list');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');
        setProgress(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('boardId', selectedBoardId);

            const response = await fetch('/api/test-cases/process', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process test cases');
            }

            const data = await response.json();
            setJobId(data.jobId);
            // Progress polling will start via useEffect
        } catch (err: any) {
            setError(err.message || 'Failed to process test cases');
            setLoading(false);
            setJobId(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-6">
            <h2 className="text-3xl font-bold text-[#1a1f36] mb-6">
                Test Cases Upload
            </h2>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 space-y-6">
                {/* List Selection */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Select List
                    </label>
                    <select
                        value={selectedBoardId}
                        onChange={(e) => setSelectedBoardId(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">-- Select a list --</option>
                        {boards.map((board) => (
                            <option key={board.id} value={board.id}>
                                {board.name}
                            </option>
                        ))}
                    </select>
                </div>

                {/* File Upload */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Upload Test Cases Excel File
                    </label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                        <div className="space-y-1 text-center">
                            <Upload className="mx-auto h-12 w-12 text-gray-400" />
                            <div className="flex text-sm text-gray-600 dark:text-gray-400">
                                <label
                                    htmlFor="file-upload"
                                    className="relative cursor-pointer bg-white dark:bg-gray-700 rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                                >
                                    <span>Upload a file</span>
                                    <input
                                        id="file-upload"
                                        name="file-upload"
                                        type="file"
                                        className="sr-only"
                                        accept=".xlsx,.xls"
                                        onChange={handleFileChange}
                                    />
                                </label>
                                <p className="pl-1">or drag and drop</p>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Excel files only (.xlsx, .xls)
                            </p>
                            {file && (
                                <p className="text-sm text-gray-900 dark:text-white mt-2">
                                    Selected: {file.name}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Instructions */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                        File Format Requirements:
                    </h3>
                    <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
                        <li>Column A: "test cases" - Contains the questions to test</li>
                        <li>Column B: "expected output" - Contains expected answers (optional)</li>
                        <li>Column C: "response from chatbot" - Will be filled automatically</li>
                    </ul>
                </div>

                {/* Progress Display */}
                {loading && progress && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Loader2 className="animate-spin text-blue-600 dark:text-blue-400" size={20} />
                                <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
                                    Processing test cases...
                                </span>
                            </div>
                            <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                                {progress.current} / {progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
                            </span>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            />
                        </div>

                        {/* Current Question */}
                        {progress.currentQuestion && (
                            <div className="text-sm text-blue-700 dark:text-blue-400">
                                <span className="font-medium">Current:</span> {progress.currentQuestion}
                            </div>
                        )}

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <CheckCircle2 size={16} />
                                <span>{progress.successCount} successful</span>
                            </div>
                            {progress.errorCount > 0 && (
                                <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                    <XCircle size={16} />
                                    <span>{progress.errorCount} errors</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Error/Success Messages */}
                {error && (
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg">
                        {success}
                    </div>
                )}

                {/* Process Button */}
                <button
                    onClick={handleUpload}
                    disabled={loading || !file || !selectedBoardId}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <>
                            <Loader2 className="animate-spin" size={20} />
                            {progress ? `Processing... (${progress.current}/${progress.total})` : 'Starting...'}
                        </>
                    ) : (
                        <>
                            <Download size={20} />
                            Process & Download Results
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

