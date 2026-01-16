'use client';

import { useState, useEffect } from 'react';
import { Trash2, Folder, List } from 'lucide-react';

interface Board {
    id: string;
    name: string;
    url?: string;
    description?: string;
    last_synced?: string;
    cardCount: number;
    created_at: string;
    type?: 'folder' | 'list';
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
                setError(data.error || 'Failed to fetch lists');
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
                setError(data.error || 'Failed to add list');
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteBoard = async (boardId: string) => {
        if (!confirm('Are you sure you want to delete this list?')) return;

        try {
            const boardToDelete = boards.find(b => b.id === boardId);
            const boardType = boardToDelete?.type || 'list';
            const response = await fetch(`/api/boards/${boardId}?type=${boardType}`, {
                method: 'DELETE',
            });

            if (response.ok) {
                await fetchBoards();
                if (selectedBoardId === boardId) {
                    onBoardSelect('');
                }
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to delete list');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const startEditing = (board: Board, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingBoardId(board.id);
        setEditName(board.name);
    };

    const cancelEditing = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingBoardId(null);
        setEditName('');
    };

    const saveBoardName = async (boardId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!editName.trim()) return;

        try {
            const response = await fetch(`/api/boards/${boardId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName }),
            });

            if (response.ok) {
                await fetchBoards();
                setEditingBoardId(null);
                setEditName('');
            } else {
                const data = await response.json();
                setError(data.error || 'Failed to update list name');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Add List Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                    Add ClickUp List
                </h2>
                <form onSubmit={handleAddBoard} className="space-y-4">
                    <div>
                        <input
                            type="url"
                            value={boardUrl}
                            onChange={(e) => setBoardUrl(e.target.value)}
                            placeholder="https://app.clickup.com/.../li/{listId}/..."
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                    >
                        {loading ? 'Syncing List...' : 'Add & Sync List'}
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

            {/* List Selection */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                    Your Lists
                </h2>

                {boards.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">
                        No lists added yet. Add your first ClickUp list above!
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
                                        {editingBoardId === board.id ? (
                                            <div className="flex items-center gap-2 mb-2" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="px-2 py-1 border border-gray-300 rounded text-gray-900"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={(e) => saveBoardName(board.id, e)}
                                                    className="px-2 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={cancelEditing}
                                                    className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-sm hover:bg-gray-400"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                {board.type === 'folder' ? (
                                                    <Folder className="w-5 h-5 text-blue-500" />
                                                ) : (
                                                    <List className="w-5 h-5 text-gray-500" />
                                                )}
                                                <h3 className="font-semibold text-lg text-gray-900 dark:text-white">
                                                    {board.name}
                                                </h3>
                                                <button
                                                    onClick={(e) => startEditing(board, e)}
                                                    className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                                                    title="Edit name"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
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
                                        title="Delete list"
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
