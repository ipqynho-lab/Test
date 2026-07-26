import { Settings2, Upload, FileJson, X, Paintbrush, User, Cpu, FileText, Plus, Trash2, Edit2, Save, ChevronLeft, Download, BookOpen, Image as ImageIcon, Bot, Music } from "lucide-react";
import React, { useRef, useState } from "react";
import { AppState, Character, LorebookEntry, ThemeSettings } from "../types";
import { estimateTokens } from "../lib/prompt";
import { generateTTS } from "../lib/tts";
import { ComfyUISettingsPanel } from "./ComfyUISettingsPanel";
import { AssistantPanel } from "./AssistantPanel";

const parsePngChara = (buffer: ArrayBuffer): any => {
  const uint8Array = new Uint8Array(buffer);
  const textDecoder = new TextDecoder("utf-8");
  let offset = 8; // Skip PNG signature
  
  while (offset < uint8Array.length) {
      if (offset + 8 > uint8Array.length) break;
      const length = new DataView(buffer, offset, 4).getUint32(0, false);
      const type = textDecoder.decode(new Uint8Array(buffer, offset + 4, 4));
      
      if (type === "tEXt") {
          const chunkData = new Uint8Array(buffer, offset + 8, length);
          let keywordEnd = 0;
          while (keywordEnd < chunkData.length && chunkData[keywordEnd] !== 0) {
              keywordEnd++;
          }
          const keyword = textDecoder.decode(chunkData.slice(0, keywordEnd));
          if (keyword === "chara") {
              const text = textDecoder.decode(chunkData.slice(keywordEnd + 1));
              try {
                  const decoded = atob(text);
                  return JSON.parse(decoded);
              } catch(e) {
                  return JSON.parse(text);
              }
          }
      }
      
      offset += 4 + 4 + length + 4; // length + type + data + crc
  }
  return null;
};

const parseLorebookJson = (json: any): LorebookEntry[] => {
  const entries: LorebookEntry[] = [];
  let rawItems: any = null;

  if (json && typeof json === "object") {
    if (json.entries) {
      rawItems = json.entries;
    } else {
      rawItems = json;
    }
  }

  if (!rawItems) return [];

  let itemsArray: any[] = [];
  if (Array.isArray(rawItems)) {
    itemsArray = rawItems;
  } else if (typeof rawItems === "object") {
    itemsArray = Object.values(rawItems);
  }

  for (const item of itemsArray) {
    if (!item || typeof item !== "object") continue;

    let rawKeys = item.keys || item.key || [];
    let keysList: string[] = [];
    if (Array.isArray(rawKeys)) {
      keysList = rawKeys.map((k: any) => String(k).trim()).filter(Boolean);
    } else if (typeof rawKeys === "string") {
      keysList = rawKeys.split(",").map((k: string) => k.trim()).filter(Boolean);
    }

    const content = item.content || item.entry || item.comment || "";

    entries.push({
      keys: keysList,
      content: String(content)
    });
  }

  return entries;
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  clearChat: () => void;
}

type Tab = "character" | "user" | "api" | "theme" | "comfyui" | "assistant";

export function Sidebar({ isOpen, onClose, state, updateState, clearChat }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<Tab>("character");
  const [isGeneratingFullAudio, setIsGeneratingFullAudio] = useState(false);
  
  const characterFileRef = useRef<HTMLInputElement>(null);
  const lorebookFileRef = useRef<HTMLInputElement>(null);
  const charAvatarRef = useRef<HTMLInputElement>(null);
  const userAvatarRef = useRef<HTMLInputElement>(null);
  const charSpecificFileRef = useRef<HTMLInputElement>(null);
  const charSpecificLorebookFileRef = useRef<HTMLInputElement>(null);

  const [charSubTab, setCharSubTab] = useState<"library" | "editor" | "collab">("library");
  const [editingCharId, setEditingCharId] = useState<string | null>(state.character.id || "char-assistant");
  const [showSwitchConfirm, setShowSwitchConfirm] = useState<Character | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Character | null>(null);

  const charactersList = state.characters || [];

  const [isCustomModel, setIsCustomModel] = useState(false);
  const [isCustomTtsModel, setIsCustomTtsModel] = useState(false);

  const handleGenerateFullAudio = async () => {
    if (!state.settings.tts) return;
    setIsGeneratingFullAudio(true);
    try {
      const fullText = state.messages
        .filter(m => m.role === 'user' || m.role === 'model')
        .map(m => m.content)
        .join('\n\n');
      
      const lastModelMessage = state.messages.filter(m => m.role === 'model').pop();
      
      const audioUrl = await generateTTS(fullText, state.settings.tts, lastModelMessage?.ttsParams);
      updateState({ fullAudioUrl: audioUrl });
    } catch (error: any) {
      console.error(error);
      alert("Erro ao gerar áudio: " + (error.message || error));
    } finally {
      setIsGeneratingFullAudio(false);
    }
  };

  const processImportedCharacter = (json: any, avatarUrl?: string) => {
    const charData = json.data || json;
    const newId = "char-" + Math.random().toString(36).substring(2, 9);
    const newChar: Character = {
      id: newId,
      name: charData.name || "Personagem Importado",
      description: charData.description || "",
      personality: charData.personality || "",
      scenario: charData.scenario || "",
      first_mes: charData.first_mes || "",
      mes_example: charData.mes_example || "",
      system_prompt: charData.system_prompt || "",
      post_history_instructions: charData.post_history_instructions || "",
      avatar: avatarUrl || charData.avatar || null,
      lorebook: charData.lorebook || [],
    };
    
    const existingList = state.characters || [];
    const updatedList = [...existingList, newChar];
    
    updateState({ 
      character: newChar,
      characters: updatedList,
      messages: [],
      backgroundSummary: ""
    });
    
    setEditingCharId(newId);
    setCharSubTab("editor");
    alert(`Personagem "${newChar.name}" importado com sucesso!`);
  };

  const handleCharacterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.png')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        try {
          const json = parsePngChara(buffer);
          if (json) {
            const avatarUrl = URL.createObjectURL(file);
            processImportedCharacter(json, avatarUrl);
          } else {
            alert("Nenhum dado de personagem encontrado neste arquivo PNG. Verifique se é um cartão V2 válido.");
          }
        } catch(err) {
          alert("Erro ao ler dados do PNG.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target?.result as string);
          processImportedCharacter(json);
        } catch (err) {
          alert("JSON de personagem inválido");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleSwitchCharacter = (char: Character, shouldClearChat: boolean) => {
    if (shouldClearChat) {
      updateState({
        character: char,
        messages: [],
        backgroundSummary: ""
      });
    } else {
      updateState({
        character: char
      });
    }
    setEditingCharId(char.id || null);
    setShowSwitchConfirm(null);
  };

  const handleSaveCharacter = () => {
    const list = [...(state.characters || [])];
    const currentChar = { ...state.character };
    
    let targetId = editingCharId || currentChar.id;
    if (!targetId) {
      targetId = "char-" + Math.random().toString(36).substring(2, 9);
    }
    
    currentChar.id = targetId;
    
    const existingIndex = list.findIndex(c => c.id === targetId);
    if (existingIndex >= 0) {
      list[existingIndex] = currentChar;
      alert(`Personagem "${currentChar.name}" atualizado na biblioteca!`);
    } else {
      list.push(currentChar);
      alert(`Personagem "${currentChar.name}" salvo na biblioteca!`);
    }
    
    setEditingCharId(targetId);
    updateState({
      character: currentChar,
      characters: list
    });
  };

  const handleCreateNew = () => {
    const newId = "char-" + Math.random().toString(36).substring(2, 9);
    const newChar: Character = {
      id: newId,
      name: "Novo Personagem",
      description: "",
      personality: "",
      scenario: "",
      first_mes: "Olá, como posso ajudar?",
      mes_example: "",
      system_prompt: "",
      post_history_instructions: "",
      avatar: null,
    };
    
    setEditingCharId(newId);
    updateState({
      character: newChar
    });
    setCharSubTab("editor");
  };

  const handleDeleteCharacter = (charToDelete: Character) => {
    const list = (state.characters || []).filter(c => c.id !== charToDelete.id);
    
    let activeChar = state.character;
    if (state.character.id === charToDelete.id) {
      if (list.length > 0) {
        activeChar = list[0];
      } else {
        const defaultChar: Character = {
          id: "char-assistant",
          name: "Assistant",
          description: "A helpful AI assistant.",
          personality: "Helpful, polite, and concise.",
          scenario: "Standard AI chat assistance.",
          first_mes: "Hello! How can I help you today?",
          mes_example: "",
          system_prompt: "",
          post_history_instructions: "",
          avatar: null,
        };
        activeChar = defaultChar;
        list.push(defaultChar);
      }
    }
    
    updateState({
      characters: list,
      character: activeChar,
      messages: activeChar.id !== state.character.id ? [] : state.messages
    });
    
    setShowDeleteConfirm(null);
    alert(`Personagem "${charToDelete.name}" removido da biblioteca.`);
  };

  const handleExportJson = (char: Character) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(char, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${char.name.toLowerCase().replace(/\s+/g, "_")}_card.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleLorebookUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const entries = parseLorebookJson(json);
        if (entries.length === 0) {
          alert("Nenhuma entrada válida encontrada no Lorebook JSON.");
          return;
        }
        updateState({ lorebook: entries });
        alert(`Sucesso! Carregadas ${entries.length} entradas de lorebook globais.`);
      } catch (err) {
        alert("JSON de lorebook inválido ou incompatível");
      }
    };
    reader.readAsText(file);
  };

  const handleCharacterImportInEditor = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.png')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const buffer = ev.target?.result as ArrayBuffer;
        try {
          const json = parsePngChara(buffer);
          if (json) {
            const charData = json.data || json;
            const avatarUrl = URL.createObjectURL(file);
            updateState({
              character: {
                ...state.character,
                name: charData.name || state.character.name,
                description: charData.description || "",
                personality: charData.personality || "",
                scenario: charData.scenario || "",
                first_mes: charData.first_mes || "",
                mes_example: charData.mes_example || "",
                system_prompt: charData.system_prompt || "",
                post_history_instructions: charData.post_history_instructions || "",
                avatar: avatarUrl,
                lorebook: charData.lorebook || state.character.lorebook || [],
              }
            });
            alert(`Dados do personagem "${charData.name || 'Sem Nome'}" importados!`);
          } else {
            alert("Nenhum dado de personagem encontrado neste PNG.");
          }
        } catch(err) {
          alert("Erro ao ler dados do PNG.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const json = JSON.parse(ev.target?.result as string);
          const charData = json.data || json;
          updateState({
            character: {
              ...state.character,
              name: charData.name || state.character.name,
              description: charData.description || "",
              personality: charData.personality || "",
              scenario: charData.scenario || "",
              first_mes: charData.first_mes || "",
              mes_example: charData.mes_example || "",
              system_prompt: charData.system_prompt || "",
              post_history_instructions: charData.post_history_instructions || "",
              avatar: charData.avatar || state.character.avatar,
              lorebook: charData.lorebook || state.character.lorebook || [],
            }
          });
          alert(`Dados do personagem "${charData.name || 'Sem Nome'}" importados para o formulário!`);
        } catch (err) {
          alert("JSON de personagem inválido");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleCharacterLorebookUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        const entries = parseLorebookJson(json);
        if (entries.length === 0) {
          alert("Nenhuma entrada válida encontrada no Lorebook JSON.");
          return;
        }
        updateState({ 
          character: {
            ...state.character,
            lorebook: entries
          }
        });
        alert(`Sucesso! Carregadas ${entries.length} entradas de lorebook exclusivas para o personagem "${state.character.name}".`);
      } catch (err) {
        alert("JSON de lorebook inválido ou incompatível");
      }
    };
    reader.readAsText(file);
  };

  const handleAddNewCharLoreEntry = () => {
    const currentLore = state.character.lorebook || [];
    const updatedLore = [...currentLore, { keys: ["chave"], content: "fato relevante..." }];
    updateState({
      character: {
        ...state.character,
        lorebook: updatedLore
      }
    });
  };

  const handleRemoveCharLoreEntry = (indexToRemove: number) => {
    const currentLore = state.character.lorebook || [];
    const updatedLore = currentLore.filter((_, idx) => idx !== indexToRemove);
    updateState({
      character: {
        ...state.character,
        lorebook: updatedLore
      }
    });
  };

  const handleUpdateCharLoreEntryKeys = (indexToUpdate: number, rawKeys: string) => {
    const currentLore = state.character.lorebook || [];
    const keysArray = rawKeys.split(",").map(k => k.trim()).filter(k => k.length > 0);
    const updatedLore = currentLore.map((entry, idx) => {
      if (idx === indexToUpdate) {
        return { ...entry, keys: keysArray };
      }
      return entry;
    });
    updateState({
      character: {
        ...state.character,
        lorebook: updatedLore
      }
    });
  };

  const handleUpdateCharLoreEntryContent = (indexToUpdate: number, newContent: string) => {
    const currentLore = state.character.lorebook || [];
    const updatedLore = currentLore.map((entry, idx) => {
      if (idx === indexToUpdate) {
        return { ...entry, content: newContent };
      }
      return entry;
    });
    updateState({
      character: {
        ...state.character,
        lorebook: updatedLore
      }
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, isUser: boolean) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          if (isUser) {
              updateState({ user: { ...state.user, avatar: ev.target?.result as string }});
          } else {
              updateState({ character: { ...state.character, avatar: ev.target?.result as string }});
          }
      };
      reader.readAsDataURL(file);
  }

  const updateTheme = (updates: Partial<ThemeSettings>) => {
    updateState({ theme: { ...state.theme, ...updates } });
  };

  const geminiModels = [
    "antigravity-preview-05-2026", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite",
    "gemma-4-31b-it", "gemma-4-26b-a4b-it", "gemma-3n-e4b-it", "gemma-3n-e2b-it",
    "gemma-3-27b-it", "gemma-3-12b-it", "gemma-3-4b-it", "gemma-3-1b-it",
    "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite", "gemini-2.5-flash"
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-zinc-900 border-r border-zinc-800 transform transition-transform duration-300 ease-in-out overflow-hidden flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0`}>
      <div className="p-4 border-b border-zinc-800 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2 text-white">
            <Settings2 size={20} /> Settings
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md" title="Estimated Tokens">
              ~{estimateTokens(state)} tokens
            </span>
            <button onClick={onClose} className="md:hidden text-zinc-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-950 p-1 rounded-lg">
          <button onClick={() => setActiveTab("character")} className={`flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'character' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="Character">
            <FileText size={16} />
          </button>
          <button onClick={() => setActiveTab("user")} className={`flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'user' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="User">
            <User size={16} />
          </button>
          <button onClick={() => setActiveTab("theme")} className={`flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'theme' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="Theme">
            <Paintbrush size={16} />
          </button>
          <button onClick={() => setActiveTab("api")} className={`flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'api' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="API">
            <Cpu size={16} />
          </button>
          <button onClick={() => setActiveTab("comfyui")} className={`flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'comfyui' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="ComfyUI Image Gen">
            <ImageIcon size={16} />
          </button>
          <button onClick={() => setActiveTab("assistant")} className={`flex-1 flex justify-center py-1.5 rounded-md transition-colors ${activeTab === 'assistant' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} title="Assistente Paralelo">
            <Bot size={16} />
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto flex flex-col text-zinc-300 ${activeTab === 'assistant' ? '' : 'p-4 gap-6'}`}>
        {activeTab === "character" && (
          <section className="space-y-4">
            {/* Sub Tabs for Character: Library vs Editor */}
            <div className="flex border-b border-zinc-800 pb-2 mb-2 gap-4">
              <button 
                onClick={() => setCharSubTab("library")} 
                className={`text-xs pb-1 font-semibold transition-colors border-b-2 ${charSubTab === 'library' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                Biblioteca ({charactersList.length})
              </button>
              <button 
                onClick={() => {
                  setEditingCharId(state.character.id || null);
                  setCharSubTab("editor");
                }} 
                className={`text-xs pb-1 font-semibold transition-colors border-b-2 ${charSubTab === 'editor' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                Editar Ativo
              </button>
              <button 
                onClick={() => setCharSubTab("collab")} 
                className={`text-xs pb-1 font-semibold transition-colors border-b-2 ${charSubTab === 'collab' ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                Colaboração
              </button>
            </div>

            {charSubTab === "library" ? (
              <div className="space-y-3">
                {/* Actions Row */}
                <div className="flex gap-2">
                  <button 
                    onClick={handleCreateNew}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-[#ffffff] py-1.5 px-3 rounded flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus size={14} /> Novo Personagem
                  </button>
                  <button 
                    onClick={() => characterFileRef.current?.click()}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-3 rounded flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ImageIcon size={14} /> / <FileJson size={14} /> Importar Cartão
                  </button>
                </div>
                <input type="file" accept=".json,.png" hidden ref={characterFileRef} onChange={handleCharacterUpload} />

                {/* Character List */}
                <div className="space-y-2 mt-2 max-h-[360px] overflow-y-auto pr-1">
                  {charactersList.map((char) => {
                    const isActive = state.character.id === char.id || state.character.name === char.name;
                    return (
                      <div 
                        key={char.id || char.name}
                        className={`p-3 rounded-lg border transition-all ${isActive ? 'bg-zinc-850 border-blue-500/50 shadow-md' : 'bg-zinc-950/40 border-zinc-800 hover:border-zinc-700'}`}
                      >
                        <div className="flex gap-3 items-center">
                          <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center text-xs font-bold text-zinc-400">
                            {char.avatar ? (
                              <img src={char.avatar} alt={char.name} className="w-full h-full object-cover" />
                            ) : (
                              char.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-semibold text-white truncate">{char.name}</h4>
                            <p className="text-xs text-zinc-400 truncate mt-0.5">
                              {char.description || char.personality || "Sem descrição"}
                            </p>
                          </div>
                        </div>

                        {/* Card Footer Actions */}
                        <div className="flex gap-2 mt-3 pt-2 border-t border-zinc-800/50 justify-between items-center">
                          <button 
                            onClick={() => setShowSwitchConfirm(char)}
                            className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1 font-medium cursor-pointer ${isActive ? 'bg-zinc-800 text-zinc-400 border border-zinc-700 pointer-events-none' : 'bg-blue-950/60 hover:bg-blue-900/60 text-blue-300'}`}
                          >
                            <BookOpen size={12} /> {isActive ? "Ativo" : "Conversar"}
                          </button>
                          
                          <div className="flex gap-1">
                            <button 
                              onClick={() => {
                                setEditingCharId(char.id || null);
                                updateState({ character: char });
                                setCharSubTab("editor");
                              }}
                              title="Editar"
                              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button 
                              onClick={() => handleExportJson(char)}
                              title="Exportar JSON"
                              className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            >
                              <Download size={13} />
                            </button>
                            <button 
                              onClick={() => setShowDeleteConfirm(char)}
                              title="Excluir"
                              className="p-1 hover:bg-red-950/40 rounded text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-zinc-800/60 mt-4 space-y-2">
                  <div className="flex gap-2">
                    <button onClick={() => lorebookFileRef.current?.click()} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-1.5 px-3 rounded flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer">
                      <FileJson size={14} /> Importar Lorebook JSON
                    </button>
                    <button 
                      onClick={() => {
                        const template = [
                          { keys: ["espada", "excalibur", "arma"], content: "A espada lendária Excalibur brilha com uma luz azulada e tem o poder de cortar qualquer metal." },
                          { keys: ["reino", "camelot", "castelo"], content: "O reino de Camelot é governado com justiça, sendo protegido por muralhas impenetráveis." }
                        ];
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(template, null, 2));
                        const downloadAnchor = document.createElement('a');
                        downloadAnchor.setAttribute("href", dataStr);
                        downloadAnchor.setAttribute("download", "modelo_lorebook.json");
                        document.body.appendChild(downloadAnchor);
                        downloadAnchor.click();
                        downloadAnchor.remove();
                      }}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 p-2 rounded flex items-center justify-center transition-colors cursor-pointer border border-transparent"
                      title="Baixar Modelo/Template de Lorebook JSON"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                  <input type="file" accept=".json" hidden ref={lorebookFileRef} onChange={handleLorebookUpload} />
                  <div className="text-xs text-zinc-500 text-center">{state.lorebook.length} entradas de lorebook carregadas</div>
                </div>
              </div>
            ) : charSubTab === "editor" ? (
              /* Character Editor Form */
              <div className="space-y-4">
                {/* Character JSON Import specifically inside Editor */}
                <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-zinc-300">Ficha do Personagem (JSON)</span>
                    <span className="text-[10px] text-zinc-500">Substituir campos</span>
                  </div>
                  <button 
                    onClick={() => charSpecificFileRef.current?.click()}
                    className="w-full bg-zinc-850 hover:bg-zinc-800 text-zinc-300 py-1.5 px-3 rounded flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer border border-zinc-750"
                  >
                    <ImageIcon size={14} /> / <FileJson size={14} /> Importar Ficha JSON/PNG
                  </button>
                  <input type="file" accept=".json,.png" hidden ref={charSpecificFileRef} onChange={handleCharacterImportInEditor} />
                </div>

                <div className="flex gap-4 items-center">
                  <div className="relative group cursor-pointer w-16 h-16 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 flex-shrink-0" onClick={() => charAvatarRef.current?.click()}>
                    {state.character.avatar ? (
                       <img src={state.character.avatar} alt="Char Avatar" className="w-full h-full object-cover" />
                    ) : (
                       <div className="flex items-center justify-center h-full text-zinc-500 text-xs text-center">Sem Foto</div>
                    )}
                    <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center">
                       <Upload size={16} className="text-[#ffffff]" />
                    </div>
                  </div>
                  <div className="flex-1">
                      <label className="block text-xs mb-1 text-zinc-400">Nome</label>
                      <input 
                        type="text" 
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                        value={state.character.name}
                        onChange={(e) => updateState({ character: { ...state.character, name: e.target.value }})}
                      />
                  </div>
                  <input type="file" accept="image/*" hidden ref={charAvatarRef} onChange={(e) => handleImageUpload(e, false)} />
                </div>

                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Descrição (Fatos/História)</label>
                  <textarea 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
                    rows={3}
                    placeholder="Fatos históricos, segredos sobre o personagem..."
                    value={state.character.description || ""}
                    onChange={(e) => updateState({ character: { ...state.character, description: e.target.value }})}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Personalidade</label>
                  <textarea 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
                    rows={3}
                    placeholder="Traços de comportamento, gostos, falas..."
                    value={state.character.personality || ""}
                    onChange={(e) => updateState({ character: { ...state.character, personality: e.target.value }})}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Cenário</label>
                  <textarea 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
                    rows={2}
                    placeholder="A situação atual em que se encontram..."
                    value={state.character.scenario || ""}
                    onChange={(e) => updateState({ character: { ...state.character, scenario: e.target.value }})}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Primeira Mensagem</label>
                  <textarea 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
                    rows={3}
                    placeholder="Mensagem inicial enviada pelo personagem..."
                    value={state.character.first_mes || ""}
                    onChange={(e) => updateState({ character: { ...state.character, first_mes: e.target.value }})}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Exemplos de Diálogo</label>
                  <textarea 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
                    rows={3}
                    placeholder="<START>&#10;User: Olá!&#10;Char: Saudações!"
                    value={state.character.mes_example || ""}
                    onChange={(e) => updateState({ character: { ...state.character, mes_example: e.target.value }})}
                  />
                </div>

                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Prompt de Sistema Personalizado</label>
                  <textarea 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
                    rows={2}
                    placeholder="Regras extras que orientam as respostas do personagem..."
                    value={state.character.system_prompt || ""}
                    onChange={(e) => updateState({ character: { ...state.character, system_prompt: e.target.value }})}
                  />
                </div>

                {/* Lorebook Exclusivo do Personagem */}
                <div className="pt-4 border-t border-zinc-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <h5 className="text-xs font-semibold text-zinc-300">Lorebook Exclusivo do Personagem</h5>
                    <span className="text-[10px] text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">Isolado</span>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Insira palavras-chave e fatos do mundo específicos que só serão ativados quando este personagem estiver em uso.
                  </p>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => charSpecificLorebookFileRef.current?.click()}
                      className="flex-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 py-1.5 px-2 rounded flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer"
                    >
                      <FileJson size={13} /> Importar Lorebook
                    </button>
                    <button 
                      onClick={() => {
                        const currentLore = state.character.lorebook || [];
                        const dataToDownload = currentLore.length > 0 ? currentLore : [
                          { keys: ["exemplo", "palavra"], content: "Este é um exemplo de conteúdo do Lorebook do personagem." }
                        ];
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToDownload, null, 2));
                        const downloadAnchor = document.createElement('a');
                        downloadAnchor.setAttribute("href", dataStr);
                        downloadAnchor.setAttribute("download", `${(state.character.name || "personagem").toLowerCase().replace(/\s+/g, '_')}_lorebook.json`);
                        document.body.appendChild(downloadAnchor);
                        downloadAnchor.click();
                        downloadAnchor.remove();
                      }}
                      className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 p-1.5 rounded flex items-center justify-center transition-colors cursor-pointer"
                      title="Exportar / Baixar Lorebook do Personagem"
                    >
                      <Download size={13} />
                    </button>
                    <button 
                      onClick={handleAddNewCharLoreEntry}
                      className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-300 p-1.5 rounded flex items-center justify-center transition-colors cursor-pointer"
                      title="Adicionar Entrada Manual"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <input type="file" accept=".json" hidden ref={charSpecificLorebookFileRef} onChange={handleCharacterLorebookUpload} />
                  
                  {/* List/Edit manual entries */}
                  {state.character.lorebook && state.character.lorebook.length > 0 ? (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {state.character.lorebook.map((entry, index) => (
                        <div key={index} className="p-2.5 bg-zinc-950 rounded border border-zinc-900 space-y-2 text-[11px]">
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500 font-mono">Entrada #{index + 1}</span>
                            <button 
                              onClick={() => handleRemoveCharLoreEntry(index)}
                              className="text-red-500 hover:text-red-400 p-0.5 rounded hover:bg-zinc-900"
                              title="Remover Entrada"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-500 block mb-0.5">Palavras-chave (separadas por vírgula)</label>
                            <input 
                              type="text"
                              value={entry.keys.join(", ")}
                              onChange={(e) => handleUpdateCharLoreEntryKeys(index, e.target.value)}
                              placeholder="ex: espada, excalibur, rei"
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white outline-none focus:border-zinc-700"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-zinc-500 block mb-0.5">Fato ou Conteúdo</label>
                            <textarea 
                              value={entry.content}
                              onChange={(e) => handleUpdateCharLoreEntryContent(index, e.target.value)}
                              placeholder="Descreva a informação ou segredo a ser inserido no prompt quando as chaves forem citadas..."
                              rows={2}
                              className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white outline-none resize-y focus:border-zinc-700"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-3 border border-dashed border-zinc-800 rounded text-zinc-600 text-xs">
                      Nenhum Lorebook importado para este personagem.
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={handleSaveCharacter}
                    className="flex-1 bg-green-700 hover:bg-green-600 text-[#ffffff] py-2 px-3 rounded flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Save size={14} /> Salvar na Biblioteca
                  </button>
                  <button 
                    onClick={() => setCharSubTab("library")}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 py-2 px-3 rounded text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800">
                  <h4 className="text-sm font-semibold text-white mb-2">Modo Colaboração (Grupo)</h4>
                  <p className="text-xs text-zinc-400 mb-3">Selecione vários personagens para interagir simultaneamente.</p>
                  
                  <label className="flex items-center gap-2 mb-4 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={state.isCollabMode || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const updates: Partial<AppState> = { isCollabMode: checked };
                        if (checked) {
                          // Activate all characters by default
                          const allIds = [state.character, ...(state.characters || [])]
                            .map(c => c.id)
                            .filter((id): id is string => !!id);
                          updates.activeCharacterIds = Array.from(new Set(allIds));
                        }
                        updateState(updates);
                      }}
                      className="rounded bg-zinc-900 border-zinc-700 w-4 h-4"
                    />
                    <span className="text-sm text-zinc-300 font-medium">Ativar Modo Colaboração</span>
                  </label>

                  {state.isCollabMode && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h5 className="text-xs font-semibold text-zinc-400">Personagens no Grupo:</h5>
                        <div className="flex gap-2">
                          <button 
                            className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors"
                            onClick={() => {
                              const allIds = charactersList.map(c => c.id).filter((id): id is string => !!id);
                              updateState({ activeCharacterIds: Array.from(new Set(allIds)) });
                            }}
                          >
                            Todos
                          </button>
                          <button 
                            className="text-[10px] bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded transition-colors"
                            onClick={() => {
                              updateState({ activeCharacterIds: [state.character.id].filter((id): id is string => !!id) });
                            }}
                          >
                            Limpar
                          </button>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-1">
                        {charactersList.map(char => {
                          const isActive = state.activeCharacterIds?.includes(char.id!) || state.character.id === char.id;
                          return (
                            <label key={char.id} className="flex items-center gap-3 p-2 hover:bg-zinc-800/50 rounded cursor-pointer transition-colors">
                              <input 
                                type="checkbox"
                                checked={isActive}
                                disabled={state.character.id === char.id}
                                onChange={(e) => {
                                  const currentActive = state.activeCharacterIds || [state.character.id!];
                                  if (e.target.checked) {
                                    updateState({ activeCharacterIds: [...currentActive, char.id!] });
                                  } else {
                                    updateState({ activeCharacterIds: currentActive.filter(id => id !== char.id) });
                                  }
                                }}
                                className="rounded bg-zinc-900 border-zinc-700"
                              />
                              <div className="w-6 h-6 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex-shrink-0">
                                {char.avatar ? (
                                  <img src={char.avatar} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                    {char.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <span className="text-sm text-zinc-300 truncate flex-1">{char.name}</span>
                              {state.character.id === char.id && (
                                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">Principal</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === "user" && (
          <section className="space-y-4">
            <div className="flex gap-4 items-center">
               <div className="relative group cursor-pointer w-16 h-16 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 flex-shrink-0" onClick={() => userAvatarRef.current?.click()}>
                {state.user.avatar ? (
                   <img src={state.user.avatar} alt="User Avatar" className="w-full h-full object-cover" />
                ) : (
                   <div className="flex items-center justify-center h-full text-zinc-500 text-xs text-center">No Image</div>
                )}
                 <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center">
                   <Upload size={16} className="text-[#ffffff]" />
                </div>
              </div>
              <div className="flex-1">
                  <label className="block text-xs mb-1 text-zinc-400">Your Name</label>
                  <input 
                    type="text" 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none"
                    value={state.user.name}
                    onChange={(e) => updateState({ user: { ...state.user, name: e.target.value }})}
                  />
              </div>
              <input type="file" accept="image/*" hidden ref={userAvatarRef} onChange={(e) => handleImageUpload(e, true)} />
            </div>

            <div>
              <label className="block text-xs mb-1 text-zinc-400">About You (Persona)</label>
              <textarea 
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-2 text-sm text-white focus:border-blue-500 outline-none resize-y"
                rows={4}
                placeholder="Describe yourself to the character..."
                value={state.user.persona || ""}
                onChange={(e) => updateState({ user: { ...state.user, persona: e.target.value }})}
              />
            </div>
            
            <div>
              <label className="block text-xs mb-1 text-zinc-400">Sua Voz (TTS)</label>
              <select
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white outline-none"
                value={state.user.voice || "Aoede"}
                onChange={(e) => updateState({ user: { ...state.user, voice: e.target.value }})}
              >
                <optgroup label="Femininas (Female)">
                  <option value="Aoede">Aoede</option>
                  <option value="Autonoe">Autonoe</option>
                  <option value="Callirrhoe">Callirrhoe</option>
                  <option value="Despina">Despina</option>
                  <option value="Erinome">Erinome</option>
                  <option value="Kore">Kore</option>
                  <option value="Laomedeia">Laomedeia</option>
                  <option value="Leda">Leda</option>
                  <option value="Pulcherrima">Pulcherrima</option>
                  <option value="Vindemiatrix">Vindemiatrix</option>
                </optgroup>
                <optgroup label="Masculinas / Neutras (Male/Neutral)">
                  <option value="Achernar">Achernar</option>
                  <option value="Achird">Achird</option>
                  <option value="Algenib">Algenib</option>
                  <option value="Algieba">Algieba</option>
                  <option value="Alnilam">Alnilam</option>
                  <option value="Charon">Charon</option>
                  <option value="Enceladus">Enceladus</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Gacrux">Gacrux</option>
                  <option value="Iapetus">Iapetus</option>
                  <option value="Orus">Orus</option>
                  <option value="Puck">Puck</option>
                  <option value="Rasalgethi">Rasalgethi</option>
                  <option value="Sadachbia">Sadachbia</option>
                  <option value="Sadaltager">Sadaltager</option>
                  <option value="Schedar">Schedar</option>
                  <option value="Sulafat">Sulafat</option>
                  <option value="Umbriel">Umbriel</option>
                  <option value="Zephyr">Zephyr</option>
                  <option value="Zubenelgenubi">Zubenelgenubi</option>
                </optgroup>
              </select>
            </div>
          </section>
        )}

        {activeTab === "theme" && (
          <section className="space-y-4">
            <div className="space-y-3">
                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Modo</label>
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                    value={state.theme.mode || "dark"}
                    onChange={(e) => {
                       const newMode = e.target.value as "dark" | "light";
                       if (newMode === "light") {
                          updateTheme({ 
                              mode: "light",
                              appBackground: "#ffffff",
                              primaryColor: "#3b82f6",
                              generalText: "#18181b",
                              userBubble: "#e0e7ff",
                              charBubble: "#f4f4f5",
                              inputBar: "#ffffff"
                          });
                       } else {
                          updateTheme({ 
                              mode: "dark",
                              appBackground: "#09090b",
                              primaryColor: "#3b82f6",
                              generalText: "#e4e4e7",
                              userBubble: "#1e3a8a",
                              charBubble: "#18181b",
                              inputBar: "#09090b"
                          });
                       }
                    }}
                  >
                    <option value="dark">Escuro (Padrão)</option>
                    <option value="light">Claro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Tamanho da Fonte</label>
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                    value={state.theme.fontSize || "base"}
                    onChange={(e) => updateTheme({ fontSize: e.target.value as "sm" | "base" | "lg" | "xl" })}
                  >
                    <option value="sm">Pequeno</option>
                    <option value="base">Médio (Padrão)</option>
                    <option value="lg">Grande</option>
                    <option value="xl">Muito Grande</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1 text-zinc-400">Tamanho do Avatar</label>
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                    value={state.theme.avatarSize || "md"}
                    onChange={(e) => updateTheme({ avatarSize: e.target.value as "sm" | "md" | "lg" | "xl" })}
                  >
                    <option value="sm">Pequeno</option>
                    <option value="md">Médio (Padrão)</option>
                    <option value="lg">Grande</option>
                    <option value="xl">Muito Grande</option>
                  </select>
                </div>
               <div>
                  <label className="block text-xs mb-1 text-zinc-400">App Background</label>
                  <div className="flex gap-2">
                      <input type="color" value={state.theme.appBackground} onChange={(e) => updateTheme({ appBackground: e.target.value })} className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 cursor-pointer p-0" />
                      <input type="text" value={state.theme.appBackground} onChange={(e) => updateTheme({ appBackground: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white font-mono" />
                  </div>
               </div>
               <div>
                  <label className="block text-xs mb-1 text-zinc-400">Primary Color</label>
                  <div className="flex gap-2">
                      <input type="color" value={state.theme.primaryColor} onChange={(e) => updateTheme({ primaryColor: e.target.value })} className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 cursor-pointer p-0" />
                      <input type="text" value={state.theme.primaryColor} onChange={(e) => updateTheme({ primaryColor: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white font-mono" />
                  </div>
               </div>
               <div>
                  <label className="block text-xs mb-1 text-zinc-400">General Text</label>
                  <div className="flex gap-2">
                      <input type="color" value={state.theme.generalText} onChange={(e) => updateTheme({ generalText: e.target.value })} className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 cursor-pointer p-0" />
                      <input type="text" value={state.theme.generalText} onChange={(e) => updateTheme({ generalText: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white font-mono" />
                  </div>
               </div>
               <div>
                  <label className="block text-xs mb-1 text-zinc-400">User Bubble</label>
                  <div className="flex gap-2">
                      <input type="color" value={state.theme.userBubble} onChange={(e) => updateTheme({ userBubble: e.target.value })} className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 cursor-pointer p-0" />
                      <input type="text" value={state.theme.userBubble} onChange={(e) => updateTheme({ userBubble: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white font-mono" />
                  </div>
               </div>
               <div>
                  <label className="block text-xs mb-1 text-zinc-400">Character Bubble</label>
                  <div className="flex gap-2">
                      <input type="color" value={state.theme.charBubble} onChange={(e) => updateTheme({ charBubble: e.target.value })} className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 cursor-pointer p-0" />
                      <input type="text" value={state.theme.charBubble} onChange={(e) => updateTheme({ charBubble: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white font-mono" />
                  </div>
               </div>
               <div>
                  <label className="block text-xs mb-1 text-zinc-400">Input Bar</label>
                  <div className="flex gap-2">
                      <input type="color" value={state.theme.inputBar} onChange={(e) => updateTheme({ inputBar: e.target.value })} className="w-8 h-8 rounded bg-zinc-950 border border-zinc-800 cursor-pointer p-0" />
                      <input type="text" value={state.theme.inputBar} onChange={(e) => updateTheme({ inputBar: e.target.value })} className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-white font-mono" />
                  </div>
               </div>

               <div className="pt-2 border-t border-zinc-800 space-y-3">
                  <div className="flex flex-col gap-1 mb-4">
                    <span className="text-xs text-zinc-400">Layout Style</span>
                    <select 
                      value={state.theme.chatLayout || 'default'}
                      onChange={(e) => updateTheme({ chatLayout: e.target.value as any })}
                      className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 w-full"
                    >
                      <option value="default">Default Overlay</option>
                      <option value="novel">Visual Novel (Bottom Chat)</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.theme.glassMode} onChange={(e) => updateTheme({ glassMode: e.target.checked })} className="rounded bg-zinc-900 border-zinc-700" />
                    <span className="text-sm">Glass Mode (Gloss Texture)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.theme.charBgMode} onChange={(e) => updateTheme({ charBgMode: e.target.checked })} className="rounded bg-zinc-900 border-zinc-700" />
                    <span className="text-sm">Use Character Avatar as Background</span>
                  </label>
                  {state.theme.charBgMode && (
                    <div className="pl-6 flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs text-zinc-400">
                        <span>Background Dimming</span>
                        <span>{Math.round((state.theme.bgOverlayOpacity ?? 0.4) * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={state.theme.bgOverlayOpacity ?? 0.4}
                        onChange={(e) => updateTheme({ bgOverlayOpacity: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.theme.transparentBubbles} onChange={(e) => updateTheme({ transparentBubbles: e.target.checked })} className="rounded bg-zinc-900 border-zinc-700" />
                    <span className="text-sm">Transparent Message Bubbles</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.theme.transparentHeader ?? false} onChange={(e) => updateTheme({ transparentHeader: e.target.checked })} className="rounded bg-zinc-900 border-zinc-700" />
                    <span className="text-sm">Cabeçalho Transparente</span>
                  </label>
                  {state.theme.transparentHeader && (
                    <div className="pl-6 flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs text-zinc-400">
                        <span>Opacidade do Cabeçalho</span>
                        <span>{Math.round((state.theme.headerOpacity ?? 0.7) * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={state.theme.headerOpacity ?? 0.7}
                        onChange={(e) => updateTheme({ headerOpacity: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.theme.transparentInputBar ?? false} onChange={(e) => updateTheme({ transparentInputBar: e.target.checked })} className="rounded bg-zinc-900 border-zinc-700" />
                    <span className="text-sm">Área de Envio Transparente</span>
                  </label>
                  {state.theme.transparentInputBar && (
                    <div className="pl-6 flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs text-zinc-400">
                        <span>Opacidade do Input</span>
                        <span>{Math.round((state.theme.inputBarOpacity ?? 0.5) * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" max="1" step="0.05"
                        value={state.theme.inputBarOpacity ?? 0.5}
                        onChange={(e) => updateTheme({ inputBarOpacity: parseFloat(e.target.value) })}
                        className="w-full accent-blue-500"
                      />
                    </div>
                  )}

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state.theme.fadeBottom} onChange={(e) => updateTheme({ fadeBottom: e.target.checked })} className="rounded bg-zinc-900 border-zinc-700" />
                    <span className="text-sm">Reading Focus (Fade top & bottom)</span>
                  </label>
               </div>
            </div>
          </section>
        )}

        {activeTab === "api" && (
          <section className="space-y-4">
            <div>
              <label className="block text-xs mb-1 text-zinc-400">Backend API</label>
              <select 
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                value={state.settings.apiType}
                onChange={(e) => updateState({ settings: { ...state.settings, apiType: e.target.value as "gemini" | "kobold" }})}
              >
                <option value="gemini">Google AI Studio</option>
                <option value="kobold">KoboldCPP (Local)</option>
              </select>
            </div>

            {state.settings.apiType === "gemini" ? (
              <div>
                <label className="block text-xs mb-1 text-zinc-400">Modelo</label>
                {!isCustomModel ? (
                  <select 
                    className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none mb-2"
                    value={state.settings.geminiModel}
                    onChange={(e) => {
                      if (e.target.value === "custom") {
                        setIsCustomModel(true);
                        updateState({ settings: { ...state.settings, geminiModel: "" }});
                      } else {
                        updateState({ settings: { ...state.settings, geminiModel: e.target.value }});
                      }
                    }}
                  >
                    {geminiModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="custom">Outro (Escreva o nome do modelo)...</option>
                  </select>
                ) : (
                  <div className="flex gap-2 mb-2">
                    <input 
                      type="text" 
                      placeholder="Ex: models/gemini-pro"
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                      value={state.settings.geminiModel}
                      onChange={(e) => updateState({ settings: { ...state.settings, geminiModel: e.target.value }})}
                    />
                    <button 
                      onClick={() => {
                        setIsCustomModel(false);
                        updateState({ settings: { ...state.settings, geminiModel: geminiModels[0] }});
                      }}
                      className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors"
                    >
                      Voltar
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs mb-1 text-zinc-400">Kobold URL</label>
                <input 
                  type="text" 
                  placeholder="http://127.0.0.1:5001/api"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  value={state.settings.koboldUrl}
                  onChange={(e) => updateState({ settings: { ...state.settings, koboldUrl: e.target.value }})}
                />
              </div>
            )}

            <div className="border-t border-zinc-800 pt-4 mt-4 space-y-3">
              <h4 className="text-sm font-semibold text-white">Configurações Gerais</h4>
              
              <div>
                <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
                  <label>Temperatura (Criatividade)</label>
                  <span>{state.settings.temperature ?? 0.9}</span>
                </div>
                <input 
                  type="range" min="0" max="2" step="0.1"
                  className="w-full accent-blue-500"
                  value={state.settings.temperature ?? 0.9}
                  onChange={(e) => updateState({ settings: { ...state.settings, temperature: parseFloat(e.target.value) }})}
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-zinc-400">Limite de Caracteres (Max Tokens)</label>
                <input 
                  type="number"
                  placeholder="Ex: 500"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  value={state.settings.maxTokens || 1000}
                  onChange={(e) => updateState({ settings: { ...state.settings, maxTokens: parseInt(e.target.value) || 1000 }})}
                />
              </div>

              {state.settings.apiType === "gemini" && (
                <>
                  <div>
                    <label className="block text-xs mb-1 text-zinc-400">Nível de Raciocínio (Thinking Level)</label>
                    <select 
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                      value={state.settings.thinkingLevel || "none"}
                      onChange={(e) => updateState({ settings: { ...state.settings, thinkingLevel: e.target.value as any }})}
                    >
                      <option value="none">Desativado (Normal)</option>
                      <option value="minimal">Minimal</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                    <p className="text-[10px] text-zinc-500 mt-1">Aumenta a qualidade das respostas mas consome mais tokens e tempo.</p>
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input 
                  type="checkbox" 
                  checked={state.settings.showReasoning ?? true} 
                  onChange={(e) => updateState({ settings: { ...state.settings, showReasoning: e.target.checked }})}
                  className="rounded bg-zinc-900 border-zinc-700" 
                />
                <span className="text-sm">Mostrar blocos de Raciocínio (Em aba expansível)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <input 
                  type="checkbox" 
                  checked={state.settings.enableResponderPorMim ?? true} 
                  onChange={(e) => updateState({ settings: { ...state.settings, enableResponderPorMim: e.target.checked }})}
                  className="rounded bg-zinc-900 border-zinc-700" 
                />
                <span className="text-sm">Ativar opção "Responder por mim"</span>
              </label>

              <div>
                <label className="block text-xs mb-1 text-zinc-400 mt-2">Resumo Automático (Mensagens)</label>
                <input 
                  type="number" min="5" max="50"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                  value={state.settings.summaryFrequency || 10}
                  onChange={(e) => updateState({ settings: { ...state.settings, summaryFrequency: parseInt(e.target.value) || 10 }})}
                />
                <p className="text-[10px] text-zinc-500 mt-1">Frequência com que o fundo e memórias da história são resumidos. Padrão: 10.</p>
              </div>
              
              <div>
                <label className="block text-xs mb-1 text-zinc-400 mt-2">Instruções para Resumo (O que é importante)</label>
                <textarea 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y min-h-[60px]"
                  placeholder="Ex: Fatos permanentes sobre personagens, mudanças de relacionamento, objetivos, promessas, locais, itens..."
                  value={state.settings.summaryPrompt || ""}
                  onChange={(e) => updateState({ settings: { ...state.settings, summaryPrompt: e.target.value }})}
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-zinc-400 mt-2">Resumo Atual Salvo (Gerado Automaticamente)</label>
                <textarea 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y min-h-[80px]"
                  placeholder="O resumo da conversa aparecerá aqui após o gatilho automático..."
                  value={state.backgroundSummary || ""}
                  onChange={(e) => updateState({ backgroundSummary: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-zinc-400 mt-2">Nota do Autor (Ambiente da Cena / Contexto Opcional)</label>
                <textarea 
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y min-h-[80px]"
                  placeholder="Descreva aqui o ambiente da cena atual, como o local, a hora do dia, o clima, e pequenos direcionamentos para a IA..."
                  value={state.authorsNote || ""}
                  onChange={(e) => updateState({ authorsNote: e.target.value })}
                />
              </div>

              {state.settings.apiType === "gemini" && (
                <div className="border-t border-zinc-800 pt-4 mt-4 space-y-3">
                  <h4 className="text-sm font-semibold text-white">Segurança da API (Safety Settings)</h4>
                  
                  {[
                    { key: 'harassment', label: 'Harassment' },
                    { key: 'hate', label: 'Hate' },
                    { key: 'sexuallyExplicit', label: 'Sexually Explicit' },
                    { key: 'dangerousContent', label: 'Dangerous Content' }
                  ].map(cat => (
                    <div key={cat.key}>
                      <label className="block text-xs mb-1 text-zinc-400">{cat.label}</label>
                      <select 
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                        value={(state.settings.safetySettings as any)?.[cat.key] || "BLOCK_NONE"}
                        onChange={(e) => updateState({ 
                          settings: { 
                            ...state.settings, 
                            safetySettings: {
                              ...(state.settings.safetySettings || {
                                harassment: "BLOCK_NONE",
                                hate: "BLOCK_NONE",
                                sexuallyExplicit: "BLOCK_NONE",
                                dangerousContent: "BLOCK_NONE"
                              }),
                              [cat.key]: e.target.value 
                            }
                          }
                        })}
                      >
                        <option value="BLOCK_NONE">Off / Block none</option>
                        <option value="BLOCK_ONLY_HIGH">Block few</option>
                        <option value="BLOCK_MEDIUM_AND_ABOVE">Block some</option>
                        <option value="BLOCK_LOW_AND_ABOVE">Block most</option>
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800">
              <h3 className="text-sm font-semibold text-white mb-3">Google AI Studio TTS</h3>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input 
                  type="checkbox" 
                  checked={state.settings.tts?.enabled || false}
                  onChange={(e) => updateState({ settings: { ...state.settings, tts: { ...state.settings.tts, enabled: e.target.checked } as any }})}
                  className="rounded bg-zinc-900 border-zinc-700 w-4 h-4"
                />
                <span className="text-sm">Ativar Voz (Apenas Respostas)</span>
              </label>

              {state.settings.tts?.enabled && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs mb-1 text-zinc-400">Modelo TTS</label>
                    {!isCustomTtsModel ? (
                      <select 
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none mb-2"
                        value={state.settings.tts.model}
                        onChange={(e) => {
                          if (e.target.value === "custom") {
                            setIsCustomTtsModel(true);
                            updateState({ settings: { ...state.settings, tts: { ...state.settings.tts, model: "" } as any }});
                          } else {
                            updateState({ settings: { ...state.settings, tts: { ...state.settings.tts, model: e.target.value } as any }});
                          }
                        }}
                      >
                        <option value="gemini-3.1-flash-tts-preview">gemini-3.1-flash-tts-preview</option>
                        <option value="gemini-2.5-pro-preview-tts">gemini-2.5-pro-preview-tts</option>
                        <option value="gemini-2.5-flash-preview-tts">gemini-2.5-flash-preview-tts</option>
                        <option value="custom">Outro (Escreva o nome do modelo)...</option>
                      </select>
                    ) : (
                      <div className="flex gap-2 mb-2">
                        <input 
                          type="text" 
                          placeholder="Ex: gemini-3.5-flash-tts"
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                          value={state.settings.tts.model}
                          onChange={(e) => updateState({ settings: { ...state.settings, tts: { ...state.settings.tts, model: e.target.value } as any }})}
                        />
                        <button 
                          onClick={() => {
                            setIsCustomTtsModel(false);
                            updateState({ settings: { ...state.settings, tts: { ...state.settings.tts, model: "gemini-3.1-flash-tts-preview" } as any }});
                          }}
                          className="px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors"
                        >
                          Voltar
                        </button>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs mb-1 text-zinc-400">Voz (VoiceName)</label>
                    <select 
                      className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
                      value={state.settings.tts.voice}
                      onChange={(e) => updateState({ settings: { ...state.settings, tts: { ...state.settings.tts, voice: e.target.value } as any }})}
                    >
                      <optgroup label="Femininas (Female)">
                        <option value="Aoede">Aoede</option>
                        <option value="Autonoe">Autonoe</option>
                        <option value="Callirrhoe">Callirrhoe</option>
                        <option value="Despina">Despina</option>
                        <option value="Erinome">Erinome</option>
                        <option value="Kore">Kore</option>
                        <option value="Laomedeia">Laomedeia</option>
                        <option value="Leda">Leda</option>
                        <option value="Pulcherrima">Pulcherrima</option>
                        <option value="Vindemiatrix">Vindemiatrix</option>
                      </optgroup>
                      <optgroup label="Masculinas / Neutras (Male/Neutral)">
                        <option value="Achernar">Achernar</option>
                        <option value="Achird">Achird</option>
                        <option value="Algenib">Algenib</option>
                        <option value="Algieba">Algieba</option>
                        <option value="Alnilam">Alnilam</option>
                        <option value="Charon">Charon</option>
                        <option value="Enceladus">Enceladus</option>
                        <option value="Fenrir">Fenrir</option>
                        <option value="Gacrux">Gacrux</option>
                        <option value="Iapetus">Iapetus</option>
                        <option value="Orus">Orus</option>
                        <option value="Puck">Puck</option>
                        <option value="Rasalgethi">Rasalgethi</option>
                        <option value="Sadachbia">Sadachbia</option>
                        <option value="Sadaltager">Sadaltager</option>
                        <option value="Schedar">Schedar</option>
                        <option value="Sulafat">Sulafat</option>
                        <option value="Umbriel">Umbriel</option>
                        <option value="Zephyr">Zephyr</option>
                        <option value="Zubenelgenubi">Zubenelgenubi</option>
                      </optgroup>
                    </select>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-tight">
                    Para poupar a cota da API, o áudio só será gerado após o personagem enviar pelo menos 5 mensagens no histórico.
                  </p>
                  <div className="pt-2 border-t border-zinc-800">
                    <button 
                      onClick={handleGenerateFullAudio}
                      disabled={isGeneratingFullAudio}
                      className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm py-2 rounded transition-colors"
                    >
                      {isGeneratingFullAudio ? (
                         <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                         <Music className="w-4 h-4" />
                      )}
                      Gerar Áudio de Todo Diálogo
                    </button>
                    {state.fullAudioUrl && (
                      <div className="mt-3">
                        <label className="block text-xs mb-1 text-zinc-400">Áudio Completo Gerado</label>
                        <audio controls src={state.fullAudioUrl} className="w-full h-8" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "comfyui" && state.settings.comfyUI && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white border-b border-zinc-800 pb-2">Integração ComfyUI</h3>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input 
                type="checkbox" 
                checked={state.settings.comfyUI.enabled}
                onChange={(e) => updateState({ 
                  settings: { 
                    ...state.settings, 
                    comfyUI: { ...state.settings.comfyUI!, enabled: e.target.checked } 
                  }
                })}
                className="rounded bg-zinc-900 border-zinc-700 w-4 h-4"
              />
              <span className="text-sm font-medium text-zinc-300">Ativar Geração de Imagem</span>
            </label>
            
            {state.settings.comfyUI.enabled && (
              <ComfyUISettingsPanel 
                comfyUI={state.settings.comfyUI} 
                updateComfyUI={(updates) => updateState({
                  settings: {
                    ...state.settings,
                    comfyUI: { ...state.settings.comfyUI!, ...updates }
                  }
                })} 
              />
            )}
          </section>
        )}

        {activeTab === "assistant" && (
          <section className="flex-1 flex flex-col min-h-0">
            <AssistantPanel state={state} updateState={updateState} />
          </section>
        )}
      </div>

      <div className="p-4 border-t border-zinc-800">
        <button onClick={clearChat} className="w-full bg-red-900/50 hover:bg-red-900/80 text-red-200 py-2 px-3 rounded text-sm transition-colors cursor-pointer">
          Limpar Sessão
        </button>
      </div>

      {/* Switch Character Confirmation Modal */}
      {showSwitchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Iniciar Conversa?</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Deseja limpar as mensagens antigas para iniciar uma nova conversa com <strong>{showSwitchConfirm.name}</strong>?
            </p>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => handleSwitchCharacter(showSwitchConfirm, true)}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-[#ffffff] rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                Sim, Limpar e Começar Novo Chat
              </button>
              <button 
                onClick={() => handleSwitchCharacter(showSwitchConfirm, false)}
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                Não, Continuar Chat Atual
              </button>
              <button 
                onClick={() => setShowSwitchConfirm(null)}
                className="w-full py-2 text-zinc-500 hover:text-zinc-400 text-xs transition-colors mt-1 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Character Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Excluir Personagem</h3>
            <p className="text-zinc-400 text-sm mb-6">
              Tem certeza que deseja remover <strong>{showDeleteConfirm.name}</strong> da sua biblioteca? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={() => handleDeleteCharacter(showDeleteConfirm)}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-[#ffffff] rounded-md transition-colors cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
