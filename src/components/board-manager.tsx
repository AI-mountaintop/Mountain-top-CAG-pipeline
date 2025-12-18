'use client';

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';

interface Board {
    id: string;
    name: string;
    url: string;
    description?: string;
    last_synced?: string;
    cardCount: number;
    created_at: string;
}

interface BoardManagerProps {
    onBoardSelect: (boardId: string) => void;
    selectedBoardId?: string;
}

export default function BoardManager({
    onBoardSelect,
    selectedBoardId,
}: BoardManagerProps) {
    const [boards, setBoards] = useState<Board[]>([]);
    const [boardUrl, setBoardUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        fetchBoards();
    }, []);

    const fetchBoards = async () => {
        try {
            const response = await fetch('/api/boards');
            const data = await response.json();
            if (response.ok) {
                setBoards(data.boards || []);
            } else {
                setError(data.error || 'Failed to fetch boards');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleAddBoard = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            const response = await fetch('/api/boards/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boardUrl }),
            });

            const data = await response.json();

            if (response.ok) {
                setSuccess(data.message);
                setBoardUrl('');
                await fetchBoards();
            } else {
                setError(data.error || 'Failed to add board');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBoard = async (boardId: string) => {
        if (!confirm('Are you sure you want to delete this board?')) return;

        try {
            const response = await fetch(`/api/boards/${boardId}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                await fetchBoards();
                if (selectedBoardId === boardId) {
                    onBoardSelect('');
                }
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to delete board');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Add Board Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                    Add Trello Board
                </h2>
                <form onSubmit={handleAddBoard} className="space-y-4">
                    <div>
                        <input
                            type="url"
                            value={boardUrl}
                            onChange={(e) => setBoardUrl(e.target.value)}
                            placeholder="https://trello.com/b/boardId/board-name"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        {loading ? 'Syncing Board...' : 'Add & Sync Board'}
                    </button>
                </form>

                {error && (
                    <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="mt-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 dark:border-green-800 text-green-700 dark:text-green-300 rounded-lg">
                        {success}
                    </div>
                )}
            </div>

            {/* Board Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                    Your Boards
                </h2>

                {boards.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">
                        No boards added yet. Add your first Trello board above!
                    </p>
                ) : (
                    <div className="space-y-3">
                        {boards.map((board) => (
                            <div
                                key={board.id}
                                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${selectedBoardId === board.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                                    }`}
                                onClick={() => onBoardSelect(board.id)}
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                                            {board.name}
                                        </h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                            {board.cardCount} cards
                                            {board.last_synced && (
                                                <span className="ml-2">
                                                    • Last synced:{' '}
                                                    {new Date(board.last_synced).toLocaleString()}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteBoard(board.id);
                                        }}
                                        className="ml-4 p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                        title="Delete board"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
