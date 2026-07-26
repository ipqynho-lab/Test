import { GoogleGenAI } from "@google/genai";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Route for Gemini
  app.post("/api/chat/gemini", async (req, res) => {
    try {
      const { model, messages, systemInstruction, temperature, maxTokens, thinkingLevel, safetySettings } = req.body;

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is missing" });
      }

      // Initialize with the provided key
      const ai = new GoogleGenAI({ apiKey });

      // Format messages for Gemini
      const formattedMessages = messages || [];
      
      const config: any = {
        systemInstruction: systemInstruction,
        temperature: temperature ?? 0.9,
      };
      
      if (maxTokens) {
        config.maxOutputTokens = maxTokens;
      }
      
      if (thinkingLevel && thinkingLevel !== "none") {
         let budget = 1024;
         if (thinkingLevel === 'high') budget = 4096;
         if (thinkingLevel === 'medium') budget = 2048;
         if (thinkingLevel === 'low') budget = 1024;
         if (thinkingLevel === 'minimal') budget = 512;
         config.thinkingConfig = { thinkingBudgetTokens: budget };
      }
      
      if (safetySettings) {
         config.safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: safetySettings.harassment || "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: safetySettings.hate || "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: safetySettings.sexuallyExplicit || "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: safetySettings.dangerousContent || "BLOCK_NONE" }
         ];
      }

      if (model.includes("antigravity") || model.includes("deep-research") || model.includes("omni")) {
         // Use interactions API for agents and omni models
         const lastMessage = formattedMessages.length > 0 ? formattedMessages[formattedMessages.length - 1].content : "";
         
         const inputString = formattedMessages.map((m: any) => `${m.role}: ${m.content}`).join("\n\n");
         
         const interaction = await ai.interactions.create({
            model: model.includes("omni") ? model : undefined,
            agent: model.includes("antigravity") || model.includes("deep-research") ? model : undefined,
            input: inputString,
            system_instruction: systemInstruction,
            environment: model.includes("antigravity") ? "remote" : undefined,
         }, { timeout: 300000 });
         
         let fullOutput = "";
         if (interaction.steps) {
           for (const step of interaction.steps) {
             if (step.type === 'model_output') {
               const textContent: any = step.content?.find((c: any) => c.type === 'text');
               if (textContent && textContent.text) {
                 fullOutput += textContent.text;
               }
             }
           }
         } else if (interaction.output_text) {
           fullOutput = interaction.output_text;
         }
         
         res.json({ reply: fullOutput });
         return;
      }

      const geminiMessages = formattedMessages.map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));

      const response = await ai.models.generateContent({
        model: model,
        contents: geminiMessages,
        config: config,
      });

      let reasoning = "";
      if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.thought) {
            reasoning += part.text + "\n";
          }
        }
      }

      res.json({ reply: response.text, reasoning: reasoning.trim() || undefined });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "An error occurred with the Gemini API" });
    }
  });

  // API Route for TTS
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, model, voice, apiKey: clientApiKey } = req.body;
      const apiKey = clientApiKey || process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY environment variable is missing" });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const interaction = await ai.interactions.create({
        model: model || 'gemini-3.1-flash-tts-preview',
        input: text,
        response_modalities: ['AUDIO'],
        generation_config: {
          speech_config: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice || "Puck"
              }
            }
          } as any
        }
      });
      
      let audioBase64 = "";
      let mimeType = "audio/pcm;rate=24000";

      if (interaction.steps) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output') {
            const audioContent: any = step.content?.find((c: any) => c.type === 'audio');
            if (audioContent && audioContent.data) {
              audioBase64 = audioContent.data;
              if (audioContent.mime_type) {
                mimeType = audioContent.mime_type;
              }
            }
          }
        }
      }

      if (!audioBase64) {
        return res.status(500).json({ error: "No audio generated" });
      }

      res.json({ audio: audioBase64, mimeType });
    } catch (error: any) {
      console.error("TTS API Error:", error);
      res.status(500).json({ error: error.message || "An error occurred with the TTS API" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
