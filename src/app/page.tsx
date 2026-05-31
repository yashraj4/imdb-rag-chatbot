// @ts-nocheck
'use client';

import { useChat } from '@ai-sdk/react';
import { Send, Bot, User, Database, Loader2, Key } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Chat() {
  const [apiKey, setApiKey] = useState('');
  const [isKeySet, setIsKeySet] = useState(false);

  useEffect(() => {
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeySet(true);
    }
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    headers: {
      'x-api-key': apiKey,
    },
    onError: (err) => {
      if (err.message.includes('401') || err.message.includes('API key')) {
        alert("Invalid API Key or Insufficient Quota. Please check your OpenAI account.");
        handleClearKey();
      }
    }
  });

  const handleSaveKey = (e) => {
    e.preventDefault();
    if (apiKey.trim().startsWith('sk-')) {
      localStorage.setItem('openai_api_key', apiKey.trim());
      setIsKeySet(true);
    } else {
      alert('Please enter a valid OpenAI API key starting with "sk-"');
    }
  };

  const handleClearKey = () => {
    localStorage.removeItem('openai_api_key');
    setApiKey('');
    setIsKeySet(false);
  };

  if (!isKeySet) {
    return (
      <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-100 font-sans items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center">
              <Key className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Enter API Key</h1>
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            This application uses the Bring Your Own Key (BYOK) model. Your OpenAI API key is stored locally in your browser and is never saved on our servers.
          </p>
          <form onSubmit={handleSaveKey} className="space-y-4">
            <input
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-[15px] outline-none focus:border-violet-500/50 transition-all text-white placeholder:text-zinc-600"
              required
            />
            <button
              type="submit"
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl transition-all shadow-md shadow-violet-900/20"
            >
              Save Key & Start Chatting
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-100 font-sans">
      <header className="p-5 border-b border-white/10 bg-white/[0.02] backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Database className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">IMDb AI Chatbot</h1>
            <p className="text-xs text-zinc-400 font-medium">IMDb Data Indexed (OpenAI)</p>
          </div>
        </div>
        <button 
          onClick={handleClearKey}
          className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
        >
          Clear API Key
        </button>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-6 max-w-3xl mx-auto w-full pb-32">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-50 mt-20">
            <Bot className="w-16 h-16 text-zinc-600" />
            <p className="text-sm">Ask anything about the indexed IMDb Singers list.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex gap-4 items-end ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role !== 'user' && (
                 <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-violet-400" />
                </div>
              )}
              <div
                className={`px-5 py-3.5 rounded-2xl max-w-[85%] text-[15px] leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-zinc-800 text-white border border-white/5 rounded-tr-sm'
                    : 'bg-white/5 text-zinc-200 border border-white/10 rounded-tl-sm'
                }`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-zinc-400" />
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex gap-4 items-end justify-start">
             <div className="w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center shrink-0">
              <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            </div>
            <div className="text-xs text-zinc-500 font-medium tracking-wide pb-1">Thinking...</div>
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent pt-10">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 bg-zinc-900/80 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl transition-all focus-within:border-violet-500/50 focus-within:bg-zinc-900"
          >
            <input
              className="flex-1 bg-transparent px-4 py-3 outline-none placeholder:text-zinc-500 text-[15px]"
              value={input}
              onChange={handleInputChange}
              placeholder="Ask a question..."
            />
            <button
              type="submit"
              disabled={!input || isLoading}
              className="p-3.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-violet-900/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
          <p className="text-center text-[10px] text-zinc-600 mt-3 font-medium">
            Responses generated via OpenAI (GPT-4o-mini).
          </p>
        </div>
      </div>
    </div>
  );
}
