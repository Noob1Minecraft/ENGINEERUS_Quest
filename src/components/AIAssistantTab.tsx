import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { UserProfile, Language, SavedNote, ChatMessage, ChatSession } from '../types';
import { TRANSLATIONS } from '../data';
import { verifySystemIntegrity } from '../utils/integrity';
import {
  Sparkles, Send, Layers, Cpu, ShieldCheck, Users, HelpCircle, CheckCircle2,
  Bookmark, BookmarkCheck, Copy, Check, Trash2, Download, Search, MessageSquare,
  Bot, User, ArrowRight, Filter, Plus, Maximize2, Minimize2, Edit2, X,
  History, FolderKanban
} from 'lucide-react';

//  ИСПРАВЛЕНО: Добавлен API_BASE
const API_BASE = import.meta.env.VITE_API_URL || '';

interface AIAssistantTabProps {
  user: UserProfile;
  lang: Language;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  onCompleteQuest?: (questId: string) => void;
  initialModule?: string;
}

// ... (PRESET_QUESTIONS и MODULE_CONFIG без изменений) ...

export const AIAssistantTab: React.FC<AIAssistantTabProps> = ({
  user, lang, onUpdateUser, onCompleteQuest, initialModule,
}) => {
  // ... (все стейты без изменений) ...

  // Load chats for user from server
  useEffect(() => {
    const userEmail = user.email || 'student@engineerus.kz';
    //  ИСПРАВЛЕНО: Добавлен API_BASE
    fetch(`${API_BASE}/api/chats/${encodeURIComponent(userEmail)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.chats && data.chats.length > 0) {
          setSessions(data.chats);
          setActiveSessionId(data.chats[0].id);
        } else {
          // create default session...
        }
      })
      .catch((err) => console.error(err));
  }, [user.email]);

  // Save current session to server
  const syncSessionToServer = async (updatedSession: ChatSession) => {
    try {
      //  ИСПРАВЛЕНО: Добавлен API_BASE
      await fetch(`${API_BASE}/api/chats/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, session: updatedSession }),
      });
    } catch (e) { console.error(e); }
  };

  const handleCreateNewChat = async () => {
    try {
      //  ИСПРАВЛЕНО: Добавлен API_BASE
      const res = await fetch(`${API_BASE}/api/chats/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, module: selectedModule, title: `...` }),
      });
      // ... обработка ответа ...
    } catch (e) {
      // fallback local...
    }
  };

  const handleDeleteChat = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Удалить чат?')) {
      try {
        //  ИСПРАВЛЕНО: Добавлен API_BASE
        const res = await fetch(`${API_BASE}/api/chats/${encodeURIComponent(user.email)}/${sessionId}`, {
          method: 'DELETE',
        });
        // ... обработка ответа ...
      } catch (err) {
        // локальное удаление...
      }
    }
  };

  const handleRenameChat = async (sessionId: string, title: string) => {
    if (!title.trim()) return;
    try {
      //  ИСПРАВЛЕНО: Добавлен API_BASE
      const res = await fetch(`${API_BASE}/api/chats/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, sessionId, newTitle: title }),
      });
      // ... обработка ответа ...
    } catch (err) {
      // локальное обновление...
    } finally {
      setEditingSessionId(null);
    }
  };

  const handleSendPrompt = async (textToSend?: string) => {
    // ... подготовка сообщения ...
    try {
      //  ИСПРАВЛЕНО: Добавлен API_BASE
      const res = await fetch(`${API_BASE}/api/module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module: selectedModule, text: query, lang, email: user.email }),
      });
      // ... обработка ответа ИИ ...
    } catch (err) {
      // обработка ошибки...
    } finally {
      setLoading(false);
    }
  };

  // ... остальной код компонента (JSX) без изменений ...
  return (/* ... */);
};