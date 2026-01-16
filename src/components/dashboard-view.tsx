import { useState, useEffect } from 'react';
import { FileText, BarChart3, CheckSquare, Clock, ArrowRight } from 'lucide-react';

export default function DashboardView() {
    const [trailmapCount, setTrailmapCount] = useState(0);
    const [meetingActionCount, setMeetingActionCount] = useState(0);

    useEffect(() => {
        const fetchCounts = async () => {
            try {
                const [trailmapsRes, actionsRes] = await Promise.all([
                    fetch('/api/trailmaps'),
                    fetch('/api/meeting-actions')
                ]);

                const trailmapsData = await trailmapsRes.json();
                const actionsData = await actionsRes.json();

                if (trailmapsData.trailmaps) setTrailmapCount(trailmapsData.trailmaps.length);
                if (actionsData.actions) setMeetingActionCount(actionsData.actions.length);
            } catch (error) {
                console.error('Error fetching dashboard counts:', error);
            }
        };

        fetchCounts();
    }, []);

    const stats = [
        {
            title: 'Digital Trailmap',
            count: trailmapCount,
            label: 'Total created',
            description: 'Generate comprehensive digital trailmaps from meeting transcripts',
            icon: FileText,
        },
        {
            title: 'Pre-Sales Summary',
            count: 9, // Placeholder until API is ready
            label: 'Total generated',
            description: 'Create pre-sales call summaries from website analysis',
            icon: BarChart3,
        },
        {
            title: 'Meeting Actions',
            count: meetingActionCount,
            label: 'Total processed',
            description: 'Convert meeting minutes into actionable items',
            icon: CheckSquare,
        },
    ];

    const activities = [
        {
            title: 'Biweekly Standing Meeting with CCS & Mountaintop',
            type: 'Meeting Actions',
            date: 'Jan 8, 3:25 PM',
            icon: CheckSquare,
        },
        {
            title: 'DR Rick Perea',
            type: 'Pre-Sales Summary',
            date: 'Jan 8, 2:54 PM',
            icon: BarChart3,
        },
        {
            title: 'Trailmap - Better Growth & Mountaintop Web Design',
            type: 'Digital Trailmap',
            date: 'Jan 8, 2:43 PM',
            icon: FileText,
        },
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-gray-500 mt-1">Overview of your AI-powered tools</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    return (
                        <div key={index} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-gray-600 font-medium">{stat.title}</h3>
                                <Icon className="text-gray-400" size={20} />
                            </div>
                            <div className="mb-4">
                                <span className="text-4xl font-bold text-gray-900">{stat.count}</span>
                                <p className="text-xs text-gray-400 mt-1">{stat.label}</p>
                            </div>
                            <div className="border-t border-gray-100 pt-4 mt-4">
                                <h4 className="font-semibold text-gray-900 mb-1">{stat.title}</h4>
                                <p className="text-sm text-gray-500 leading-relaxed">
                                    {stat.description}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="p-6 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
                    <p className="text-sm text-gray-500">Latest actions across all features</p>
                </div>
                <div className="divide-y divide-gray-100">
                    {activities.map((activity, index) => {
                        const Icon = activity.icon;
                        return (
                            <div key={index} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 bg-gray-100 rounded-lg text-gray-500">
                                        <Icon size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-gray-900">{activity.title}</h3>
                                        <p className="text-sm text-gray-500">{activity.type}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <Clock size={14} />
                                    <span>{activity.date}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
