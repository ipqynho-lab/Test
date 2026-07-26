import { TTSSettings } from "../types";

function parseAudioMimeType(mimeType: string) {
  let bitsPerSample = 16;
  let rate = 24000;
  const parts = mimeType.split(";");
  for (const param of parts) {
    const p = param.trim();
    if (p.toLowerCase().startsWith("rate=")) {
      rate = parseInt(p.split("=")[1], 10) || 24000;
    } else if (p.toLowerCase().startsWith("audio/l")) {
      bitsPerSample = parseInt(p.toLowerCase().split("l")[1], 10) || 16;
    }
  }
  return { bitsPerSample, rate };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function convertToWav(audioData: Uint8Array, mimeType: string): Uint8Array {
  const { bitsPerSample, rate } = parseAudioMimeType(mimeType);
  const numChannels = 1;
  const dataSize = audioData.length;
  const bytesPerSample = Math.floor(bitsPerSample / 8);
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = rate * blockAlign;
  const chunkSize = 36 + dataSize;
  
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, chunkSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  
  const audioBuffer = new Uint8Array(buffer);
  audioBuffer.set(audioData, 44);
  
  return audioBuffer;
}


export async function generateTTS(text: string, settings: TTSSettings, ttsParams?: Record<string, string>, apiKey?: string): Promise<string> {
  if (!text) throw new Error("No text provided for TTS");
  const modelName = settings.model || "gemini-3.1-flash-tts-preview";
  let finalText = text;
  
  if (ttsParams) {
    const directions = Object.entries(ttsParams).map(([k, v]) => `${k}: ${v}`).join(", ");
    if (directions) {
      finalText = `Read this with the following context (${directions}):\n${text}`;
    }
  }

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: finalText,
      model: modelName,
      voice: settings.voice || "Puck",
      apiKey: apiKey
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || "Error generating TTS");
  }

  const data = await res.json();
  const base64Data = data.audio;
  let mimeType = data.mimeType || "audio/pcm;rate=24000";
  
  const rawAudio = base64ToUint8Array(base64Data);
  let finalAudio = rawAudio;
  
  // If it's raw PCM, wrap it in WAV
  if (!mimeType.includes("wav") && !mimeType.includes("mp3") && !mimeType.includes("ogg")) {
     finalAudio = convertToWav(rawAudio, mimeType);
     mimeType = "audio/wav";
  }

  const blob = new Blob([finalAudio], { type: mimeType });
  return URL.createObjectURL(blob);
}
