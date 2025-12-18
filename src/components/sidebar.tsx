'use client';

import { useState } from 'react';
import { LayoutDashboard, MessageSquare, Plus } from 'lucide-react';

interface SidebarProps {
    activeView: 'add-board' | 'boards' | 'chat';
    onViewChange: (view: 'add-board' | 'boards' | 'chat') => void;
}

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
    const menuItems = [
        {
            id: 'add-board' as const,
            label: 'Enter Board',
            icon: Plus,
        },
        {
            id: 'boards' as const,
            label: 'Boards Added',
            icon: LayoutDashboard,
        },
        {
            id: 'chat' as const,
            label: 'Chat Interface',
            icon: MessageSquare,
        },
    ];

    return (
        <div className="w-64 bg-[#1a1f36] min-h-screen flex flex-col">
            {/* Logo/Header */}
            <div className="p-6 border-b border-gray-700">
                <h1 className="text-xl font-bold text-white">
                    Trello Intelligence
                </h1>
                <p className="text-sm text-gray-400 mt-1">By Ready Artwork</p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4">
                <ul className="space-y-2">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeView === item.id;

                        return (
                            <li key={item.id}>
                                <button
                                    onClick={() => onViewChange(item.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${isActive
                                            ? 'bg-[#ff6b35] text-white shadow-lg'
                                            : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                        }`}
                                >
                                    <Icon size={20} />
                                    <span className="font-medium">{item.label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700">
                <p className="text-xs text-gray-500 text-center">
                    Powered by AI & Webhooks
                </p>
            </div>
        </div>
    );
}
