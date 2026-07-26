import { AppState, Message } from "../types";

export const buildSystemPrompt = (state: AppState): string => {
  const { character, characters, activeCharacterIds, isCollabMode, user, lorebook, messages, backgroundSummary, authorsNote, settings } = state;

  const replaceMacros = (text: string, charName: string) => {
    if (!text) return "";
    return text.replace(/{{user}}/gi, user.name).replace(/{{char}}/gi, charName);
  };

  let prompt = "";

  const activeIds = (activeCharacterIds && activeCharacterIds.length > 0) 
    ? activeCharacterIds 
    : [character.id, ...(characters || []).map(c => c.id)].filter((id): id is string => !!id);

  if (isCollabMode && activeIds.length > 0) {
    prompt += `You are acting as multiple characters in a Group Chat Roleplay. You must act as the following characters, responding naturally to the user (${user.name}) and to each other as appropriate. Always prefix each character's dialogue and actions with their name, like "Character Name: *action* dialogue".\n\n`;
    
    // Get all active characters including the main one if selected
    const activeChars = [character, ...(characters || [])].filter(
      (c, index, self) => activeIds.includes(c.id || "") && self.findIndex(s => s.id === c.id) === index
    );

    activeChars.forEach(c => {
      prompt += `==============================\n`;
      prompt += `CHARACTER: ${c.name}\n`;
      prompt += `==============================\n`;
      if (c.system_prompt) prompt += replaceMacros(c.system_prompt, c.name) + "\n\n";
      prompt += `### Description\n${replaceMacros(c.description, c.name)}\n\n`;
      if (c.personality) prompt += `### Personality\n${replaceMacros(c.personality, c.name)}\n\n`;
      if (c.scenario) prompt += `### Scenario\n${replaceMacros(c.scenario, c.name)}\n\n`;
      if (c.mes_example) prompt += `### Example Dialogue\n${replaceMacros(c.mes_example, c.name)}\n\n`;
    });
    prompt += `==============================\n\n`;
    
  } else {
    prompt = character.system_prompt 
      ? replaceMacros(character.system_prompt, character.name) + "\n\n" 
      : `You are ${character.name}. You must strictly roleplay as ${character.name} and never break character. Do not speak or act for the user (${user.name}).\n\n`;

    prompt += `### Description\n${replaceMacros(character.description, character.name)}\n\n`;
    
    if (character.personality) {
      prompt += `### Personality\n${replaceMacros(character.personality, character.name)}\n\n`;
    }

    if (character.scenario) {
      prompt += `### Scenario\n${replaceMacros(character.scenario, character.name)}\n\n`;
    }

    if (character.mes_example) {
      prompt += `### Example Dialogue\n${replaceMacros(character.mes_example, character.name)}\n\n`;
    }
  }

  if (user.persona) {
    prompt += `### About ${user.name}\n${replaceMacros(user.persona, character.name)}\n\n`;
  }

  if (backgroundSummary) {
    prompt += `### Background & Past Events Summary\n${backgroundSummary}\n\n`;
  }

  if (authorsNote) {
    prompt += `### Author's Note (Scene Environment & Context)\n${authorsNote}\n\n`;
  }

  // Inject Lorebook
  // Scan last 3 messages
  const recentMessages = messages.slice(-3);
  const recentText = recentMessages.map((m) => m.content).join(" ").toLowerCase();

  const injectedEntries = new Set<string>();
  let activeLorebook = character.lorebook || lorebook || [];
  
  if (isCollabMode && activeIds.length > 0) {
    // Collect lorebooks from all active characters
    const activeChars = [character, ...(characters || [])].filter(c => activeIds.includes(c.id || ""));
    const allLorebooks: any[] = [];
    activeChars.forEach(c => {
      if (c.lorebook) allLorebooks.push(...c.lorebook);
    });
    if (lorebook) allLorebooks.push(...lorebook);
    activeLorebook = allLorebooks;
  }

  for (const entry of activeLorebook) {
    for (const key of entry.keys) {
      if (recentText.includes(key.toLowerCase())) {
        injectedEntries.add(entry.content);
        break; // Only inject once per entry
      }
    }
  }

  if (injectedEntries.size > 0) {
    prompt += `### <World_Info>\n`;
    injectedEntries.forEach((entry) => {
      prompt += `${entry}\n`;
    });
    prompt += `</World_Info>\n\n`;
  }

  if (!isCollabMode && character.post_history_instructions) {
    prompt += `### Instructions\n${replaceMacros(character.post_history_instructions, character.name)}\n\n`;
  } else if (isCollabMode) {
     prompt += `### Instructions\nYou are simulating a group chat. Decide which character(s) should reply based on the flow of conversation. If the user addresses a specific character by name, that character MUST be the one to respond. Format replies exactly like this: "Character Name: [dialogue and actions]". Do not speak for the user (${user.name}).\n\n`;
  }

  prompt += `### Language Rule\nYou must always respond in the language used in the character's description and first message. Se o usuário falar em português, responda em português.\n\n`;

  prompt += `### CRITICAL OUTPUT RULES\n`;
  prompt += `1. DO NOT output any meta-commentary about your instructions.\n`;
  prompt += `2. ONLY output the character's direct response, dialogue, and actions in the roleplay.\n`;
  prompt += `3. Be immersive, stay perfectly in character, and move the plot forward.\n`;
  if (!isCollabMode) {
    prompt += `4. Start your response directly with the character's dialogue or action. Never start with "User says:" or "Looking at the instructions".\n`;
  } else {
    prompt += `4. Start your response directly with the speaking character's name, e.g. "Character Name: *smiles* Hello!". It MUST be one of the active characters in the group (for example, "Yuki: *waves* Hey there!").\n`;
  }
  
  if (settings?.tts?.enabled) {
    prompt += `5. AT THE VERY END of your response, you MUST append an XML tag for TTS generation. Provide the scene context, audio style, and speaking pace based on the current situation. Format EXACTLY like this: <tts scene="a quiet forest" style="whispering, romantic" pace="slow" />\n\n`;
  } else {
    prompt += `\n`;
  }

  return prompt;
};

export const estimateTokens = (state: AppState): number => {
  const systemPrompt = buildSystemPrompt(state);
  const messagesText = state.messages.map(m => m.content).join("\n");
  const allText = systemPrompt + "\n" + messagesText;
  
  // A rough estimate: 1 token is roughly 4 chars in English, maybe 3-4 overall
  return Math.ceil(allText.length / 4);
};
