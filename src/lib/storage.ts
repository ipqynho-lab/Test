import { AppState, Character, LorebookEntry, Message, Settings, User } from "../types";

const STORAGE_KEY = "sillytavern_clone_state";

const defaultCharacters: Character[] = [
  {
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
  },
  {
    id: "char-elara",
    name: "Elara (Mago de Fogo)",
    description: "Um mago do fogo sábio e excêntrico que vive em uma torre no topo da montanha.",
    personality: "Misterioso, inteligente, fala com enigmas e às vezes é meio impaciente mas de bom coração.",
    scenario: "Você encontrou Elara em sua torre enquanto buscava ajuda para decifrar um pergaminho antigo.",
    first_mes: "*Olhando por cima de seus óculos redondos e soprando uma fumaça em forma de fênix de seu cachimbo* Ah, mais um viajante perdido. O que te traz à minha humilde morada de vento e cinzas? Não me diga que quer aprender piromancia...",
    mes_example: "User: Como você aprendeu magia?\nElara: *Dá uma risada rouca* O fogo não se aprende, jovem. Ele se escuta, se respeita... e ocasionalmente queima suas sobrancelhas se você for descuidado.",
    system_prompt: "Responda como Elara, o mago do fogo excêntrico. Use formatação em itálico para ações e diálogos ricos.",
    post_history_instructions: "",
    avatar: null,
  }
];

const defaultState: AppState = {
  character: defaultCharacters[0],
  characters: defaultCharacters,
  user: {
    name: "User",
    avatar: null,
  },
  lorebook: [],
  messages: [],
  settings: {
    apiType: "gemini",
    koboldUrl: "http://127.0.0.1:5001/api/v1",
    geminiKey: "",
    geminiModel: "gemini-3.1-flash-lite-preview",
    summaryFrequency: 10,
    temperature: 0.9,
    maxTokens: 1000,
    thinkingLevel: "none",
    showReasoning: true,
    enableResponderPorMim: true,
    safetySettings: {
      harassment: "BLOCK_NONE",
      hate: "BLOCK_NONE",
      sexuallyExplicit: "BLOCK_NONE",
      dangerousContent: "BLOCK_NONE",
    },
    comfyUI: {
      enabled: false,
      url: "http://127.0.0.1:8188",
      width: 512,
      height: 768,
      steps: 20,
      cfgScale: 7,
      seed: -1,
      sampler: "euler",
      scheduler: "normal",
      checkpoint: "illustrious.safetensors",
      loras: [],
      basePrompt: "masterpiece, best quality, amazing quality, 1girl, solo, noelle Silva, black clover",
      negativePrompt: "bad hands, bad quality, worst quality, text, watermark, signature",
    },
    tts: {
      enabled: false,
      model: "gemini-3.1-flash-tts-preview",
      voice: "Puck"
    }
  },
  theme: {
    appBackground: "#09090b",
    primaryColor: "#3b82f6",
    generalText: "#e4e4e7",
    userBubble: "#1e3a8a",
    charBubble: "#18181b",
    inputBar: "#09090b",
    glassMode: false,
    charBgMode: false,
    transparentBubbles: false,
    bgOverlayOpacity: 0.4,
    fadeBottom: false,
    chatLayout: 'default',
    transparentHeader: true,
    transparentInputBar: true,
    headerOpacity: 0.75,
    inputBarOpacity: 0.5,
    mode: "dark",
  },
  backgroundSummary: "",
};

export const loadState = (): AppState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaultState,
        ...parsed,
        characters: parsed.characters || defaultState.characters,
        theme: {
          ...defaultState.theme,
          ...(parsed.theme || {})
        },
        settings: {
          ...defaultState.settings,
          ...(parsed.settings || {})
        }
      };
    }
  } catch (error) {
    console.error("Failed to load state", error);
  }
  return defaultState;
};

export const saveState = (state: AppState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save state", error);
  }
};
