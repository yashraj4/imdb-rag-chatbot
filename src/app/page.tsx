'use client';

import { useChat } from '@ai-sdk/react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
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
    <div className="flex flex-col h-screen bg-black text-white font-sans selection:bg-white selection:text-black">
      {/* Header */}
      <header className="p-6 border-b border-zinc-800 bg-black sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white uppercase">
              IMDb AI Chatbot
            </h1>
          </div>
        </div>
      </header>

      {/* Main Chat Feed */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full pb-32">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-40 mt-20">
            <div className="w-12 h-12 rounded-full border border-zinc-800 flex items-center justify-center bg-zinc-950">
              <Bot className="w-6 h-6 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">IMDb Local Index Chat</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
                Query the indexed IMDb lists. Ask about singers, lists, soundtracks, or custom metadata entries.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-4 items-end ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role !== 'user' && (
                <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center bg-zinc-950 shrink-0">
                  <Bot className="w-4 h-4 text-zinc-400" />
                </div>
              )}
              <div
                className={`px-5 py-3.5 rounded-lg max-w-[85%] text-[15px] leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-zinc-900 text-white border border-zinc-800'
                    : 'bg-zinc-950 text-zinc-200 border border-zinc-800'
                }`}
              >
                {getMessageText(m)}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center bg-zinc-900 shrink-0">
                  <User className="w-4 h-4 text-zinc-400" />
                </div>
              )}
            </div>
          ))
        )}
        {isGenerating && (
          <div className="flex gap-4 items-end justify-start animate-pulse">
            <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center bg-zinc-950 shrink-0">
              <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
            </div>
            <div className="text-xs text-zinc-500 font-medium tracking-wide pb-1">Retrieving response...</div>
          </div>
        )}
        {error && (
          <div className="p-4 rounded bg-zinc-950 border border-red-900 text-xs text-red-400 flex items-center gap-2">
            <span>Error: {error.message}</span>
          </div>
        )}
      </main>

      {/* Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/90 border-t border-zinc-900 backdrop-blur-md pt-5">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleFormSubmit}
            className="flex items-center gap-2 bg-zinc-950 p-1.5 rounded-lg border border-zinc-800 focus-within:border-white transition-all duration-200"
          >
            <input
              className="flex-1 bg-transparent px-4 py-3 outline-none placeholder:text-zinc-600 text-[15px] text-white"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about top world singers, playlists..."
              disabled={isGenerating}
            />
            <button
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="p-3.5 bg-white text-black hover:bg-zinc-200 rounded-md transition-all duration-150 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed shadow-md"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <p className="text-center text-[10px] text-zinc-500 mt-3 font-medium uppercase tracking-widest">
            Local Search Integration & Gemini Cloud Router
          </p>
        </div>
      </div>
    </div>
  );
}
