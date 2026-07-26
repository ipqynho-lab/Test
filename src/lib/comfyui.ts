import { AppState, ComfyUISettings } from "../types";

export const generateComfyUITags = async (state: AppState, lastMessage: string): Promise<string> => {
  const { settings } = state;
  
  if (settings.apiType === "gemini" && !settings.geminiModel) {
    console.warn("Gemini model is missing. Falling back to empty tags.");
    return "";
  }

  if (settings.apiType === "kobold" && !settings.koboldUrl) {
    console.warn("Kobold URL is missing. Falling back to empty tags.");
    return "";
  }

  let prompt = `Convert the following roleplay message into a single line of comma-separated English tags for image generation.
Do not write any introductory text, explanation, sentences, lists, bullet points, or category headers.

Message: "${lastMessage}"`;

  if (settings.comfyUI?.promptInstructions) {
    prompt += `\n\nAdditional Instructions: ${settings.comfyUI.promptInstructions}`;
  }

  prompt += `\n\nComma-separated tags:`;

  const cleanTags = (text: string) => {
    // 1. Remove thinking / thought blocks
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
                      .replace(/<thought>[\s\S]*?<\/thought>/gi, '');
    
    // 2. Split by commas, semicolons, and newlines to parse individual candidate phrases/tags
    const rawCandidates = cleaned.split(/[,;\n\r]+/);
    const validTags: string[] = [];

    const metaLabelsToDiscard = [
      "source text", "task", "focus areas", "constraints", "instructions", 
      "note", "example input", "example output", "output", "result", 
      "here are the tags", "prompt", "system", "focus"
    ];

    for (let candidate of rawCandidates) {
      let trimmed = candidate.trim();
      if (!trimmed) continue;

      // Remove leading/trailing markdown characters and trailing periods
      trimmed = trimmed.replace(/^[*_#"`'\-\s]+|[*_#"`'\-\s.:]+$/g, '').trim();
      if (!trimmed) continue;

      // Check if it contains a colon
      if (trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':');
        const left = trimmed.substring(0, colonIndex).trim().toLowerCase();
        const right = trimmed.substring(colonIndex + 1).trim();

        // If the left side is a meta-label, discard the entire candidate
        if (metaLabelsToDiscard.some(label => left.includes(label) || label.includes(left))) {
          continue;
        }

        // If there's a valid right side, use it as the candidate
        if (right) {
          trimmed = right.replace(/^[*_#"`'\-\s]+|[*_#"`'\-\s.:]+$/g, '').trim();
        } else {
          // If no right side, just discard
          continue;
        }
      }

      // Check for meta words or instruction keywords in the candidate itself
      const lowerCandidate = trimmed.toLowerCase();
      if (metaLabelsToDiscard.some(label => lowerCandidate.includes(label))) {
        continue;
      }

      // Discard short negative/instruction phrases
      if (/\b(no explanations|no markdown|no bullet|only comma-separated|comma-separated|separated by)\b/i.test(lowerCandidate)) {
        continue;
      }

      // Filter out candidates that are full sentences or descriptions
      if (trimmed.split(/\s+/).length > 6) {
        // If it looks like a sentence (has verbs/conjunctions like "is", "should", "do", "extract", "describe")
        if (/\b(is|should|do|extract|describe|the|from|message|roleplay|style|only|separated|explanations|markdown|bullet|points|sentences|valid)\b/i.test(trimmed)) {
          continue;
        }
      }

      // Remove parentheses but keep the content inside them
      trimmed = trimmed.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();

      if (trimmed) {
        validTags.push(trimmed);
      }
    }

    return validTags.join(', ');
  };

  try {
    if (settings.apiType === "gemini") {
      const modelName = settings.geminiModel.replace(/^models\//, "");
      const res = await fetch("/api/chat/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: prompt }],
          systemInstruction: "You are an AI that outputs ONLY comma-separated Danbooru tags. You must never output colons, category headers (like Character:, Setting:), list labels, explanations, markdown, or full sentences. Output raw comma-separated words only.",
          temperature: 0.5,
          maxTokens: 150,
          safetySettings: {
            harassment: "BLOCK_NONE",
            hate: "BLOCK_NONE",
            sexuallyExplicit: "BLOCK_NONE",
            dangerousContent: "BLOCK_NONE"
          }
        })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        console.error("Gemini API error in generateComfyUITags:", errText);
        return "";
      }
      const data = await res.json();
      
      if (!data.reply) {
        console.warn("Gemini returned empty or blocked response:", JSON.stringify(data));
      }
      
      return cleanTags(data.reply || "");
    } else {
      const url = `${settings.koboldUrl}/v1/chat/completions`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are an AI that outputs ONLY comma-separated Danbooru tags. You must never output colons, category headers (like Character:, Setting:), list labels, explanations, markdown, or full sentences. Output raw comma-separated words only." },
            { role: "user", content: prompt }
          ],
          temperature: 0.5,
          max_tokens: 150,
        }),
      });
      
      if (!res.ok) return "";
      const data = await res.json();
      return cleanTags(data.choices?.[0]?.message?.content || "");
    }
  } catch (e) {
    console.error("Failed to generate tags", e);
    return "";
  }
};

export const buildComfyUIWorkflow = (settings: ComfyUISettings, dynamicTags: string) => {
  const positivePrompt = `${settings.basePrompt}, ${dynamicTags}`.replace(/,\s*,/g, ',').trim();
  const seed = settings.seed === -1 ? Math.floor(Math.random() * 9999999999) : settings.seed;

  let nodes: Record<string, any> = {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed: seed,
        steps: settings.steps,
        cfg: settings.cfgScale,
        sampler_name: settings.sampler,
        scheduler: settings.scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0]
      }
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: settings.checkpoint
      }
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        batch_size: 1,
        width: settings.width,
        height: settings.height
      }
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: positivePrompt,
        clip: ["4", 1]
      }
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: settings.negativePrompt,
        clip: ["4", 1]
      }
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2]
      }
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "AIStudioGen",
        images: ["8", 0]
      }
    }
  };

  // If there are LoRAs, we need to inject LoraLoader nodes
  if (settings.loras && settings.loras.length > 0) {
    let currentModelId = "4"; // Checkpoint
    let currentClipId = "4"; // Checkpoint
    
    settings.loras.forEach((lora, index) => {
      if (!lora.name) return;
      const loraId = `10${index}`;
      nodes[loraId] = {
        class_type: "LoraLoader",
        inputs: {
          lora_name: lora.name,
          strength_model: lora.weight,
          strength_clip: lora.weight,
          model: [currentModelId, 0],
          clip: [currentClipId, 1]
        }
      };
      currentModelId = loraId;
      currentClipId = loraId;
    });

    // Update KSampler and CLIPTextEncode to use the last Lora output
    nodes["3"].inputs.model = [currentModelId, 0];
    nodes["6"].inputs.clip = [currentClipId, 1];
    nodes["7"].inputs.clip = [currentClipId, 1];
  }

  return nodes;
};

export const generateImageComfyUI = async (
  comfySettings: ComfyUISettings, 
  dynamicTags: string,
  onProgress?: (progress: number) => void
): Promise<string[]> => {
  const workflow = buildComfyUIWorkflow(comfySettings, dynamicTags);
  const baseUrl = comfySettings.url.replace(/\/$/, '');
  const clientId = Math.random().toString(36).substring(2, 15);

  try {
    // 1. Submit prompt
    const promptRes = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId
      })
    });
    
    if (!promptRes.ok) throw new Error("Falha ao enviar prompt para o ComfyUI");
    const promptData = await promptRes.json();
    const promptId = promptData.prompt_id;

    // 2. Poll for history (we could use websocket, but polling is simpler for a client without persistent connection)
    let isFinished = false;
    let imageUrls: string[] = [];

    // Simulate progress if we can't connect to WS
    let simulatedProgress = 0;
    
    while (!isFinished) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Poll every 1.5s
      
      try {
        const historyRes = await fetch(`${baseUrl}/history/${promptId}`);
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          if (historyData[promptId]) {
            isFinished = true;
            // Extract outputs
            const outputs = historyData[promptId].outputs;
            for (const nodeId in outputs) {
              const nodeOutput = outputs[nodeId];
              if (nodeOutput.images) {
                for (const image of nodeOutput.images) {
                  imageUrls.push(
                    `${baseUrl}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || '')}&type=${image.type}`
                  );
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("Error polling ComfyUI history", e);
      }
      
      if (!isFinished && onProgress) {
        simulatedProgress = Math.min(simulatedProgress + (100 / (comfySettings.steps || 20)), 95);
        onProgress(Math.floor(simulatedProgress));
      }
    }

    if (onProgress) onProgress(100);
    return imageUrls;
  } catch (error) {
    console.error("ComfyUI API Error:", error);
    throw error;
  }
};
