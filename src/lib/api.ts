import { AppState, Message } from "../types";
import { buildSystemPrompt } from "./prompt";

export const generateResponse = async (state: AppState, forceTargetName?: string): Promise<{ content: string; reasoning?: string; ttsParams?: Record<string, string> }> => {
  const { settings, messages } = state;

  let systemInstruction = buildSystemPrompt(state);
  
  if (forceTargetName) {
    systemInstruction += `\n\n[SYSTEM DIRECTIVE]: You MUST generate the next response EXACTLY from the perspective of ${forceTargetName}. Start the message with "${forceTargetName}: ".`;
  }

  // We exclude the system messages from the chat history we send, 
  // since we pass the system prompt directly.
  const chatMessages = messages.filter(m => m.role !== 'system');

  if (settings.apiType === "gemini") {
    let formattedMessages: any[] = [];
    let currentRole = "";
    let currentText = "";

    for (const msg of chatMessages) {
      const role = msg.role === "user" ? "user" : "model";
      if (role === currentRole) {
        currentText += `\n\n${msg.content}`;
      } else {
        if (currentRole !== "") {
          formattedMessages.push({ role: currentRole, content: currentText });
        }
        currentRole = role;
        currentText = msg.content;
      }
    }
    if (currentRole !== "") {
      formattedMessages.push({ role: currentRole, content: currentText });
    }

    if (formattedMessages.length === 0 || formattedMessages[formattedMessages.length - 1].role !== "user") {
       formattedMessages.push({ role: "user", content: "[Continue]" });
    }

    const isGemma = settings.geminiModel.toLowerCase().includes("gemma");

    if (settings.thinkingLevel && settings.thinkingLevel !== "none") {
      if (isGemma) {
        systemInstruction += `\n[Nível de Raciocínio Solicitado: ${settings.thinkingLevel}. Ajuste a profundidade dos seus pensamentos de acordo.]`;
      }
    }

    if (isGemma) {
      if (formattedMessages.length > 0) {
        formattedMessages[0].content = `[SYSTEM INSTRUCTIONS: ${systemInstruction}]\n\n` + formattedMessages[0].content;
      } else {
        formattedMessages.push({ role: "user", content: systemInstruction });
      }
    }

    const res = await fetch("/api/chat/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.geminiModel.replace(/^models\//, ""),
        messages: formattedMessages,
        systemInstruction: isGemma ? undefined : systemInstruction,
        temperature: settings.temperature ?? 0.9,
        maxTokens: settings.maxTokens > 0 ? settings.maxTokens : undefined,
        thinkingLevel: isGemma ? undefined : settings.thinkingLevel,
        safetySettings: settings.safetySettings,
        apiKey: settings.geminiKey
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || "Erro na API Gemini");
    }

    const data = await res.json();
    let reply = data.reply || "";
    let reasoning = data.reasoning || "";

    // Fallback extraction of <think> tags from text (for Gemma or local models)
    if (reply.includes("<think>")) {
      const match = reply.match(/<think>([\s\S]*?)<\/think>/i);
      if (match) {
        reasoning += (reasoning ? "\n" : "") + match[1].trim();
        reply = reply.replace(/<think>[\s\S]*?<\/think>\n?/gi, '').trim();
      }
    }

    // Sometimes Gemma lists multiple bullet points or drafts before starting the response
    // e.g. bullet points like "* Character:" or "* User input:" or "* Draft 1:" or "* Reasoning:"
    // Let's write a robust parser to detect such prefix structures and separate them.
    const isBulletedMonologue = /^\s*[\*\-]\s+(User input|Context|Character|Language|Draft|Refining|Greeting|Action|Dialogue|Behavior|Self-Correction|Text Construction|Final Polish|Analyzing|Plan)/im.test(reply);
    
    if (!reasoning && (isGemma || isBulletedMonologue)) {
      // Find the last actual dialogue/action paragraph or quotes, or split by the last block starting with a character name, or asterisks.
      // Often, the real response starts with an asterisk (action) or quotes, or a character name greeting.
      // Let's split lines, analyze where the monologue ends and where the real story response starts.
      const lines = reply.split("\n");
      let monologueLines: string[] = [];
      let realResponseLines: string[] = [];
      let foundRealStart = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        if (foundRealStart) {
          realResponseLines.push(line);
          continue;
        }

        // Heuristic: if we see standard bulleted analysis, we keep collecting it as monologue
        const isAnalysisLine = /^\s*[\*\-]\s+(User input|Context|Character|Language|Draft|Refining|Greeting|Action|Dialogue|Behavior|Self-Correction|Text Construction|Final Polish|Analyzing|Plan|Structure)/i.test(trimmed) ||
                               /^\s*(User said|The character|Currently in|Respond in|Stay in|Don't speak|Include physical|Greeting:|Action:|Dialogue:|Sensory|Behavior:)/i.test(trimmed) ||
                               /^\s*(Draft\s*\d|Refining\s*for|Final\s*Polish|Text\s*Construction)/i.test(trimmed);

        if (isAnalysisLine) {
          monologueLines.push(line);
        } else if (trimmed.startsWith("*") || trimmed.startsWith('"') || trimmed.startsWith("«") || trimmed.startsWith("“") || (trimmed && /^[A-Za-z0-9\s]+:/.test(trimmed) && !trimmed.toLowerCase().startsWith("http"))) {
          // This line looks like a real start of action (*You head down...) or dialogue ("Yo...)
          // If the previous lines were highly analytical, let's switch to real response mode
          if (monologueLines.length > 0) {
            foundRealStart = true;
            realResponseLines.push(line);
          } else {
            monologueLines.push(line);
          }
        } else if (trimmed) {
          monologueLines.push(line);
        } else {
          // Empty line, keep formatting
          if (monologueLines.length > 0) {
            monologueLines.push(line);
          }
        }
      }

      if (foundRealStart && monologueLines.length > 0) {
        reasoning = monologueLines.join("\n").trim();
        reply = realResponseLines.join("\n").trim();
      }
    }

    return { content: reply.trim(), reasoning: reasoning.trim() || undefined };
  } else {
    // KoboldCPP local API
    const url = `${settings.koboldUrl}/v1/chat/completions`;
    
    const koboldMessages = [
      { role: "system", content: systemInstruction },
      ...chatMessages.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content
      }))
    ];

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: koboldMessages,
        temperature: settings.temperature ?? 0.9,
        max_tokens: settings.maxTokens > 0 ? settings.maxTokens : 500,
      }),
    });

    if (!res.ok) {
      throw new Error("Failed to connect to KoboldCPP");
    }

    const data = await res.json();
    let reply = data.choices[0].message.content;
    let reasoning = "";

    if (reply.includes("<think>")) {
      const match = reply.match(/<think>([\s\S]*?)<\/think>/i);
      if (match) {
        reasoning = match[1].trim();
        reply = reply.replace(/<think>[\s\S]*?<\/think>\n?/gi, '').trim();
      }
    }

    let ttsParams: Record<string, string> | undefined = undefined;
    const ttsMatch = reply.match(/<tts\s+([^>]+)\s*\/>/i);
    if (ttsMatch) {
      const attrsString = ttsMatch[1];
      ttsParams = {};
      const attrRegex = /(\w+)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
        ttsParams[attrMatch[1]] = attrMatch[2];
      }
      reply = reply.replace(/<tts\s+[^>]+\s*\/>/gi, '').trim();
    }

    return { content: reply.trim(), reasoning: reasoning || undefined, ttsParams };
  }
};

export const generateAssistantReply = async (state: AppState, question: string, assistantMessages: Message[]): Promise<string> => {
  const { settings, messages, character } = state;

  const systemInstruction = `Você é uma IA assistente ajudando o usuário a jogar um RPG de texto com o personagem "${character.name}".
O usuário fará perguntas meta sobre o RPG, como conselhos, sugestões de resposta, análise das respostas da IA, criar prompts para gerar imagens (danbooru tags, etc), traçar rotas e sugerir cenários.
Você pode visualizar o histórico recente da conversa do usuário com o personagem para dar contexto às suas respostas.
Não interprete o personagem, aja como um conselheiro, co-autor, ou mestre (GM) auxiliando o usuário.

IMPORTANTE: VOCÊ DEVE SEMPRE RESPONDER EXCLUSIVAMENTE EM PORTUGUÊS DO BRASIL (PT-BR), INDEPENDENTE DA LÍNGUA USADA PELO USUÁRIO OU DO HISTÓRICO DO RPG.`;

  // Build context of recent chat
  const recentChat = messages.slice(-10).map(m => `${m.role === 'user' ? 'Usuário' : character.name}: ${m.content}`).join('\n');
  const contextPrompt = `Contexto recente do RPG:\n${recentChat || "Nenhum histórico ainda."}\n\nLembre-se: aja como assistente do usuário.`;

  const assistantHistory = assistantMessages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  if (settings.apiType === "gemini") {
    let payloadContents = [];
    payloadContents.push({ role: "user", content: contextPrompt });
    payloadContents.push({ role: "model", content: "Entendido, estou pronto para ajudar!" });
    assistantHistory.forEach((msg: any) => payloadContents.push({ role: msg.role, content: msg.parts[0].text }));
    payloadContents.push({ role: "user", content: question });

    const modelName = settings.geminiModel.replace(/^models\//, "");
    const res = await fetch("/api/chat/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: payloadContents,
        systemInstruction: systemInstruction,
        temperature: 0.7,
        maxTokens: 1024,
        apiKey: settings.geminiKey
      })
    });

    if (!res.ok) throw new Error("Erro na API Gemini (Assistente)");
    const data = await res.json();
    return data.reply || "Desculpe, não consegui gerar uma resposta.";
  } else {
    // Kobold fallback
    const url = `${settings.koboldUrl}/v1/chat/completions`;
    const koboldMessages = [
      { role: "system", content: systemInstruction + "\n\n" + contextPrompt },
      ...assistantMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
      { role: "user", content: question }
    ];

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: koboldMessages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });
    if (!res.ok) throw new Error("Erro na API Kobold (Assistente)");
    const data = await res.json();
    return data.choices[0].message.content;
  }
};

export const summarizeBackground = async (state: AppState): Promise<string> => {
  // Simple background summarizer
  const { settings, messages, backgroundSummary } = state;
  if (messages.length < 5) return backgroundSummary;

  const prompt = `Resuma os eventos principais, fatos importantes e inventário do histórico de chat a seguir. Mantenha os contextos cruciais do resumo anterior.
Concentre-se em: ${settings.summaryPrompt || "Fatos permanentes sobre personagens, mudanças de relacionamento, objetivos, promessas, locais, itens, segredos revelados e qualquer detalhe que precise ser lembrado depois."}
  
Resumo Anterior: ${backgroundSummary || "Nenhum"}

Chat Recente:
${messages.slice(-(settings.summaryFrequency || 10) * 2).map(m => `${m.role}: ${m.content}`).join('\n')}

Forneça um resumo conciso da situação atual e dos eventos passados importantes.`;

  if (settings.apiType === "gemini") {
    try {
      const modelName = settings.geminiModel.replace(/^models\//, "");
      const res = await fetch("/api/chat/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          systemInstruction: "You are a helpful assistant that summarizes roleplay text.",
          temperature: 0.5,
          safetySettings: settings.safetySettings,
          apiKey: settings.geminiKey
        })
      });
      
      if (!res.ok) return backgroundSummary;
      const data = await res.json();
      return data.reply || backgroundSummary;
    } catch (e) {
      return backgroundSummary;
    }
  } else {
     const url = `${settings.koboldUrl}/v1/chat/completions`;
     const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_tokens: 300,
      }),
    });
    if (!res.ok) return backgroundSummary;
    const data = await res.json();
    return data.choices[0].message.content;
  }
};

export const generateUserResponseSuggestion = async (state: AppState, instruction?: string, draftContent?: string): Promise<string> => {
  const { settings, messages, character, isCollabMode } = state;
  const recentChat = messages.slice(-15).map(m => `${m.role === 'user' ? 'Usuário' : character.name}: ${m.content}`).join('\n');
  
  let prompt = `Com base no histórico recente deste RPG, sugira exatamente o que o "Usuário" deve responder em seguida.
Escreva APENAS a resposta final do usuário em primeira pessoa (ou da perspectiva do personagem do usuário), sem aspas em volta de tudo, sem explicações extras.`;

  if (draftContent && draftContent.trim() !== "") {
    prompt = `Aqui está o rascunho/resposta atual do usuário:\n"${draftContent}"\n\nPor favor, modifique, reescreva ou expanda esse rascunho. Não crie uma resposta totalmente nova, use o rascunho como base. Escreva APENAS a nova versão da resposta, sem aspas e sem explicações.`;
  }

  if (instruction && instruction.trim() !== "") {
    prompt += `\n\nSiga esta instrução extra para guiar a modificação/geração: "${instruction.trim()}"`;
  }

  prompt += `\n\nHistórico Recente:\n${recentChat}\n\nResposta final do Usuário:`;

  const systemInstruction = `Você é um co-autor de RPG ajudando o usuário. Seu papel é gerar a resposta do usuário (personagem principal) no jogo de texto. Adote o tom e o estilo adequados. O RPG pode conter temas maduros, linguagem explícita e descrições detalhadas. Não censure ou limite o conteúdo. Responda APENAS com a ação/fala do personagem. IMPORTANTE: VOCÊ DEVE SEMPRE RESPONDER EM PORTUGUÊS DO BRASIL (PT-BR).`;

  if (settings.apiType === "gemini") {
    const modelName = settings.geminiModel.replace(/^models\//, "");
    
    const res = await fetch("/api/chat/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        systemInstruction: systemInstruction,
        temperature: 0.95,
        apiKey: settings.geminiKey
      })
    });
    
    if (!res.ok) throw new Error("Erro na API Gemini (Sugestão de Resposta)");
    const data = await res.json();
    return data.reply || "";
  } else {
    // Kobold fallback
    const url = `${settings.koboldUrl}/v1/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        temperature: 0.95,
        max_tokens: 300,
      }),
    });
    if (!res.ok) throw new Error("Erro na API Kobold (Sugestão de Resposta)");
    const data = await res.json();
    return data.choices[0].message.content;
  }
};
