'use client';

import React from 'react';

interface MarkdownRendererProps {
    content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
    // Simple markdown parser for basic formatting
    const parseMarkdown = (text: string): React.ReactNode[] => {
        const lines = text.split('\n');
        const elements: React.ReactNode[] = [];
        let currentList: string[] = [];
        let listType: 'ul' | 'ol' | null = null;
        let keyCounter = 0;

        const getKey = () => `md-${keyCounter++}`;

        const flushList = () => {
            if (currentList.length > 0 && listType) {
                const key = getKey();
                if (listType === 'ul') {
                    elements.push(
                        <ul key={key} className="list-disc pl-6 mb-2">
                            {currentList.map((item, idx) => (
                                <li key={`${key}-li-${idx}`} className="mb-1" dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
                            ))}
                        </ul>
                    );
                } else {
                    elements.push(
                        <ol key={key} className="list-decimal pl-6 mb-2">
                            {currentList.map((item, idx) => (
                                <li key={`${key}-li-${idx}`} className="mb-1" dangerouslySetInnerHTML={{ __html: parseInline(item) }} />
                            ))}
                        </ol>
                    );
                }
                currentList = [];
                listType = null;
            }
        };

        lines.forEach((line) => {
            // Headers
            if (line.startsWith('### ')) {
                flushList();
                elements.push(<h3 key={getKey()} className="text-base font-bold mb-2 mt-3">{parseInlineAsReact(line.slice(4))}</h3>);
            } else if (line.startsWith('## ')) {
                flushList();
                elements.push(<h2 key={getKey()} className="text-lg font-bold mb-2 mt-3">{parseInlineAsReact(line.slice(3))}</h2>);
            } else if (line.startsWith('# ')) {
                flushList();
                elements.push(<h1 key={getKey()} className="text-xl font-bold mb-3 mt-4">{parseInlineAsReact(line.slice(2))}</h1>);
            }
            // Unordered list
            else if (line.match(/^[-*]\s+/)) {
                if (listType !== 'ul') {
                    flushList();
                    listType = 'ul';
                }
                currentList.push(line.replace(/^[-*]\s+/, ''));
            }
            // Ordered list
            else if (line.match(/^\d+\.\s+/)) {
                if (listType !== 'ol') {
                    flushList();
                    listType = 'ol';
                }
                currentList.push(line.replace(/^\d+\.\s+/, ''));
            }
            // Regular paragraph
            else if (line.trim()) {
                flushList();
                elements.push(<p key={getKey()} className="mb-2" dangerouslySetInnerHTML={{ __html: parseInline(line) }} />);
            }
            // Empty line
            else {
                flushList();
            }
        });

        flushList();
        return elements;
    };

    const parseInline = (text: string): string => {
        // Markdown-style links [text](url) - handle these first
        text = text.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">$1</a>'
        );
        // Standalone URLs (not already in a link) - convert to clickable links
        text = text.replace(
            /(?<![">])(https?:\/\/[^\s\)<>]+)(?![^<]*<\/a>)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">View Task</a>'
        );
        // Bold
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>');
        // Italic
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Code
        text = text.replace(/`(.+?)`/g, '<code style="background: #e5e7eb; padding: 0 4px; border-radius: 4px;">$1</code>');
        return text;
    };

    const parseInlineAsReact = (text: string): React.ReactNode => {
        // For headers, just return text (already parsed inline)
        return <span dangerouslySetInnerHTML={{ __html: parseInline(text) }} />;
    };

    return <div className="markdown-content text-sm leading-relaxed">{parseMarkdown(content)}</div>;
}
