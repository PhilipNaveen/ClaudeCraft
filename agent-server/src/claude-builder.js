import { spawn } from 'child_process';
import { EventEmitter } from 'events';

const PLAN_PROMPT = `You are an expert Minecraft architect. Output a JSON build plan with layers.

RESPOND ONLY WITH JSON:
{"materials":{"primary":"minecraft:nether_bricks","secondary":"minecraft:nether_brick_fence"},"layers":[{"y":0,"desc":"10x10 nether_bricks floor"},{"y":"1-3","desc":"walls: nether_bricks shell, nether_brick_fence windows at y=2"},{"y":"4","desc":"nether_brick_stairs roof edges, nether_brick_slab cap"}],"size":{"w":10,"d":10,"h":5}}

Keep layers SHORT. Max 8 layers. Each layer description must be specific about what blocks go where.`;

const LAYER_PROMPT = `You are a Minecraft block placement engine. Generate blocks for ONE layer of a build.

RESPOND WITH ONLY JSON: {"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:stone"},...]}

RULES:
- Absolute coordinates (origin + offset)
- Valid minecraft: block IDs only
- Walls = shell only, not filled solid
- MAX 100 blocks per layer
- NO text, ONLY JSON

BLOCKS: stone_bricks, cobblestone, oak_planks, spruce_planks, dark_oak_planks, oak_log, spruce_log, glass_pane, oak_door[facing=south,half=lower], oak_stairs[facing=east], oak_slab, oak_fence, cobblestone_wall, torch, lantern, bookshelf, crafting_table, furnace, chest, nether_bricks, nether_brick_fence, nether_brick_stairs[facing=east], soul_sand, soul_lantern, blackstone, deepslate_bricks, moss_block, vine, oak_leaves`;

const EDIT_PROMPT = `Minecraft block editor. Output ONLY changes as JSON.
{"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:vine"},...], "removals":[{"x":0,"y":0,"z":0}]}
Only changed/new blocks and removals. Be creative.`;

export class ClaudeBuilder extends EventEmitter {
  constructor() {
    super();
  }

  async generateBuild(prompt, origin) {
    // Phase 1: Plan
    this.emit('status', 'Planning...');
    console.log('[Plan] Starting...');
    const t0 = Date.now();
    const planText = await this._callClaude(
      `${PLAN_PROMPT}\n\nBuild: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})`,
      'haiku'
    );
    console.log(`[Plan] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    let plan;
    try {
      const match = planText.match(/\{[\s\S]*\}/);
      plan = JSON.parse(match[0]);
    } catch {
      console.error('[Plan] Parse failed, using raw text');
      plan = { layers: [{ y: "0-10", desc: planText }], size: { w: 10, d: 10, h: 10 } };
    }

    // Phase 2: Generate each layer as a separate small call
    const allBlocks = [];
    const layers = plan.layers || [];
    console.log(`[Build] ${layers.length} layers to generate`);

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      this.emit('status', `Building layer ${i + 1}/${layers.length}...`);
      console.log(`[Layer ${i + 1}/${layers.length}] ${layer.desc?.substring(0, 60)}...`);

      const t1 = Date.now();
      const layerPrompt = `${LAYER_PROMPT}\n\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})\nBuild size: ${plan.size?.w || 10}x${plan.size?.h || 10}x${plan.size?.d || 10}\nMaterials: ${JSON.stringify(plan.materials || {})}\n\nGenerate layer: y=${layer.y}, description: ${layer.desc}\n\nONLY JSON.`;

      try {
        const text = await this._callClaude(layerPrompt, 'haiku');
        const parsed = this._parseResponse(text);

        allBlocks.push(...parsed.blocks);
        // Send this layer's blocks to mod immediately
        this.emit('blocks', parsed.blocks);
        console.log(`[Layer ${i + 1}] ${parsed.blocks.length} blocks in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
      } catch (err) {
        console.error(`[Layer ${i + 1}] Failed: ${err.message}`);
      }
    }

    console.log(`[Build] Total: ${allBlocks.length} blocks`);
    return { blocks: allBlocks, removals: [] };
  }

  async editBlocks(prompt, selectedBlocks) {
    const blockList = selectedBlocks
      .map(b => `  (${b.x}, ${b.y}, ${b.z}): ${b.block}`)
      .join('\n');

    this.emit('status', 'Editing...');
    const text = await this._callClaude(
      `${EDIT_PROMPT}\n\nExisting:\n${blockList}\n\nEdit: ${prompt}\n\nOnly JSON.`,
      'haiku'
    );
    return this._parseResponse(text);
  }

  _callClaude(prompt, model = 'haiku') {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['-p', '-', '--output-format', 'text', '--model', model], {
        timeout: 120000,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'cli' }
      });

      let stdout = '';
      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', () => {});
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`exited ${code}`));
        else resolve(stdout.trim());
      });
      proc.on('error', reject);
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  _parseResponse(text) {
    let clean = text;
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];

    const result = JSON.parse(clean);
    if (!result.blocks || !Array.isArray(result.blocks)) {
      throw new Error('Missing blocks');
    }
    return result;
  }
}
