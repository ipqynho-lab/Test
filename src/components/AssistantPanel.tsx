import { Bot, Send, Trash2, X } from "lucide-react";
import React, { useRef, useState, useEffect } from "react";
import { generateAssistantReply } from "../lib/api";
import { AppState, Message } from "../types";
import { v4 as uuidv4 } from "uuid";

interface AssistantPanelProps {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
}

export function AssistantPanel({ state, updateState }: AssistantPanelProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const assistantMessages = state.assistantMessages || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [assistantMessages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg: Message = {
      id: uuidv4(),
      role: "user",
      content: input,
      timestamp: Date.now()
    };
    
    const newMessages = [...assistantMessages, userMsg];
    updateState({ assistantMessages: newMessages });
    setInput("");
    setIsLoading(true);

    try {
      const reply = await generateAssistantReply(state, input, assistantMessages);
      const assistantMsg: Message = {
        id: uuidv4(),
        role: "model",
        content: reply,
        timestamp: Date.now()
      };
      updateState({ assistantMessages: [...newMessages, assistantMsg] });
    } catch (e: any) {
      alert("Erro do Assistente: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    if (confirm("Limpar o chat do assistente? Isso não afeta o RPG.")) {
      updateState({ assistantMessages: [] });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-zinc-950 overflow-hidden border-t border-zinc-800">
      <div className="p-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 shrink-0">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Bot size={16} className="text-blue-400" /> Assistente Paralelo
        </h3>
        <button 
          onClick={handleClear}
          className="text-zinc-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-zinc-800"
          title="Limpar Chat do Assistente"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {assistantMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 text-center gap-2">
            <Bot size={32} className="opacity-50" />
            <p className="text-xs">Pergunte ideias, peça para gerar prompts Danbooru, analise as respostas ou peça conselhos para o RPG.</p>
          </div>
        ) : (
          assistantMessages.map(msg => (
            <div key={msg.id} className={`flex group ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`relative max-w-[90%] p-2.5 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200'} whitespace-pre-wrap`}>
                {msg.content}
                <button 
                  onClick={() => updateState({ assistantMessages: assistantMessages.filter(m => m.id !== msg.id) })}
                  className="absolute -top-2 -right-2 bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-red-400 p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Apagar mensagem"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800 p-2.5 rounded-lg text-sm text-zinc-400 italic">
              Pensando...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-2 border-t border-zinc-800 bg-zinc-900 flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ex: Como devo responder?"
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
        <button 
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2 rounded-md transition-colors flex items-center justify-center"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
