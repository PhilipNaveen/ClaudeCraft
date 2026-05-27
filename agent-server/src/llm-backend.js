import { spawn } from 'child_process';

// ============================================================
// LLM Backend — pluggable, with process tracking for cancellation
// ============================================================

export class LLMBackend {
  constructor() {
    this.backend = this._detectBackend();
    this._activeProcs = new Set();
    console.log(`[LLM] Backend: ${this.backend}`);
  }

  _detectBackend() {
    if (process.env.OPENROUTER_API_KEY) return 'openrouter';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.OLLAMA_HOST || process.env.USE_OLLAMA) return 'ollama';
    return 'claude';
  }

  killAll() {
    for (const proc of this._activeProcs) {
      try { proc.kill('SIGKILL'); } catch {}
    }
    this._activeProcs.clear();
  }

  async call(prompt, tier = 'fast') {
    switch (this.backend) {
      case 'openrouter': return this._callOpenRouter(prompt, tier);
      case 'gemini': return this._callGemini(prompt, tier);
      case 'groq': return this._callGroq(prompt, tier);
      case 'ollama': return this._callOllama(prompt, tier);
      case 'claude': return this._callClaude(prompt, tier);
    }
  }

  // ---- CLAUDE CLI (haiku for speed) ----
  _callClaude(prompt, tier) {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['-p', '-', '--output-format', 'text', '--model', 'haiku'], {
        timeout: 600000,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' }
      });

      this._activeProcs.add(proc);

      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', () => {});
      proc.on('close', (code) => {
        this._activeProcs.delete(proc);
        if (code !== 0 && !stdout.trim()) reject(new Error(`exited ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', (err) => {
        this._activeProcs.delete(proc);
        reject(err);
      });
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  // ---- OPENROUTER ----
  async _callOpenRouter(prompt, tier) {
    const freeModels = [
      'qwen/qwen-2.5-72b-instruct:free',
      'google/gemma-2-9b-it:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'meta-llama/llama-3.3-70b-instruct:free',
    ];
    for (let i = 0; i < freeModels.length; i++) {
      const model = freeModels[i];
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/PhilipNaveen/ClaudeCraft' },
          body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 8000 })
        });
        if (resp.status === 429) continue;
        if (!resp.ok) continue;
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      } catch { continue; }
    }
    throw new Error('All free models rate limited');
  }

  // ---- GEMINI ----
  async _callGemini(prompt, tier) {
    const model = tier === 'quality' ? 'gemini-2.0-flash' : 'gemini-2.0-flash-lite';
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' } })
    });
    if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
    return (await resp.json()).candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // ---- GROQ ----
  async _callGroq(prompt, tier) {
    const model = tier === 'quality' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } })
      });
      if (resp.status === 429) { await new Promise(r => setTimeout(r, 15000)); continue; }
      if (!resp.ok) throw new Error(`Groq ${resp.status}`);
      return (await resp.json()).choices[0].message.content.trim();
    }
  }

  // ---- OLLAMA ----
  async _callOllama(prompt, tier) {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    const resp = await fetch(`${host}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format: 'json', options: { temperature: 0.7, num_predict: 8000 } })
    });
    if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
    return (await resp.json()).response.trim();
  }
}
