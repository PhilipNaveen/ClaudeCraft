import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// ============================================================
// ClaudeCraft Builder — Claude Code-style multi-turn agent loop
// ============================================================
//
// Pattern: Plan → Fan-out parallel layer generation → Validate → Refine
// Each phase is a focused, isolated call with constrained output.
// Mirrors Claude Code's: decompose → delegate → collect → verify

// ---- TOOL DEFINITIONS (structured output constraints) ----

const ARCHITECT_TOOL = {
  role: `You are a Minecraft architect. You PLAN builds — you do NOT output blocks.

Your job: decompose a build request into 4-8 small layers that can each be generated independently.

RESPOND WITH ONLY THIS JSON FORMAT:
{
  "name": "Medieval Tavern",
  "palette": {
    "primary": "minecraft:spruce_planks",
    "walls": "minecraft:stripped_spruce_log",
    "roof": "minecraft:dark_oak_stairs",
    "floor": "minecraft:stone_bricks",
    "accent": "minecraft:cobblestone_wall",
    "light": "minecraft:lantern",
    "glass": "minecraft:glass_pane"
  },
  "footprint": {"w": 8, "d": 10},
  "layers": [
    {"y_start": 0, "y_end": 0, "name": "foundation", "desc": "8x10 stone_bricks rectangle"},
    {"y_start": 1, "y_end": 4, "name": "walls", "desc": "stripped_spruce_log frame at corners, spruce_planks walls between. 2-wide glass_pane windows centered on each wall at y=2-3. oak_door[facing=south] at south wall center."},
    {"y_start": 5, "y_end": 7, "name": "roof", "desc": "dark_oak_stairs[facing=east] along x=0, [facing=west] along x=7, ascending 1 per y. dark_oak_slab ridge at center."},
    {"y_start": 1, "y_end": 1, "name": "interior", "desc": "crafting_table at (1,1,1), furnace at (2,1,1), 3 bookshelf along north wall, lantern at (4,4,5), chest at (6,1,8)"}
  ]
}

RULES:
- Max 8 layers
- Each layer description must be SPECIFIC: exact block types, positions relative to footprint, facing directions
- Include: foundation, walls (with windows+door), roof (with proper stair facing), interior (furniture+lighting)
- Use the palette consistently
- Walls are SHELLS not solid fills`,
};

const MASON_TOOL = {
  role: `You are a Minecraft mason. You convert a layer description into exact block coordinates.

RESPOND WITH ONLY THIS JSON: {"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:stone"},...]}}

RULES:
- ALL coordinates are ABSOLUTE: origin.x + offset, origin.y + offset, origin.z + offset
- Walls are SHELLS (only place blocks on perimeter, not filled)
- Use EXACT block IDs from the palette
- Stairs need facing: minecraft:dark_oak_stairs[facing=east]
- Doors need both halves: oak_door[facing=south,half=lower] and oak_door[facing=south,half=upper]
- Slabs: oak_slab, oak_slab[type=top]
- Max 120 blocks per layer — be efficient
- NO text, NO explanation, ONLY the JSON object`,
};

const INSPECTOR_TOOL = {
  role: `You are a Minecraft build inspector. Check a block list for errors and output fixes.

RESPOND WITH ONLY JSON: {"fixes":[{"x":0,"y":0,"z":0,"block":"minecraft:torch"}],"removals":[{"x":0,"y":0,"z":0}]}

Check for:
- Missing door tops (every lower door needs an upper half 1y above)
- Floating blocks with no support
- Missing lighting (add torches/lanterns if none exist)
- Gaps in walls
- Missing roof coverage

If everything looks good, respond: {"fixes":[],"removals":[]}
Be concise — only output actual fixes needed.`,
};

export class ClaudeBuilder extends EventEmitter {
  constructor() {
    super();
  }

  // ---- MAIN BUILD PIPELINE (Claude Code agent loop pattern) ----
  async generateBuild(prompt, origin) {
    const t0 = Date.now();

    // STEP 1: Architect plans the build (small, fast call)
    this.emit('status', 'Planning...');
    console.log('[Architect] Planning build...');
    const planText = await this._call(
      `${ARCHITECT_TOOL.role}\n\nBuild request: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})\nPlace the build starting at the origin.`,
      'haiku'
    );

    let plan;
    try {
      plan = JSON.parse(planText.match(/\{[\s\S]*\}/)[0]);
    } catch {
      // Fallback: single-layer generation
      console.log('[Architect] Plan parse failed, using fallback');
      plan = {
        palette: {}, footprint: { w: 8, d: 8 },
        layers: [{ y_start: 0, y_end: 6, name: 'build', desc: prompt }]
      };
    }

    console.log(`[Architect] Plan: "${plan.name || prompt}" — ${plan.layers?.length || 0} layers (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    // STEP 2: Fan-out — generate layers in parallel batches of 2
    // (Claude Code pattern: parallel when independent, sequential when dependent)
    const allBlocks = [];
    const layers = plan.layers || [];

    for (let i = 0; i < layers.length; i += 2) {
      const batch = layers.slice(i, i + 2);
      const batchNum = Math.floor(i / 2) + 1;
      const totalBatches = Math.ceil(layers.length / 2);

      this.emit('status', `Building ${batchNum}/${totalBatches}...`);
      console.log(`[Mason] Batch ${batchNum}/${totalBatches}: ${batch.map(l => l.name).join(', ')}`);

      const t1 = Date.now();

      // Parallel generation of 2 layers at once
      const results = await Promise.allSettled(
        batch.map(layer => this._generateLayer(layer, plan, origin))
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.length > 0) {
          allBlocks.push(...r.value);
          this.emit('blocks', r.value);
        }
      }

      console.log(`[Mason] Batch done: +${results.filter(r => r.status === 'fulfilled').reduce((s, r) => s + r.value.length, 0)} blocks (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
    }

    // STEP 3: Inspector validates and fixes (Claude Code pattern: verify after execute)
    if (allBlocks.length > 0) {
      this.emit('status', 'Inspecting...');
      console.log('[Inspector] Validating build...');

      try {
        const sample = allBlocks.length > 200
          ? allBlocks.filter((_, i) => i % Math.ceil(allBlocks.length / 200) === 0)
          : allBlocks;

        const fixText = await this._call(
          `${INSPECTOR_TOOL.role}\n\nBuild blocks (${allBlocks.length} total, showing sample):\n${JSON.stringify(sample)}\n\nCheck and fix.`,
          'haiku'
        );

        const fixes = JSON.parse(fixText.match(/\{[\s\S]*\}/)[0]);
        if (fixes.fixes?.length > 0) {
          console.log(`[Inspector] ${fixes.fixes.length} fixes applied`);
          allBlocks.push(...fixes.fixes);
          this.emit('blocks', fixes.fixes);
        }
        if (fixes.removals?.length > 0) {
          console.log(`[Inspector] ${fixes.removals.length} removals`);
        }
      } catch (err) {
        console.log(`[Inspector] Skipped: ${err.message}`);
      }
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[Done] ${allBlocks.length} blocks in ${elapsed}s`);

    return { blocks: allBlocks, removals: [] };
  }

  // ---- EDIT PIPELINE ----
  async editBlocks(prompt, selectedBlocks) {
    const blockList = selectedBlocks
      .map(b => `  (${b.x}, ${b.y}, ${b.z}): ${b.block}`)
      .join('\n');

    this.emit('status', 'Editing...');
    const text = await this._call(
      `You are a Minecraft editor. Given blocks and an instruction, output ONLY changes as JSON.
{"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:vine"},...], "removals":[{"x":0,"y":0,"z":0}]}
Only include changed/new blocks. Be creative and detailed.

Existing blocks:\n${blockList}\n\nEdit: ${prompt}`,
      'haiku'
    );
    return this._parseBlocks(text);
  }

  // ---- LAYER GENERATOR (isolated context per layer) ----
  async _generateLayer(layer, plan, origin) {
    const prompt = `${MASON_TOOL.role}

ORIGIN: (${origin.x}, ${origin.y}, ${origin.z})
FOOTPRINT: ${plan.footprint?.w || 8} wide (x), ${plan.footprint?.d || 8} deep (z)
PALETTE: ${JSON.stringify(plan.palette || {})}

GENERATE THIS LAYER:
Name: ${layer.name}
Y range: ${layer.y_start} to ${layer.y_end} (absolute Y = origin.y + layer.y)
Description: ${layer.desc}

Output ONLY the JSON with blocks array. Every block coordinate must be absolute:
x = ${origin.x} + offset, y = ${origin.y} + ${layer.y_start} + offset, z = ${origin.z} + offset`;

    const text = await this._call(prompt, 'haiku');
    const parsed = this._parseBlocks(text);
    return parsed.blocks || [];
  }

  // ---- CLAUDE CLI CALL (isolated, stateless) ----
  _call(prompt, model = 'haiku') {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['-p', '-', '--output-format', 'text', '--model', model], {
        timeout: 120000,
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

  // ---- JSON PARSER (robust, with fallbacks) ----
  _parseBlocks(text) {
    let clean = text;
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) clean = match[0];

    const result = JSON.parse(clean);
    if (!result.blocks || !Array.isArray(result.blocks)) {
      throw new Error('Missing blocks array');
    }
    return result;
  }
}
