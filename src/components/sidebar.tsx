'use client';

import Image from 'next/image';
import {
    LayoutDashboard,
    MessageSquare,
    Plus,
    FileSpreadsheet,
    Settings,
    FileText,
    BarChart3,
    CheckSquare
} from 'lucide-react';

interface SidebarProps {
    activeView: 'add-board' | 'boards' | 'chat' | 'test-cases';
    onViewChange: (view: 'add-board' | 'boards' | 'chat' | 'test-cases') => void;
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
        {
            id: 'test-cases' as const,
            label: 'Test Cases',
            icon: FileSpreadsheet,
        },
    ];

    return (
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen flex flex-col">
            {/* Logo/Header */}
            <div className="p-6 border-b border-gray-100">
                <div className="mb-2">
                    <Image
                        src="/logo.png"
                        alt="MountainTop Web Design"
                        width={150}
                        height={50}
                        className="h-auto w-auto"
                        priority
                    />
                </div>
                <p className="text-xs text-gray-400 font-medium">AI Dashboard</p>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4">
                <ul className="space-y-1">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeView === item.id;

                        return (
                            <li key={item.id}>
                                <button
                                    onClick={() => onViewChange(item.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all text-sm font-medium ${isActive
                                        ? 'bg-[#ff6b35] text-white ring-2 ring-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                                        }`}
                                >
                                    <Icon size={18} />
                                    <span>{item.label}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100">
                <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors text-sm font-medium">
                    <Settings size={18} />
                    <span>Settings</span>
                </button>
            </div>
        </div>
    );
}
