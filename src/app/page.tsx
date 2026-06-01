'use client';

import { useChat } from '@ai-sdk/react';
import { Send, Bot, User, Database, Loader2, Sparkles } from 'lucide-react';
import { JSX, useState, FormEvent } from 'react';

export default function Chat(): JSX.Element {
  const { messages, sendMessage, status, error } = useChat({
    onError: (err: Error) => {
      alert(`Chat connection error: ${err.message || 'Check your server status or API key configurations.'}`);
    }
  });

  const [input, setInput] = useState<string>('');

  const handleFormSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const currentInput = input;
    setInput(''); // Clear input immediately for responsive UI feedback
    
    try {
      await sendMessage({ text: currentInput });
    } catch (err: unknown) {
      console.error('Failed to send message:', err);
      // Restore input if sending failed so user doesn't lose text
      setInput(currentInput);
    }
  };

  const getMessageText = (m: any): string => {
    if (!m.parts || !Array.isArray(m.parts)) return '';
    return m.parts
      .filter((part: any) => part && part.type === 'text')
      .map((part: any) => part.text || '')
      .join('\n');
  };

  const isGenerating = status === 'submitted' || status === 'streaming';

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-100 font-sans">
      {/* Header */}
      <header className="p-5 border-b border-white/10 bg-white/[0.02] backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              IMDb AI Chatbot <Sparkles className="w-4 h-4 text-fuchsia-400 animate-pulse" />
            </h1>
            <p className="text-xs text-zinc-400 font-medium">Production-Grade RAG Engine (Active Sync)</p>
          </div>
        </div>
      </header>

      {/* Main Chat Feed */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full pb-32">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50 mt-20">
            <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center">
              <Bot className="w-8 h-8 text-zinc-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-300">Welcome to IMDb RAG!</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                Ask anything about the scraped IMDb lists (e.g. top world singers, top Indian singers, and associated details).
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-4 items-end ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role !== 'user' && (
                <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0 shadow-sm shadow-violet-900/10">
                  <Bot className="w-4 h-4 text-violet-400" />
                </div>
              )}
              <div
                className={`px-5 py-3.5 rounded-2xl max-w-[85%] text-[15px] leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-zinc-800 text-white border border-white/5 rounded-tr-sm'
                    : 'bg-white/5 text-zinc-200 border border-white/10 rounded-tl-sm'
                }`}
              >
                {getMessageText(m)}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-zinc-400" />
                </div>
              )}
            </div>
          ))
        )}
        {isGenerating && (
          <div className="flex gap-4 items-end justify-start animate-pulse">
            <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            </div>
            <div className="text-xs text-zinc-500 font-medium tracking-wide pb-1">Generating response...</div>
          </div>
        )}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <span>Failed to generate: {error.message}</span>
          </div>
        )}
      </main>

      {/* Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent pt-10">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl transition-all focus-within:border-violet-500/50 focus-within:bg-zinc-900"
          >
            <input
              className="flex-1 bg-transparent px-4 py-3 outline-none placeholder:text-zinc-500 text-[15px] text-white"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about the top singers, lists, or soundtracks..."
              disabled={isGenerating}
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="p-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-violet-900/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-[10px] text-zinc-600 mt-3 font-medium">
            Responses streamed using Google Gemini 1.5 Flash (Production Tier).
          </p>
        </div>
      </div>
    </div>
  );
}
