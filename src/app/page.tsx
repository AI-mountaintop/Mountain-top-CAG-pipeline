'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/sidebar';
import BoardManager from '@/components/board-manager';
import BoardsList from '@/components/boards-list';
import ChatInterfaceUpdated from '@/components/chat-interface-updated';
import TestCasesUpload from '@/components/test-cases-upload';

interface Board {
  id: string;
  name: string;
  url: string;
  cardCount: number;
  last_synced?: string;
  created_at: string;
  updated_at: string;
}

export default function Home() {
  const [activeView, setActiveView] = useState<'add-board' | 'boards' | 'chat' | 'test-cases'>('boards');
  const [boards, setBoards] = useState<Board[]>([]);

  useEffect(() => {
    fetchBoards();
  }, []);

  const fetchBoards = async () => {
    try {
      const response = await fetch('/api/boards');
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      setBoards(data.boards || []);
    } catch (error) {
      console.error('Error fetching boards:', error);
    }
  };

  // Refresh boards when switching to boards view
  useEffect(() => {
    if (activeView === 'boards' || activeView === 'add-board') {
      fetchBoards();
    }
  }, [activeView]);

  // Periodic Hard Sync (every 15 minutes)
  useEffect(() => {
    const SYNC_INTERVAL = 15 * 60 * 1000; // 15 minutes

    const syncAllBoards = async () => {
      if (boards.length === 0) return;

      console.log('Starting periodic hard sync for all lists...');

      for (const board of boards) {
        try {
          await fetch(`/api/boards/${board.id}/sync`, { method: 'POST' });
          console.log(`Synced list: ${board.name}`);
        } catch (error) {
          console.error(`Failed to sync list ${board.name}:`, error);
        }
      }

      // Refresh board list to show updated timestamps
      fetchBoards();
    };

    const intervalId = setInterval(syncAllBoards, SYNC_INTERVAL);

    return () => clearInterval(intervalId);
  }, [boards]);

  return (
    <div className="flex h-screen bg-white overflow-hidden">
      {/* Left Sidebar */}
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden bg-white min-h-0">
        {activeView === 'add-board' && (
          <div className="p-6 overflow-auto h-full">
            <h2 className="text-3xl font-bold text-[#1a1f36] mb-6">
              Add ClickUp List
            </h2>
            <BoardManager
              onBoardSelect={() => { }}
              selectedBoardId=""
            />
          </div>
        )}

        {activeView === 'boards' && (
          <div className="p-6 overflow-auto h-full">
            <BoardsList />
          </div>
        )}

        {activeView === 'chat' && (
          <div className="p-6 h-full flex flex-col overflow-hidden">
            <ChatInterfaceUpdated
              boards={boards.map((b) => ({ id: b.id, name: b.name }))}
            />
          </div>
        )}

        {activeView === 'test-cases' && (
          <div className="p-6">
            <TestCasesUpload
              boards={boards.map((b) => ({ id: b.id, name: b.name }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
