import React from "react";
import { AppState, ComfyUISettings, ComfyUILora } from "../types";
import { Plus, Trash2 } from "lucide-react";

interface Props {
  comfyUI: ComfyUISettings;
  updateComfyUI: (updates: Partial<ComfyUISettings>) => void;
}

export function ComfyUISettingsPanel({ comfyUI, updateComfyUI }: Props) {
  const samplers = [
    "euler", "euler_ancestral", "heun", "dpm_2", "dpm_2_ancestral", 
    "lms", "dpm_fast", "dpm_adaptive", "dpmpp_2s_ancestral", 
    "dpmpp_sde", "dpmpp_sde_gpu", "dpmpp_2m", "dpmpp_2m_sde", 
    "dpmpp_2m_sde_gpu", "dpmpp_3m_sde", "dpmpp_3m_sde_gpu", 
    "ddim", "uni_pc"
  ];
  
  const schedulers = ["normal", "karras", "exponential", "sgm_uniform", "simple", "ddim_uniform"];

  const handleAddLora = () => {
    if (comfyUI.loras.length >= 3) {
      alert("Máximo de 3 LoRAs permitidos.");
      return;
    }
    updateComfyUI({ loras: [...comfyUI.loras, { name: "", weight: 1.0 }] });
  };

  const handleUpdateLora = (index: number, updates: Partial<ComfyUILora>) => {
    const newLoras = [...comfyUI.loras];
    newLoras[index] = { ...newLoras[index], ...updates };
    updateComfyUI({ loras: newLoras });
  };

  const handleRemoveLora = (index: number) => {
    updateComfyUI({ loras: comfyUI.loras.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs mb-1 text-zinc-400">ComfyUI URL</label>
        <input 
          type="text" 
          value={comfyUI.url}
          onChange={(e) => updateComfyUI({ url: e.target.value })}
          placeholder="http://127.0.0.1:8188"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-xs mb-1 text-zinc-400">Modelo (Checkpoint)</label>
        <input 
          type="text" 
          value={comfyUI.checkpoint}
          onChange={(e) => updateComfyUI({ checkpoint: e.target.value })}
          placeholder="illustrious.safetensors"
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1 text-zinc-400">Largura (Width)</label>
          <input 
            type="number" 
            value={comfyUI.width}
            onChange={(e) => updateComfyUI({ width: parseInt(e.target.value) || 512 })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs mb-1 text-zinc-400">Altura (Height)</label>
          <input 
            type="number" 
            value={comfyUI.height}
            onChange={(e) => updateComfyUI({ height: parseInt(e.target.value) || 512 })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1 text-zinc-400">Steps</label>
          <input 
            type="number" 
            value={comfyUI.steps}
            onChange={(e) => updateComfyUI({ steps: parseInt(e.target.value) || 20 })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs mb-1 text-zinc-400">CFG Scale</label>
          <input 
            type="number"
            step="0.5"
            value={comfyUI.cfgScale}
            onChange={(e) => updateComfyUI({ cfgScale: parseFloat(e.target.value) || 7 })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs mb-1 text-zinc-400">Seed (-1 para aleatório)</label>
        <input 
          type="number" 
          value={comfyUI.seed}
          onChange={(e) => updateComfyUI({ seed: parseInt(e.target.value) || -1 })}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs mb-1 text-zinc-400">Sampler</label>
          <select 
            value={comfyUI.sampler}
            onChange={(e) => updateComfyUI({ sampler: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
          >
            {samplers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1 text-zinc-400">Scheduler</label>
          <select 
            value={comfyUI.scheduler}
            onChange={(e) => updateComfyUI({ scheduler: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-sm text-white focus:border-blue-500 outline-none"
          >
            {schedulers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="pt-2 border-t border-zinc-800">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-xs font-semibold text-zinc-300">LoRAs (Max 3)</h4>
          <button onClick={handleAddLora} className="text-blue-400 hover:text-blue-300 p-1">
            <Plus size={14} />
          </button>
        </div>
        {comfyUI.loras.map((lora, i) => (
          <div key={i} className="flex gap-2 items-center mb-2">
            <input 
              type="text" 
              value={lora.name}
              onChange={(e) => handleUpdateLora(i, { name: e.target.value })}
              placeholder="nome_do_lora.safetensors"
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white outline-none"
            />
            <input 
              type="number" 
              step="0.1"
              value={lora.weight}
              onChange={(e) => handleUpdateLora(i, { weight: parseFloat(e.target.value) || 1 })}
              className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-white outline-none"
            />
            <button onClick={() => handleRemoveLora(i)} className="text-red-500 hover:text-red-400 p-1">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-zinc-800">
        <label className="block text-xs mb-1 text-zinc-400">Prompt Base (Identidade do Personagem)</label>
        <textarea 
          value={comfyUI.basePrompt}
          onChange={(e) => updateComfyUI({ basePrompt: e.target.value })}
          placeholder="masterpiece, best quality, 1girl, solo, nome_personagem..."
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          Essas tags serão combinadas automaticamente com as tags geradas a partir do diálogo.
        </p>
      </div>
      
      <div>
        <label className="block text-xs mb-1 text-zinc-400">Negative Prompt</label>
        <textarea 
          value={comfyUI.negativePrompt}
          onChange={(e) => updateComfyUI({ negativePrompt: e.target.value })}
          placeholder="bad hands, bad quality..."
          rows={2}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
        />
      </div>

      <div className="pt-2 border-t border-zinc-800">
        <label className="block text-xs mb-1 text-zinc-400">Instruções para o Gerador de Tags (Opcional)</label>
        <textarea 
          value={comfyUI.promptInstructions || ""}
          onChange={(e) => updateComfyUI({ promptInstructions: e.target.value })}
          placeholder="O que o modelo deve considerar ao gerar as tags..."
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 outline-none resize-y"
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          Instruções adicionais para a IA quando for extrair as tags do diálogo.
        </p>
      </div>
    </div>
  );
}
