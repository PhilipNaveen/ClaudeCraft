import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';

// ============================================================
// LLM Backend — persistent Claude session for speed
// ============================================================

export class LLMBackend {
  constructor() {
    this.backend = this._detectBackend();
    this._sessionId = null;
    this._lastCallTime = 0;
    this._openRouterIdx = 0;
    console.log(`[LLM] Backend: ${this.backend}`);
  }

  _detectBackend() {
    if (process.env.OPENROUTER_API_KEY) return 'openrouter';
    if (process.env.GEMINI_API_KEY) return 'gemini';
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.OLLAMA_HOST || process.env.USE_OLLAMA) return 'ollama';
    return 'claude';
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

  // ---- CLAUDE CLI with persistent session ----
  // First call: slow (boots up). Subsequent calls: fast (resumes session).
  _callClaude(prompt, tier) {
    return new Promise((resolve, reject) => {
      const args = ['-p', '-', '--output-format', 'text', '--model', 'haiku'];

      // Resume existing session if we have one
      if (this._sessionId) {
        args.push('--resume', this._sessionId);
      }

      const proc = spawn('claude', args, {
        timeout: 600000,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' }
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        // Try to capture session ID from first call for reuse
        if (!this._sessionId) {
          // Session ID is in stderr or can be found from recent sessions
          this._captureSessionId();
        }

        if (code !== 0 && !stdout.trim()) {
          // If resume failed, retry without resume
          if (this._sessionId) {
            console.log('[Claude] Session resume failed, starting fresh');
            this._sessionId = null;
            this._callClaude(prompt, tier).then(resolve).catch(reject);
            return;
          }
          reject(new Error(`exited ${code}`));
        } else {
          resolve(stdout.trim());
        }
      });

      proc.on('error', reject);
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  _captureSessionId() {
    // Try to find the most recent session from Claude's session storage
    try {
      const sessDir = `${process.env.HOME}/.claude/projects`;
      // Sessions are stored in project dirs — we'll grab it on next iteration
      // For now, use --continue on subsequent calls
      this._sessionId = '__continue__';
    } catch {}
  }

  // Override: if sessionId is __continue__, use --continue flag instead
  _callClaudeWithContinue(prompt) {
    return new Promise((resolve, reject) => {
      const args = ['-p', '-', '--output-format', 'text', '--model', 'haiku', '--continue'];

      const proc = spawn('claude', args, {
        timeout: 600000,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' }
      });

      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', () => {});
      proc.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) reject(new Error(`exited ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
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
    this._openRouterIdx = ((this._openRouterIdx || 0) + 1) % freeModels.length;

    for (let attempt = 0; attempt < freeModels.length; attempt++) {
      const tryModel = freeModels[(this._openRouterIdx + attempt) % freeModels.length];
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/PhilipNaveen/ClaudeCraft',
            'X-Title': 'ClaudeCraft'
          },
          body: JSON.stringify({
            model: tryModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 8000
          })
        });
        if (resp.status === 429) { console.log(`[OpenRouter] ${tryModel.split('/')[1]} limited`); continue; }
        if (!resp.ok) { continue; }
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) continue;
        return text;
      } catch { continue; }
    }
    throw new Error('All free models rate limited');
  }

  // ---- GEMINI ----
  async _callGemini(prompt, tier) {
    const model = tier === 'quality' ? 'gemini-2.0-flash' : 'gemini-2.0-flash-lite';
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' }
      })
    });
    if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${(await resp.text()).substring(0, 200)}`);
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // ---- GROQ ----
  async _callGroq(prompt, tier) {
    const now = Date.now();
    if (now - this._lastCallTime < 5000) await new Promise(r => setTimeout(r, 5000 - (now - this._lastCallTime)));
    const model = tier === 'quality' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';

    let trimmedPrompt = prompt;
    if (prompt.length > 12000) {
      const taskMarkers = ['ORIGIN:', 'BUILD:', 'GENERATE', 'EDIT:', 'Section:', 'Build:', 'Review'];
      let splitIdx = -1;
      for (const marker of taskMarkers) { const idx = prompt.lastIndexOf(marker); if (idx > prompt.length * 0.3) { splitIdx = idx; break; } }
      if (splitIdx > 0) {
        const knowledge = prompt.substring(0, splitIdx).split('\n').filter(l => { const t = l.trim(); return t.startsWith('-') || t.startsWith('PATTERN') || t.startsWith('NEVER') || t.includes('JSON') || t.startsWith('{') || t.startsWith('"') || t === ''; }).join('\n').substring(0, 4000);
        trimmedPrompt = knowledge + '\n\n' + prompt.substring(splitIdx);
      } else { trimmedPrompt = prompt.substring(0, 6000) + '\n...\n' + prompt.substring(prompt.length - 3000); }
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      this._lastCallTime = Date.now();
      const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: trimmedPrompt }], temperature: 0.7, max_tokens: 4096, response_format: { type: 'json_object' } })
      });
      if (resp.status === 429) {
        const body = await resp.json(); const msg = body.error?.message || '';
        const wm = msg.match(/try again in ([\d.]+)s/); const wait = wm ? parseFloat(wm[1]) * 1000 + 1000 : 15000;
        console.log(`[Groq] Rate limited, waiting ${(wait/1000).toFixed(0)}s...`); await new Promise(r => setTimeout(r, wait)); continue;
      }
      if (!resp.ok) throw new Error(`Groq ${resp.status}`);
      return (await resp.json()).choices[0].message.content.trim();
    }
  }

  // ---- OLLAMA ----
  async _callOllama(prompt, tier) {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || (tier === 'quality' ? 'llama3.1:70b' : 'llama3.1:8b');
    const resp = await fetch(`${host}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format: 'json', options: { temperature: 0.7, num_predict: 8000 } })
    });
    if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);
    return (await resp.json()).response.trim();
  }
}
