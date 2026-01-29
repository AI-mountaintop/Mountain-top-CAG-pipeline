'use client';

import { useState, useEffect } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Board {
    id: string;
    name: string;
    url: string;
    cardCount: number;
    last_synced?: string;
    updated_at: string;
}

export default function BoardsList() {
    const [boards, setBoards] = useState<Board[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchBoards();
    }, []);

    const fetchBoards = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/boards');

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            setBoards(data.boards || []);
        } catch (error: any) {
            console.error('Error fetching boards:', error);
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (boardId: string) => {
        if (!confirm('Delete this board?')) return;

        try {
            const response = await fetch(`/api/boards/${boardId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                await fetchBoards();
            }
        } catch (error) {
            console.error('Error deleting board:', error);
        }
    };

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4 max-w-md">
                    <p className="font-semibold">Error Loading Boards</p>
                    <p className="text-sm">{error}</p>
                </div>
                <button
                    onClick={() => fetchBoards()}
                    className="px-4 py-2 bg-[#1a1f36] text-white rounded-md hover:bg-[#2a2f46] transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-gray-400">Loading boards...</div>
            </div>
        );
    }

    if (boards.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <LayoutDashboard size={64} className="text-gray-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    No Boards Added Yet
                </h3>
                <p className="text-gray-500">
                    Click "Enter Board" to add your first ClickUp list
                </p>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-4">
            <h2 className="text-2xl font-bold text-[#1a1f36] mb-6">
                Your Boards ({boards.length})
            </h2>

            <div className="space-y-3">
                {boards.map((board) => (
                    <div
                        key={board.id}
                        className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <h3 className="font-semibold text-lg text-[#1a1f36] mb-2">
                                    {board.name}
                                </h3>

                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                    <span className="flex items-center gap-1">
                                        <LayoutDashboard size={14} />
                                        {board.cardCount} cards
                                    </span>

                                    {board.last_synced && (
                                        <span className="flex items-center gap-1">
                                            <Clock size={14} />
                                            Updated {formatDistanceToNow(new Date(board.last_synced), { addSuffix: true })}
                                        </span>
                                    )}
                                </div>

                                {board.last_synced && (
                                    <div className="mt-2 text-xs text-gray-500">
                                        Last sync: {new Date(board.last_synced).toLocaleString()}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => handleDelete(board.id)}
                                className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete board"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function LayoutDashboard({ size, className }: { size: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <rect x="3" y="3" width="7" height="9" />
            <rect x="14" y="3" width="7" height="5" />
            <rect x="14" y="12" width="7" height="9" />
            <rect x="3" y="16" width="7" height="5" />
        </svg>
    );
}
