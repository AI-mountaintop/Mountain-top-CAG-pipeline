'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Code, MessageSquare } from 'lucide-react';
import MarkdownRenderer from './markdown-renderer';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    resultCount?: number;
}

interface Board {
    id: string;
    name: string;
}

interface ChatInterfaceUpdatedProps {
    boards: Board[];
}

const EXAMPLE_QUESTIONS = [
    'Show me overdue tasks',
    'What tasks are assigned to Ian?',
    'Tasks completed this week',
    'High priority tasks',
    'Tasks with no due date',
    'What changed recently?',
];

export default function ChatInterfaceUpdated({ boards }: ChatInterfaceUpdatedProps) {
    const [selectedBoardId, setSelectedBoardId] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSql, setShowSql] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Generate localStorage key for board-specific chat history
    const getChatStorageKey = (boardId: string) => `chat_history_${boardId}`;

    // Load chat history when board is selected
    useEffect(() => {
        if (selectedBoardId) {
            try {
                const storageKey = getChatStorageKey(selectedBoardId);
                const savedHistory = localStorage.getItem(storageKey);
                if (savedHistory) {
                    const parsedHistory = JSON.parse(savedHistory);
                    setMessages(parsedHistory);
                } else {
                    setMessages([]);
                }
            } catch (error) {
                console.error('Error loading chat history:', error);
                setMessages([]);
            }
        }
    }, [selectedBoardId]);

    // Save chat history whenever messages change
    useEffect(() => {
        if (selectedBoardId && messages.length > 0) {
            try {
                const storageKey = getChatStorageKey(selectedBoardId);
                localStorage.setItem(storageKey, JSON.stringify(messages));
            } catch (error) {
                console.error('Error saving chat history:', error);
            }
        }
    }, [messages, selectedBoardId]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading || !selectedBoardId) return;

        const userMessage: Message = {
            role: 'user',
            content: input.trim(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput('');
        setLoading(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    boardId: selectedBoardId,
                    question: userMessage.content,
                    history: messages, // Send conversation history
                }),
            });

            const data = await response.json();

            const assistantMessage: Message = {
                role: 'assistant',
                content: data.answer,
                sql: data.sql,
                resultCount: data.resultCount,
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (error: any) {
            const errorMessage: Message = {
                role: 'assistant',
                content: `Error: ${error.message}`,
            };
            setMessages((prev) => [...prev, errorMessage]);
        } finally {
            setLoading(false);
        }
    };

    const handleExampleClick = (question: string) => {
        setInput(question);
    };

    const clearHistory = () => {
        if (selectedBoardId) {
            const storageKey = getChatStorageKey(selectedBoardId);
            localStorage.removeItem(storageKey);
            setMessages([]);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md flex flex-col h-full">
            {/* Header with Board Selector */}
            <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xl font-bold text-[#1a1f36]">
                        Chat Interface
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowSql(!showSql)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm ${showSql
                                ? 'bg-[#ff6b35] text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            <Code size={16} />
                            <span>Show SQL</span>
                        </button>
                        {selectedBoardId && messages.length > 0 && (
                            <button
                                onClick={clearHistory}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-sm bg-gray-100 text-gray-700 hover:bg-red-100 hover:text-red-700"
                                title="Clear chat history for this board"
                            >
                                <MessageSquare size={16} />
                                <span>Clear History</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Board Selector Dropdown */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Board
                    </label>
                    <select
                        value={selectedBoardId}
                        onChange={(e) => setSelectedBoardId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ff6b35] focus:border-transparent bg-white text-gray-900"
                    >
                        <option value="">Choose a board...</option>
                        {boards.map((board) => (
                            <option key={board.id} value={board.id}>
                                {board.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth min-h-0 chat-messages-container">
                {!selectedBoardId ? (
                    <div className="text-center py-12">
                        <MessageSquare size={64} className="mx-auto text-gray-300 mb-4" />
                        <p className="text-gray-600 font-medium mb-2">
                            Select a board to start chatting
                        </p>
                        <p className="text-gray-500 text-sm">
                            Choose a board from the dropdown above
                        </p>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-600 mb-4 font-medium">
                            Try asking some questions:
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {EXAMPLE_QUESTIONS.map((question, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleExampleClick(question)}
                                    className="px-3 py-2 bg-gray-100 hover:bg-[#ff6b35] hover:text-white rounded-lg text-sm text-gray-700 transition-colors"
                                >
                                    {question}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((message, idx) => (
                        <div
                            key={idx}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                                }`}
                        >
                            <div
                                className={`max-w-[80%] rounded-lg p-4 ${message.role === 'user'
                                    ? 'bg-[#ff6b35] text-white'
                                    : 'bg-gray-100 text-gray-900'
                                    }`}
                            >
                                <MarkdownRenderer content={message.content} />
                                {message.sql && showSql && (
                                    <div className="mt-3 pt-3 border-t border-gray-300">
                                        <div className="text-xs font-mono bg-[#1a1f36] text-gray-100 p-2 rounded overflow-x-auto">
                                            {message.sql}
                                        </div>
                                        {message.resultCount !== undefined && (
                                            <div className="text-xs mt-2 opacity-75">
                                                {message.resultCount} results
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-lg p-4 flex items-center gap-2">
                            <Loader2 className="animate-spin text-[#ff6b35]" size={20} />
                            <span className="text-gray-700">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={
                            selectedBoardId
                                ? 'Ask a question about your ClickUp list...'
                                : 'Select a board first...'
                        }
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#ff6b35] focus:border-transparent bg-white text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        disabled={loading || !selectedBoardId}
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim() || !selectedBoardId}
                        className="bg-[#ff6b35] hover:bg-[#ff5722] disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-colors"
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
}
