import React, { useEffect, useState } from "react";
import { Chat } from "./components/Chat";
import { Sidebar } from "./components/Sidebar";
import { loadState, saveState } from "./lib/storage";
import { AppState } from "./types";

export default function App() {
  const [state, setState] = useState<AppState>(loadState());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Sync state to local storage whenever it changes
  useEffect(() => {
    saveState(state);
    
    // Apply font size to html root to scale rem units
    const html = document.documentElement;
    html.classList.remove('text-size-sm', 'text-size-base', 'text-size-lg', 'text-size-xl');
    html.classList.add(`text-size-${state.theme?.fontSize || 'base'}`);
  }, [state]);

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const confirmClearChat = () => {
    updateState({ messages: [], backgroundSummary: "" });
    setShowClearConfirm(false);
  };

  const requestClearChat = () => {
    setShowClearConfirm(true);
  };

  return (
    <div className={`flex h-screen w-full ${state.theme?.mode === 'light' ? 'theme-light' : 'theme-dark'} overflow-hidden font-sans selection:bg-zinc-800`}>
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        state={state} 
        updateState={updateState}
        clearChat={requestClearChat}
      />
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <Chat 
        state={state} 
        updateState={updateState} 
        onOpenSidebar={() => setIsSidebarOpen(true)}
        clearChat={requestClearChat}
      />

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Limpar Sessão</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Tem certeza que deseja excluir todas as mensagens e limpar a sessão? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmClearChat}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-[#ffffff] rounded-md transition-colors"
              >
                Sim, Limpar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
