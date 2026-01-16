'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Code } from 'lucide-react';
import MarkdownRenderer from './markdown-renderer';

interface Message {
    role: 'user' | 'assistant';
    content: string;
    sql?: string;
    resultCount?: number;
}

interface ChatInterfaceProps {
    boardId: string;
}

const EXAMPLE_QUESTIONS = [
    'What cards are due this week?',
    'Show me all cards in the "In Progress" list',
    'What changed in the last 10 minutes?',
    'Which cards have no due date?',
    'Show me cards with the "urgent" label',
    'How many cards are there in each list?',
];

export default function ChatInterface({ boardId }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [showSql, setShowSql] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || loading) return;

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
                    boardId,
                    question: userMessage.content,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.details?.[0]?.message || 'Failed to get response');
            }

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

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md flex flex-col h-[600px]">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Ask Questions About Your Board
                </h2>
                <button
                    onClick={() => setShowSql(!showSql)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${showSql
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}
                >
                    <Code size={16} />
                    <span className="text-sm">Show SQL</span>
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Try asking some questions:
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {EXAMPLE_QUESTIONS.map((question, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleExampleClick(question)}
                                    className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 transition-colors"
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
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                                    }`}
                            >
                                <div style={{ background: 'yellow', padding: '2px' }}>TEST: MarkdownRenderer loaded</div>
                                <MarkdownRenderer content={message.content} />
                                {message.sql && showSql && (
                                    <div className="mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                                        <div className="text-xs font-mono bg-gray-800 text-gray-100 p-2 rounded overflow-x-auto">
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
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 flex items-center gap-2">
                            <Loader2 className="animate-spin" size={20} />
                            <span className="text-gray-700 dark:text-gray-300">
                                Thinking...
                            </span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask a question about your ClickUp list..."
                        className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white p-3 rounded-lg transition-colors"
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>
        </div>
    );
}
