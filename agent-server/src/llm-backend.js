import { spawn } from 'child_process';

// ============================================================
// LLM Backend — pluggable: Claude CLI, Groq (free+fast), Ollama (local)
// ============================================================

export class LLMBackend {
  constructor() {
    // Priority: GROQ_API_KEY → Ollama (local) → Claude CLI
    this.backend = this._detectBackend();
    console.log(`[LLM] Backend: ${this.backend}`);
  }

  _detectBackend() {
    if (process.env.GROQ_API_KEY) return 'groq';
    if (process.env.OLLAMA_HOST || process.env.USE_OLLAMA) return 'ollama';
    return 'claude';
  }

  async call(prompt, tier = 'fast') {
    // tier: 'fast' (small model, quick) or 'quality' (big model, slower)
    switch (this.backend) {
      case 'groq': return this._callGroq(prompt, tier);
      case 'ollama': return this._callOllama(prompt, tier);
      case 'claude': return this._callClaude(prompt, tier);
    }
  }

  // ---- GROQ: Free, ~800 tok/s, Llama 3.3 70B ----
  async _callGroq(prompt, tier) {
    const model = tier === 'quality' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      })
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Groq error ${resp.status}: ${err}`);
    }

    const data = await resp.json();
    return data.choices[0].message.content.trim();
  }

  // ---- OLLAMA: Free, local, any model ----
  async _callOllama(prompt, tier) {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL || (tier === 'quality' ? 'llama3.1:70b' : 'llama3.1:8b');

    const resp = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.7, num_predict: 8000 }
      })
    });

    if (!resp.ok) throw new Error(`Ollama error ${resp.status}`);
    const data = await resp.json();
    return data.response.trim();
  }

  // ---- CLAUDE CLI: Uses Claude Code subscription ----
  _callClaude(prompt, tier) {
    const model = tier === 'quality' ? 'sonnet' : 'haiku';
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['-p', '-', '--output-format', 'text', '--model', model], {
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
}
