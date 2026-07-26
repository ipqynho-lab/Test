import { Menu, RefreshCw, Send, Trash2, Users, ChevronLeft, ChevronRight, Pencil, Image as ImageIcon, Play, Copy, Wand2, Check, Plus, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { generateResponse, summarizeBackground, generateUserResponseSuggestion } from "../lib/api";
import { estimateTokens } from "../lib/prompt";
import { AppState, Message } from "../types";
import { generateComfyUITags, generateImageComfyUI } from "../lib/comfyui";
import { generateTTS } from "../lib/tts";

interface ChatProps {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onOpenSidebar: () => void;
  clearChat: () => void;
}

const getAvatarSizeClass = (size?: string) => {
  switch (size) {
    case "sm": return "w-6 h-6 text-[10px]";
    case "lg": return "w-10 h-10 text-sm";
    case "xl": return "w-12 h-12 text-base";
    case "md":
    default: return "w-8 h-8 text-xs";
  }
};

export function Chat({ state, updateState, onOpenSidebar, clearChat }: ChatProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [generatingImageId, setGeneratingImageId] = useState<string | null>(null);
  const [comfyProgress, setComfyProgress] = useState(0);
  const [imagePromptModal, setImagePromptModal] = useState<{msg: Message, tags: string} | null>(null);
  const [isGeneratingTags, setIsGeneratingTags] = useState<string | null>(null);
  const [novelMessageIndex, setNovelMessageIndex] = useState(0);
  const [novelChunkIndex, setNovelChunkIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentMsg = state.messages[novelMessageIndex];
  
  const activeMessage = state.messages.find(m => m.id === activeMessageId);
  const isCharacterActive = !!(activeMessage && activeMessage.role !== "user");
  
  const getNovelChunks = (text: string) => {
    if (!text) return [""];
    // Split by newlines first
    const paragraphs = text.split(/\n+/).map(p => p.trim()).filter(p => p.length > 0);
    const chunks: string[] = [];
    
    for (const p of paragraphs) {
      // Split paragraph into sentences (roughly)
      const sentences = p.match(/[^.!?]+[.!?]*(?:\s|$)+/g) || [p];
      let currentChunk = "";
      let sentenceCount = 0;
      
      for (const s of sentences) {
        const sentence = s.trim();
        if (!sentence) continue;
        
        if (!currentChunk) {
          currentChunk = sentence;
          sentenceCount = 1;
        } else if (sentenceCount < 2 && currentChunk.length + sentence.length < 150) {
          // Group up to 2 sentences if they are not too long
          currentChunk += " " + sentence;
          sentenceCount++;
        } else {
          chunks.push(currentChunk);
          currentChunk = sentence;
          sentenceCount = 1;
        }
      }
      if (currentChunk) {
        chunks.push(currentChunk);
      }
    }
    
    return chunks.length > 0 ? chunks : [""];
  };

  const novelChunks = currentMsg ? getNovelChunks(currentMsg.content) : [""];

  useEffect(() => {
    if (state.messages.length > 0) {
      // Auto advance to latest message when a new one is added
      if (novelMessageIndex >= state.messages.length - 2) {
         setNovelMessageIndex(state.messages.length - 1);
         setNovelChunkIndex(0);
      }
    } else {
      setNovelMessageIndex(0);
      setNovelChunkIndex(0);
    }
  }, [state.messages.length]);

  const handleNovelClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isLeft = e.clientX - rect.left < rect.width / 3;

    if (isLeft) {
      if (novelChunkIndex > 0) {
        setNovelChunkIndex(prev => prev - 1);
      } else if (novelMessageIndex > 0) {
        setNovelMessageIndex(prev => prev - 1);
        const prevMsg = state.messages[novelMessageIndex - 1];
        const prevChunks = prevMsg ? getNovelChunks(prevMsg.content) : [""];
        setNovelChunkIndex(prevChunks.length - 1);
      }
    } else {
      if (novelChunkIndex < novelChunks.length - 1) {
        setNovelChunkIndex(prev => prev + 1);
      } else if (novelMessageIndex < state.messages.length - 1) {
        setNovelMessageIndex(prev => prev + 1);
        setNovelChunkIndex(0);
      }
    }
  };

  const hexToRgba = (hex: string, alpha: number) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex[1] + hex[2], 16);
      g = parseInt(hex[3] + hex[4], 16);
      b = parseInt(hex[5] + hex[6], 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const theme = state.theme;
  const glassStyle = theme.glassMode ? { backdropFilter: 'blur(12px)' } : {};
  const userBg = theme.transparentBubbles ? 'transparent' : (theme.glassMode ? hexToRgba(theme.userBubble, 0.5) : theme.userBubble);
  const charBg = theme.transparentBubbles ? 'transparent' : (theme.glassMode ? hexToRgba(theme.charBubble, 0.5) : theme.charBubble);
  
  // Header transparency calculations
  const headerOpacity = theme.transparentHeader 
    ? (theme.headerOpacity !== undefined ? theme.headerOpacity : 0.0) 
    : (theme.glassMode ? 0.7 : 1.0);
  const topBg = hexToRgba(theme.appBackground, headerOpacity);
  
  // Input bar transparency calculations
  const inputBarOpacity = theme.transparentInputBar 
    ? (theme.inputBarOpacity !== undefined ? theme.inputBarOpacity : 0.0) 
    : (theme.glassMode ? 0.5 : 1.0);
  const inputBg = hexToRgba(theme.inputBar, inputBarOpacity);

  // If input is transparent, make the outer container transparent as well so only the input container has background
  const inputContainerBg = theme.transparentInputBar ? "transparent" : topBg;
  const inputContainerBorder = theme.transparentInputBar ? "border-transparent" : "border-white/5";
  
  // For glass mode over image, we need a slight dark overlay to make text readable
  const overlayOpacity = theme.bgOverlayOpacity !== undefined ? theme.bgOverlayOpacity : 0.4;
  const overlayStyle = theme.charBgMode && state.character.avatar
    ? { backgroundColor: `rgba(0,0,0,${overlayOpacity})`, backdropFilter: theme.glassMode ? 'blur(4px)' : 'none' }
    : {};
  
  const bubbleGlassStyle = theme.transparentBubbles ? {} : glassStyle;
  const bubbleTextStyle = theme.transparentBubbles ? { textShadow: '0 1px 2px rgba(0,0,0,0.8)' } : {};

  const layout = theme.chatLayout || 'default';
  const isNovel = layout === 'novel';

  const mainBgStyle = (theme.charBgMode && state.character.avatar)
    ? { backgroundImage: `url(${state.character.avatar})`, backgroundSize: 'cover', backgroundPosition: 'center', color: theme.generalText }
    : { backgroundColor: theme.appBackground, color: theme.generalText };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.messages]);

  // Initial greeting
  useEffect(() => {
    if (state.messages.length === 0 && state.character.first_mes) {
      let content = state.character.first_mes;
      content = content.replace(/{{user}}/gi, state.user.name);
      content = content.replace(/{{char}}/gi, state.character.name);
      
      const initMessage: Message = {
        id: uuidv4(),
        role: "model",
        content,
        timestamp: Date.now(),
      };
      updateState({ messages: [initMessage] });
    }
  }, [state.character.first_mes, state.messages.length, state.user.name, state.character.name]);

  const extractCollabChar = (content: string, forceTargetName?: string) => {
    let charName = undefined;
    let charId = undefined;
    if (state.isCollabMode) {
      const match = content.match(/^[\*\s]*([a-zA-Z0-9_\-\s]+)[\*\s]*:/);
      if (match) {
        const parsedName = match[1].trim();
        const foundChar = [state.character, ...(state.characters || [])].find(
           c => c.name.toLowerCase() === parsedName.toLowerCase()
        );
        if (foundChar) {
           charName = foundChar.name;
           charId = foundChar.id;
        }
      }
      if (!charName && forceTargetName) {
         charName = forceTargetName;
         const targetChar = [state.character, ...(state.characters || [])].find(c => c.name === forceTargetName);
         if (targetChar) charId = targetChar.id;
      }
    }
    return { charName, charId };
  };

  const [nextSpeaker, setNextSpeaker] = useState<string>("auto");

  const handleSend = async (forceContinue = false) => {
    if ((!input.trim() && !forceContinue) || isLoading) return;

    if (state.settings.apiType === "gemini" ) {
        alert("Please set your Google AI Studio API Key in settings.");
        return;
    }

    let forceTargetName = undefined;
    let processedInput = input.trim();

    if (state.isCollabMode && processedInput.startsWith("@")) {
      const lowerInput = processedInput.toLowerCase();
      const sortedChars = [...[state.character, ...(state.characters || [])]].sort((a, b) => b.name.length - a.name.length);
      
      for (const char of sortedChars) {
        const mention = `@${char.name.toLowerCase()}`;
        if (lowerInput.startsWith(mention)) {
          forceTargetName = char.name;
          const remainder = processedInput.slice(mention.length);
          processedInput = remainder.replace(/^[:,\s]+/, "").trim();
          break;
        }
      }
    }

    let newMessages = [...state.messages];
    if (processedInput) {
      const userMessage: Message = {
        id: uuidv4(),
        role: "user",
        content: processedInput,
        timestamp: Date.now(),
      };
      newMessages = [...newMessages, userMessage];
      updateState({ messages: newMessages });
      setInput("");
    } else if (input.trim()) {
      setInput("");
    }
    
    setIsLoading(true);

    try {
      const newState = { ...state, messages: newMessages };
      
      // Update background summary based on frequency setting
      const freq = state.settings.summaryFrequency || 10;
      if (newMessages.length > 0 && newMessages.length % freq === 0) {
           const newSummary = await summarizeBackground(newState);
           if (newSummary !== newState.backgroundSummary) {
               updateState({ backgroundSummary: newSummary });
               newState.backgroundSummary = newSummary; // update local copy for the next call
           }
      }

      if (!forceTargetName && state.isCollabMode && nextSpeaker !== "auto") {
         const targetChar = [state.character, ...(state.characters || [])].find(c => c.id === nextSpeaker);
         if (targetChar) forceTargetName = targetChar.name;
      }

      const { content, reasoning, ttsParams } = await generateResponse(newState, forceTargetName);
      
      const { charName, charId } = extractCollabChar(content, forceTargetName);

      const modelMessage: Message = {
        id: uuidv4(),
        role: "model",
        content,
        reasoning: reasoning,
        timestamp: Date.now(),
        swipes: [content],
        currentSwipeIndex: 0,
        characterName: charName,
        characterId: charId,
        ttsParams
      };

      const charMsgCount = newMessages.filter(m => m.role === 'model').length;
      if (state.settings.tts?.enabled  && charMsgCount >= 5) {
        try {
           const audioUrl = await generateTTS(content, state.settings.tts, ttsParams);
           modelMessage.audioUrl = audioUrl;
        } catch (e: any) {
           console.error("TTS Generation Error:", e);
        }
      }

      updateState({ messages: [...newMessages, modelMessage] });
    } catch (error: any) {
      console.error(error);
      alert(error.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    updateState({ messages: state.messages.filter(m => m.id !== id) });
  };

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleGenerateSuggestion = async (overrideInstruction?: string, ignoreDraft: boolean = false) => {
    if (state.settings.apiType === "gemini" ) {
        alert("Please set your API Key in settings.");
        return;
    }
    setIsGeneratingSuggestion(true);
    try {
      const instr = typeof overrideInstruction === 'string' ? overrideInstruction : suggestionInstruction;
      const draft = (!ignoreDraft && suggestionResult) ? suggestionResult : undefined;
      const suggestion = await generateUserResponseSuggestion(state, instr, draft);
      setSuggestionResult(suggestion);
    } catch (e) {
      console.error("Error generating suggestion:", e);
      alert("Failed to generate suggestion.");
    } finally {
      setIsGeneratingSuggestion(false);
    }
  };

  const applySuggestion = () => {
    setInput(suggestionResult);
    setSuggestionModalOpen(false);
    setSuggestionResult("");
    setSuggestionInstruction("");
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [suggestionModalOpen, setSuggestionModalOpen] = useState(false);
  const [suggestionInstruction, setSuggestionInstruction] = useState("");
  const [suggestionResult, setSuggestionResult] = useState("");
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [isEditingTones, setIsEditingTones] = useState(false);
  const [newTone, setNewTone] = useState("");

  const defaultTones = ["Mais detalhado", "Curto e direto", "Sarcástico", "Confiante", "Tímido", "Romântico", "Agressivo", "Poético", "Quente/Sexy/Sem Censura"];
  const currentTones = state.settings.suggestionTones || defaultTones;

  const handleAddTone = () => {
    if (newTone.trim() && !currentTones.includes(newTone.trim())) {
      const updated = [...currentTones, newTone.trim()];
      updateState({ settings: { ...state.settings, suggestionTones: updated } });
      setNewTone("");
    }
  };

  const handleRemoveTone = (tone: string) => {
    const updated = currentTones.filter(t => t !== tone);
    updateState({ settings: { ...state.settings, suggestionTones: updated } });
  };

  const handleToneClick = (tone: string) => {
    setSuggestionInstruction(prev => {
      const parts = prev.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.includes(tone)) {
        return parts.filter(p => p !== tone).join(', ');
      } else {
        return prev ? `${prev}, ${tone}` : tone;
      }
    });
  };

  const handleStartEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditContent(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleSaveEdit = (id: string) => {
    const updatedMessages = state.messages.map(m => {
      if (m.id === id) {
        // Also update the swipe list if it's a model message
        let newSwipes = m.swipes;
        if (m.role === "model" && m.swipes && m.currentSwipeIndex !== undefined) {
          newSwipes = [...m.swipes];
          newSwipes[m.currentSwipeIndex] = editContent;
        }
        return { ...m, content: editContent, swipes: newSwipes };
      }
      return m;
    });
    updateState({ messages: updatedMessages });
    setEditingId(null);
    setEditContent("");
  };

  const handleRegenerate = async (id: string) => {
    if (isLoading) return;
    const index = state.messages.findIndex(m => m.id === id);
    if (index === -1) return;

    const message = state.messages[index];
    const sliceEnd = message.role === "user" ? index + 1 : index;

    // Truncate messages up to the regenerated one
    const newMessages = state.messages.slice(0, sliceEnd);
    updateState({ messages: newMessages });
    setIsLoading(true);

    try {
      const newState = { ...state, messages: newMessages };
      const { content, reasoning, ttsParams } = await generateResponse(newState);
      
      const { charName, charId } = extractCollabChar(content);

      const modelMessage: Message = {
        id: uuidv4(),
        role: "model",
        content,
        reasoning: reasoning,
        timestamp: Date.now(),
        swipes: [content],
        currentSwipeIndex: 0,
        characterName: charName,
        characterId: charId,
        ttsParams
      };

      const charMsgCount = newMessages.filter(m => m.role === 'model').length;
      if (state.settings.tts?.enabled  && charMsgCount >= 5) {
        try {
           const audioUrl = await generateTTS(content, state.settings.tts, ttsParams);
           modelMessage.audioUrl = audioUrl;
        } catch (e: any) {
           console.error("TTS Generation Error:", e);
        }
      }

      updateState({ messages: [...newMessages, modelMessage] });
    } catch (error: any) {
      console.error(error);
      alert(error.message || "An error occurred during regeneration");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwipe = async (id: string, direction: "left" | "right") => {
    if (isLoading) return;
    const index = state.messages.findIndex(m => m.id === id);
    if (index === -1) return;
    
    const message = state.messages[index];
    if (message.role !== "model") return;

    let swipes = message.swipes || [message.content];
    let currentIndex = message.currentSwipeIndex || 0;

    if (direction === "left") {
      if (currentIndex > 0) {
        currentIndex--;
        const updatedMessages = [...state.messages];
        updatedMessages[index] = { ...message, content: swipes[currentIndex], currentSwipeIndex: currentIndex, swipes };
        updateState({ messages: updatedMessages });
      }
    } else if (direction === "right") {
      if (currentIndex < swipes.length - 1) {
        currentIndex++;
        const updatedMessages = [...state.messages];
        updatedMessages[index] = { ...message, content: swipes[currentIndex], currentSwipeIndex: currentIndex, swipes };
        updateState({ messages: updatedMessages });
      } else {
        // Generate new swipe
        const previousMessages = state.messages.slice(0, index);
        setIsLoading(true);
        try {
          const newState = { ...state, messages: previousMessages };
          
          let forceTargetName = undefined;
          if (state.isCollabMode && message.characterName) {
            forceTargetName = message.characterName;
          }

          const { content, reasoning, ttsParams } = await generateResponse(newState, forceTargetName);
          swipes = [...swipes, content];
          currentIndex++;
          
          const { charName, charId } = extractCollabChar(content, forceTargetName);

          const updatedMessages = [...state.messages];
          const newMsg = { 
            ...message, 
            content, 
            reasoning, 
            swipes, 
            currentSwipeIndex: currentIndex,
            characterName: charName || message.characterName,
            characterId: charId || message.characterId,
            ttsParams
          };

          const charMsgCount = previousMessages.filter(m => m.role === 'model').length;
          if (state.settings.tts?.enabled  && charMsgCount >= 5) {
            try {
               const audioUrl = await generateTTS(content, state.settings.tts, ttsParams);
               newMsg.audioUrl = audioUrl;
            } catch (e: any) {
               console.error("TTS Generation Error:", e);
            }
          }

          updatedMessages[index] = newMsg;
          updateState({ messages: updatedMessages });
        } catch (error: any) {
          console.error(error);
          alert(error.message || "An error occurred generating new swipe");
        } finally {
          setIsLoading(false);
        }
      }
    }
  };

  const handlePrepareGenerateImage = async (msg: Message) => {
    if (!state.settings.comfyUI || !state.settings.comfyUI.enabled) {
      alert("ComfyUI Integration is not enabled. Please enable it in Settings.");
      return;
    }
    setIsGeneratingTags(msg.id);
    try {
      const dynamicTags = await generateComfyUITags(state, msg.content);
      setImagePromptModal({ msg, tags: dynamicTags });
    } catch (e: any) {
      alert("Erro ao gerar tags baseadas no texto: " + (e.message || ""));
    } finally {
      setIsGeneratingTags(null);
    }
  };

  const handleConfirmGenerateImage = async () => {
    if (!imagePromptModal || !state.settings.comfyUI) return;
    const { msg, tags } = imagePromptModal;
    setImagePromptModal(null);
    
    setGeneratingImageId(msg.id);
    setComfyProgress(0);

    try {
      const urls = await generateImageComfyUI(
        state.settings.comfyUI, 
        tags, 
        (progress) => setComfyProgress(progress)
      );

      if (urls.length > 0) {
        const index = state.messages.findIndex(m => m.id === msg.id);
        if (index !== -1) {
          const updatedMessages = [...state.messages];
          const existingUrls = updatedMessages[index].imageUrls || [];
          updatedMessages[index] = { ...updatedMessages[index], imageUrls: [...existingUrls, ...urls] };
          updateState({ messages: updatedMessages });
        }
      }
    } catch (error: any) {
      alert("Erro ao gerar imagem: " + (error.message || "Erro desconhecido"));
    } finally {
      setGeneratingImageId(null);
    }
  };

  return (
    <div className="flex flex-col h-full relative overflow-hidden transition-colors duration-300" style={mainBgStyle}>
      
      {/* Main Chat Container */}
      <div className="flex flex-col h-full relative z-10 w-full flex-1">
        <div className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-300" style={overlayStyle} />
        {isNovel && !theme.transparentBubbles && <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />}

        {/* Top Bar */}
        <div className={`h-14 border-b ${theme.transparentHeader ? 'border-transparent' : 'border-white/5'} flex items-center justify-between px-4 shadow-sm z-20 flex-shrink-0 relative transition-all duration-300`} style={{ backgroundColor: topBg, ...glassStyle }}>
          <div className="flex items-center">
            <button onClick={onOpenSidebar} className="mr-3 md:hidden p-2 opacity-70 hover:opacity-100 rounded">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-3">
              {state.isCollabMode ? (
                <div className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full bg-black/20 flex items-center justify-center shadow-sm`}>
                   <Users size={16} />
                </div>
              ) : state.character.avatar ? (
                <img src={state.character.avatar} alt="Char Avatar" className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full object-cover shadow-sm`} />
              ) : (
                <div className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full bg-black/20 flex items-center justify-center shadow-sm`}>
                   {state.character.name[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div>
                <h1 className="font-semibold leading-tight">
                  {state.isCollabMode ? "Grupo de Colaboração" : state.character.name}
                </h1>
                <p className="text-xs opacity-60 leading-tight truncate max-w-[200px] sm:max-w-md">
                    {state.isCollabMode ? `${state.activeCharacterIds?.length || 1} personagens ativos` : (state.character.description || "No description")}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs opacity-50" title="Tokens Estimados">
              ~{estimateTokens(state)} tokens
            </div>
            <button 
              onClick={clearChat} 
              className="p-2 opacity-60 hover:opacity-100 hover:text-red-400 rounded transition-colors" 
              title="Limpar Chat"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div 
          className={`flex-1 overflow-y-auto p-4 relative z-10 scroll-smooth ${isNovel ? 'flex flex-col overflow-hidden p-0' : `space-y-6 ${theme.fadeBottom ? 'pt-[20vh] pb-[60vh]' : 'pb-4'}`}`}
          style={(theme.fadeBottom && !isNovel) ? { maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 50%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 50%, transparent 95%)' } : {}}
        >
        {isNovel ? (
           state.messages.length > 0 && (
             <div 
               className="flex-1 flex flex-col justify-end w-full h-full cursor-pointer"
               onClick={handleNovelClick}
             >
                <div className={`w-full p-6 md:px-12 md:pb-8 pt-6 transition-all relative ${theme.transparentBubbles ? '' : 'border-t border-white/10 shadow-2xl'}`}
                     style={{ backgroundColor: theme.transparentBubbles ? 'transparent' : (theme.glassMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.9)'), ...bubbleGlassStyle, ...bubbleTextStyle }}>
                     <div className="text-xl font-bold mb-3 flex justify-between items-center" style={{ color: theme.primaryColor || '#d4af37' }}>
                       <span>{currentMsg?.role === 'user' ? state.user.name : state.character.name}</span>
                       <span className="text-xs opacity-40 font-normal">
                         {novelMessageIndex + 1}/{state.messages.length} ({novelChunkIndex + 1}/{novelChunks.length})
                       </span>
                    </div>
                    {editingId === currentMsg?.id ? (
                      <div className="flex flex-col gap-4 relative z-20" onClick={(e) => e.stopPropagation()}>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full bg-black/40 border border-white/20 rounded-lg p-4 text-lg outline-none resize-y min-h-[150px]"
                          style={{ color: theme.generalText }}
                        />
                        <div className="flex justify-end gap-3">
                          <button onClick={handleCancelEdit} className="px-4 py-2 text-sm bg-white/10 hover:bg-white/20 rounded transition-colors">
                            Cancelar
                          </button>
                          <button onClick={() => handleSaveEdit(currentMsg.id)} className="px-4 py-2 text-sm bg-white/20 hover:bg-white/30 rounded font-medium transition-colors">
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed text-lg sm:text-2xl font-medium text-zinc-200">
                         {novelChunks[novelChunkIndex]}
                         {novelChunkIndex < novelChunks.length - 1 || novelMessageIndex < state.messages.length - 1 ? (
                           <span className="animate-pulse ml-2 inline-block opacity-60">▼</span>
                         ) : null}
                      </div>
                    )}
                    
                    {currentMsg?.audioUrl && novelChunkIndex === 0 && (
                      <div className="mt-4 relative z-20">
                        <audio controls autoPlay={novelChunkIndex === 0 && true} src={currentMsg.audioUrl} className="h-8 max-w-[200px] outline-none" />
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-4">
                       <div className="flex gap-2 relative z-20">
                          {currentMsg && !isLoading && editingId !== currentMsg.id && (
                            <>
                              {currentMsg.role !== "user" && (state.settings.enableResponderPorMim ?? true) && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setSuggestionModalOpen(true); }}
                                  className="px-3 py-1.5 opacity-90 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-purple-100 rounded transition-colors flex items-center gap-1.5 text-sm font-medium"
                                  title="Gera uma sugestão de resposta para você"
                                >
                                  <Wand2 size={14} /> Responder por mim
                                </button>
                              )}
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleStartEdit(currentMsg); }}
                                className="px-3 py-1.5 opacity-60 hover:opacity-100 hover:bg-white/10 rounded transition-colors flex items-center gap-1.5 text-sm"
                                title="Editar mensagem"
                              >
                                <Pencil size={14} /> Editar
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleRegenerate(currentMsg.id); }}
                                className="px-3 py-1.5 opacity-60 hover:opacity-100 hover:bg-white/10 rounded transition-colors flex items-center gap-1.5 text-sm"
                                title={currentMsg.role === "user" ? "Reenviar" : "Regerar"}
                              >
                                <RefreshCw size={14} /> {currentMsg.role === "user" ? "Reenviar" : "Regerar"}
                              </button>
                            </>
                          )}
                       </div>
                       <div className="flex justify-end h-4">
                          {isLoading && novelMessageIndex === state.messages.length - 1 && novelChunkIndex === novelChunks.length - 1 && (
                            <div className="flex items-center gap-1">
                               <div className="w-1.5 h-1.5 bg-current opacity-50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                               <div className="w-1.5 h-1.5 bg-current opacity-50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                               <div className="w-1.5 h-1.5 bg-current opacity-50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                          )}
                       </div>
                    </div>
                </div>
             </div>
           )
        ) : (
          <>
            {state.messages.map((msg, index) => {
              const isUser = msg.role === "user";
              const msgChar = !isUser && msg.characterId 
                ? [state.character, ...(state.characters || [])].find(c => c.id === msg.characterId) 
                : state.character;
              const msgCharName = !isUser ? (msg.characterName || msgChar?.name || state.character.name) : state.character.name;

              return (
                <div key={msg.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-1">
                     {isUser ? (
                        state.user.avatar ? 
                           <img src={state.user.avatar} className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full object-cover shadow-sm`} /> :
                           <div className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full bg-black/20 flex items-center justify-center`}>{state.user.name[0]?.toUpperCase() || 'U'}</div>
                     ) : (
                        msgChar?.avatar ? 
                           <img src={msgChar.avatar} className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full object-cover shadow-sm`} /> :
                           <div className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full bg-black/20 flex items-center justify-center`}>{msgCharName[0]?.toUpperCase() || 'C'}</div>
                     )}
                  </div>
                  
                  {/* Message Bubble */}
                  <div className="relative max-w-[85%] sm:max-w-[75%] flex flex-col items-start" style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                    {editingId === msg.id ? (
                      <div className="flex flex-col gap-2 w-full min-w-[250px] sm:min-w-[400px]">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full bg-black/40 border border-white/20 rounded-lg p-3 text-sm outline-none resize-y min-h-[100px]"
                          style={{ color: theme.generalText }}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded transition-colors">
                            Cancelar
                          </button>
                          <button onClick={() => handleSaveEdit(msg.id)} className="px-3 py-1.5 text-xs bg-white/20 hover:bg-white/30 rounded font-medium transition-colors">
                            Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div 
                        className={`rounded-2xl px-4 py-2 cursor-pointer transition-colors shadow-sm ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"} ${theme.transparentBubbles ? "" : "border border-white/5"}`}
                        style={{ backgroundColor: isUser ? userBg : charBg, ...bubbleGlassStyle, ...bubbleTextStyle }}
                        onClick={() => setActiveMessageId(activeMessageId === msg.id ? null : msg.id)}
                      >
                        <div className="text-xs font-medium mb-1 opacity-50 flex items-center justify-between gap-4">
                            <span style={{ color: theme.primaryColor }}>{isUser ? state.user.name : msgCharName}</span>
                        </div>
                        {msg.reasoning && state.settings.showReasoning !== false && (
                          <details className="mb-2 text-xs opacity-70 border-l-2 border-white/20 pl-2 cursor-pointer">
                            <summary className="font-medium outline-none select-none">Raciocínio (Pensamento)</summary>
                            <div className="mt-2 whitespace-pre-wrap leading-relaxed opacity-80">
                              {msg.reasoning}
                            </div>
                          </details>
                        )}
                        <div className="whitespace-pre-wrap leading-relaxed text-sm">
                          {msg.content}
                        </div>
                        {msg.audioUrl && (
                          <div className="mt-2">
                            <audio controls autoPlay={index === state.messages.length - 1} src={msg.audioUrl} className="h-8 max-w-[200px] outline-none" />
                          </div>
                        )}
                        {msg.imageUrls && msg.imageUrls.length > 0 && (
                          <div className="mt-3 flex flex-col gap-2 w-full max-w-lg">
                            {msg.imageUrls.map((url, idx) => (
                              <img key={idx} src={url} alt="Generated scene" className="rounded-lg max-w-full h-auto border border-white/10 shadow-md" />
                            ))}
                          </div>
                        )}
                        {generatingImageId === msg.id && (
                          <div className="mt-3 text-xs opacity-70 flex items-center gap-2">
                             <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                             Gerando imagem... {comfyProgress}%
                          </div>
                        )}
                      </div>
                    )}
                    {/* Actions (visible when active) */}
                    {activeMessageId === msg.id && editingId !== msg.id && (
                      <div className={`mt-1 flex items-center flex-wrap gap-1 ${isUser ? "justify-end" : "justify-start"}`}>
                        {!isUser && (
                          <div className="flex items-center gap-1 bg-black/10 rounded-md p-0.5 mr-2" onClick={(e) => e.stopPropagation()}>
                             <button onClick={() => handleSwipe(msg.id, "left")} disabled={!msg.swipes || msg.currentSwipeIndex === 0} className="p-1 opacity-60 hover:opacity-100 hover:bg-black/20 rounded disabled:opacity-20 transition-colors" title="Resposta Anterior"><ChevronLeft size={14} /></button>
                             <span className="text-[10px] font-medium opacity-60 w-8 text-center">
                               {((msg.currentSwipeIndex || 0) + 1)} / {msg.swipes ? msg.swipes.length : 1}
                             </span>
                             <button onClick={() => handleSwipe(msg.id, "right")} className="p-1 opacity-60 hover:opacity-100 hover:bg-black/20 rounded transition-colors" title="Próxima / Nova Resposta"><ChevronRight size={14} /></button>
                          </div>
                        )}
                        {!isUser && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              handleSend(true);
                              setActiveMessageId(null);
                            }}
                            className="p-1.5 opacity-100 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-100 rounded transition-colors flex items-center gap-1.5 text-xs font-medium"
                            title="Continuar diálogo a partir daqui (Sem mensagem)"
                          >
                            <Play size={14} /> Continuar
                          </button>
                        )}
                        {!isUser && state.settings.comfyUI?.enabled && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handlePrepareGenerateImage(msg); }}
                            disabled={isGeneratingTags === msg.id}
                            className="p-1.5 opacity-60 hover:opacity-100 hover:bg-black/20 rounded transition-colors flex items-center gap-1.5 text-xs text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Gerar imagem da cena (ComfyUI)"
                          >
                            {isGeneratingTags === msg.id ? (
                              <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Processando...</>
                            ) : (
                              <><ImageIcon size={14} /> Gerar Cena</>
                            )}
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleStartEdit(msg); }}
                          className="p-1.5 opacity-60 hover:opacity-100 hover:bg-black/20 rounded transition-colors flex items-center gap-1.5 text-xs"
                          title="Editar mensagem"
                        >
                          <Pencil size={14} /> Editar
                        </button>
                        {!isUser && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleCopy(msg.id, msg.content); }}
                            className="p-1.5 opacity-60 hover:opacity-100 hover:bg-black/20 rounded transition-colors flex items-center gap-1.5 text-xs"
                            title="Copiar mensagem"
                          >
                            {copiedId === msg.id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />} 
                            {copiedId === msg.id ? "Copiado" : "Copiar"}
                          </button>
                        )}
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleRegenerate(msg.id); }}
                          className="p-1.5 opacity-60 hover:opacity-100 hover:bg-black/20 rounded transition-colors flex items-center gap-1.5 text-xs"
                          title="Regerar/Reenviar a partir daqui (Apaga mensagens seguintes)"
                        >
                          <RefreshCw size={14} /> {isUser ? "Reenviar" : "Regerar"}
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                          className="p-1.5 opacity-60 hover:text-red-400 hover:bg-black/20 rounded transition-colors flex items-center gap-1.5 text-xs"
                          title="Apagar mensagem"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isLoading && (() => {
                const targetChar = state.isCollabMode && nextSpeaker !== "auto" 
                    ? [state.character, ...(state.characters || [])].find(c => c.id === nextSpeaker) 
                    : null;
                const typingName = targetChar ? targetChar.name : (state.isCollabMode ? "?" : state.character.name);
                const typingAvatar = targetChar ? targetChar.avatar : (!state.isCollabMode ? state.character.avatar : null);

                return (
                  <div className="flex gap-3 flex-row">
                     <div className="flex-shrink-0 mt-1">
                       {typingAvatar ? 
                             <img src={typingAvatar} className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full object-cover shadow-sm`} /> :
                             <div className={`${getAvatarSizeClass(theme.avatarSize)} rounded-full bg-black/20 flex items-center justify-center`}>
                                {state.isCollabMode && nextSpeaker === "auto" ? <Users size={14} /> : typingName[0]?.toUpperCase() || 'C'}
                             </div>
                       }
                     </div>
                     <div className={`rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-2 shadow-sm ${theme.transparentBubbles ? "" : "border border-white/5"}`} style={{ backgroundColor: charBg, ...bubbleGlassStyle }}>
                         <div className="w-1.5 h-1.5 bg-current opacity-50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                         <div className="w-1.5 h-1.5 bg-current opacity-50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                         <div className="w-1.5 h-1.5 bg-current opacity-50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                     </div>
                  </div>
                );
            })()}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {(!isNovel || (novelMessageIndex === Math.max(0, state.messages.length - 1) && novelChunkIndex === Math.max(0, novelChunks.length - 1))) && (
        <div 
          className={`p-4 border-t ${inputContainerBorder} flex-shrink-0 relative z-10 transition-all duration-300`} 
          style={{ backgroundColor: inputContainerBg, ...glassStyle }}
        >
          <div className="max-w-4xl mx-auto mb-2 flex items-center justify-between gap-2">
            {state.isCollabMode ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold opacity-50 tracking-wider">Próximo:</span>
                <select 
                  className="bg-black/20 border border-white/10 rounded px-2 py-1 text-xs outline-none"
                  value={nextSpeaker}
                  onChange={(e) => setNextSpeaker(e.target.value)}
                >
                  <option value="auto">Automático (IA decide)</option>
                  {[state.character, ...(state.characters || [])]
                    .filter((c, index, self) => self.findIndex(t => t.id === c.id) === index)
                    .filter(c => {
                       const active = state.activeCharacterIds && state.activeCharacterIds.length > 0 
                                      ? state.activeCharacterIds 
                                      : [state.character.id, ...(state.characters || []).map(char => char.id)].filter(Boolean);
                       return active.includes(c.id || "");
                    })
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : <div />}
            <div className="flex items-center gap-2 ml-auto">
              {isCharacterActive && (
                <button 
                  onClick={() => {
                    handleSend(true);
                    setActiveMessageId(null);
                  }} 
                  disabled={isLoading}
                  className="text-xs bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-100 px-3 py-1.5 rounded transition-colors disabled:opacity-30 flex items-center gap-1.5 font-medium animate-pulse"
                >
                  <Play size={12} /> Continuar (Sem Msg)
                </button>
              )}
            </div>
          </div>
          <div 
            className="max-w-4xl mx-auto relative flex items-end border border-white/10 rounded-xl overflow-hidden shadow-sm transition-all duration-300 focus-within:border-white/20"
            style={{ backgroundColor: inputBg, ...glassStyle }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Type a message to ${state.character.name}...`}
              className="w-full max-h-32 min-h-[44px] bg-transparent placeholder-white/30 px-4 py-3 outline-none resize-none text-sm"
              style={{ color: theme.generalText }}
              rows={Math.min(4, input.split('\n').length || 1)}
            />
            <button 
              onClick={() => handleSend(false)}
              disabled={!input.trim() || isLoading}
              className="p-3 opacity-60 hover:opacity-100 disabled:opacity-30 transition-colors"
              style={{ color: theme.primaryColor }}
            >
              <Send size={18} />
            </button>
          </div>
          <div className="text-center mt-2 text-[10px] opacity-40">
             Pressione Enter para quebrar a linha. Envie clicando no botão de envio.
          </div>
        </div>
      )}
      
      </div> {/* End Main Chat Container */}

      {/* Suggestion Modal */}
      {suggestionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSuggestionModalOpen(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Wand2 size={18} /> Responder por mim</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Deixe a IA sugerir a sua próxima resposta baseada no contexto. Você pode editar a resposta antes de enviar.
            </p>
            
            <div className="mb-4">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Instrução (Opcional):</label>
              <textarea
                value={suggestionInstruction}
                onChange={(e) => setSuggestionInstruction(e.target.value)}
                placeholder="Ex: responda em um tom confiante, provoque o personagem..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-sm text-zinc-200 outline-none focus:border-purple-500 transition-colors mb-2 resize-y min-h-[80px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleGenerateSuggestion();
                  }
                }}
              />
              <div className="flex items-center justify-between mb-1">
                 <label className="block text-xs font-medium text-zinc-400">Atalhos de Tom/Ação:</label>
                 <button onClick={() => setIsEditingTones(!isEditingTones)} className="text-[10px] text-zinc-500 hover:text-white transition-colors">{isEditingTones ? "Concluir edição" : "Editar atalhos"}</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                 {currentTones.map((tone) => {
                    const isActive = suggestionInstruction.split(',').map(p => p.trim()).includes(tone);
                    return (
                    <div key={tone} className="relative group">
                       <button
                          onClick={() => handleToneClick(tone)}
                          className={`px-2 py-1 text-xs rounded-md transition-colors ${
                            isActive 
                              ? "bg-purple-600 text-white" 
                              : "bg-zinc-800 hover:bg-purple-900/50 hover:text-purple-200 text-zinc-300"
                          }`}
                       >
                          {tone}
                       </button>
                       {isEditingTones && (
                          <button onClick={() => handleRemoveTone(tone)} className="absolute -top-1 -right-1 p-0.5 bg-red-500/80 text-white rounded-full z-10 hover:bg-red-600">
                             <X size={10} />
                          </button>
                       )}
                    </div>
                 )})}
                 {isEditingTones && (
                    <div className="flex items-center gap-1">
                       <input 
                         value={newTone}
                         onChange={e => setNewTone(e.target.value)}
                         placeholder="Novo tom..."
                         className="px-2 py-1 text-xs bg-zinc-950 border border-zinc-700 rounded-md outline-none text-zinc-300 w-24 focus:border-purple-500"
                         onKeyDown={e => { if (e.key === 'Enter') handleAddTone() }}
                       />
                       <button onClick={handleAddTone} className="p-1 bg-green-600/80 hover:bg-green-700 text-white rounded-md">
                         <Plus size={12} />
                       </button>
                    </div>
                 )}
              </div>
            </div>

            {suggestionResult ? (
              <div className="mb-4">
                <label className="block text-xs font-medium text-zinc-400 mb-1">Resultado (Edite se necessário):</label>
                <textarea
                  value={suggestionResult}
                  onChange={(e) => setSuggestionResult(e.target.value)}
                  className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-purple-500 resize-none"
                />
              </div>
            ) : null}

            <div className="flex justify-between items-center mt-4">
              <button 
                onClick={() => handleGenerateSuggestion(undefined, true)}
                disabled={isGeneratingSuggestion}
                className="px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isGeneratingSuggestion ? (
                  <><RefreshCw size={14} className="animate-spin" /> Gerando...</>
                ) : (
                  <><RefreshCw size={14} /> {suggestionResult ? "Regerar" : "Gerar Sugestão"}</>
                )}
              </button>

              <div className="flex gap-2">
                <button 
                  onClick={() => setSuggestionModalOpen(false)}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                {suggestionResult && (
                  <button 
                    onClick={applySuggestion}
                    className="px-4 py-2 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
                  >
                    Usar Resposta
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Prompt Modal */}
      {imagePromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setImagePromptModal(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">Editar Tags da Imagem</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Revise e edite as tags geradas antes de enviar para o ComfyUI. A identidade do personagem (Prompt Base) já está configurada nas opções.
            </p>
            <textarea
              value={imagePromptModal.tags}
              onChange={(e) => setImagePromptModal({ ...imagePromptModal, tags: e.target.value })}
              className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-zinc-200 outline-none focus:border-blue-500 mb-4 resize-none"
              placeholder="Tags geradas..."
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setImagePromptModal(null)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmGenerateImage}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Confirmar Geração
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
