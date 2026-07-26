export interface Character {
  id?: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  avatar: string | null;
  lorebook?: LorebookEntry[];
}

export interface User {
  name: string;
  avatar: string | null;
  persona?: string;
  voice?: string;
}

export interface LorebookEntry {
  keys: string[];
  content: string;
}

export interface Message {
  id: string;
  role: "user" | "model" | "system";
  content: string;
  reasoning?: string;
  timestamp: number;
  characterId?: string;
  characterName?: string;
  swipes?: string[];
  currentSwipeIndex?: number;
  imageUrls?: string[];
  audioUrl?: string;
  ttsParams?: Record<string, string>;
}

export interface SafetySettings {
  harassment: string;
  hate: string;
  sexuallyExplicit: string;
  dangerousContent: string;
}

export interface ComfyUILora {
  name: string;
  weight: number;
}

export interface ComfyUISettings {
  enabled: boolean;
  url: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed: number;
  sampler: string;
  scheduler: string;
  checkpoint: string;
  loras: ComfyUILora[];
  basePrompt: string;
  negativePrompt: string;
  promptInstructions?: string;
}

export interface TTSSettings {
  enabled: boolean;
  model: string;
  voice: string;
}

export interface Settings {
  apiType: "kobold" | "gemini";
  koboldUrl: string;
  geminiKey: string;
  geminiModel: string;
  summaryFrequency: number;
  summaryPrompt?: string;
  temperature: number;
  maxTokens: number;
  thinkingLevel: "high" | "medium" | "low" | "minimal" | "none";
  showReasoning: boolean;
  safetySettings?: SafetySettings;
  comfyUI?: ComfyUISettings;
  tts?: TTSSettings;
  suggestionTones?: string[];
  enableResponderPorMim?: boolean;
}


export interface ThemeSettings {
  appBackground: string;
  primaryColor: string;
  generalText: string;
  userBubble: string;
  charBubble: string;
  inputBar: string;
  glassMode: boolean;
  charBgMode: boolean;
  transparentBubbles?: boolean;
  bgOverlayOpacity?: number;
  fadeBottom?: boolean;
  chatLayout?: 'default' | 'novel';
  transparentHeader?: boolean;
  transparentInputBar?: boolean;
  headerOpacity?: number;
  inputBarOpacity?: number;
  mode?: "dark" | "light";
  fontSize?: "sm" | "base" | "lg" | "xl";
  avatarSize?: "sm" | "md" | "lg" | "xl";
}

export interface AppState {
  character: Character;
  characters?: Character[];
  activeCharacterIds?: string[];
  isCollabMode?: boolean;
  user: User;
  lorebook: LorebookEntry[];
  messages: Message[];
  assistantMessages?: Message[];
  settings: Settings;
  theme: ThemeSettings;
  backgroundSummary: string;
  authorsNote?: string;
  fullAudioUrl?: string;
}
