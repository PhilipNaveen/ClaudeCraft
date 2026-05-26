import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// ============================================================
// ClaudeCraft Builder — Full Claude Code agent loop
// ============================================================
// 1. Plan (Sonnet) — architect decomposes into layers
// 2. Execute (Sonnet) — mason generates layer-by-layer WITH context carry
// 3. Self-critique (Sonnet) — reviews own output, identifies issues
// 4. Retry (Sonnet) — regenerates bad layers with critique as context
// 5. Inspect & fix (Sonnet) — structural validation pass

const ARCHITECT_TOOL = `You are an expert Minecraft architect. Decompose a build into 4-8 layers.

RESPOND WITH ONLY JSON:
{
  "name": "Build Name",
  "palette": {
    "primary": "minecraft:stone_bricks",
    "walls": "minecraft:oak_planks",
    "roof": "minecraft:dark_oak_stairs",
    "floor": "minecraft:stone_bricks",
    "accent": "minecraft:dark_oak_log",
    "light": "minecraft:lantern",
    "glass": "minecraft:glass_pane"
  },
  "footprint": {"w": 10, "d": 12},
  "layers": [
    {"y_start": 0, "y_end": 0, "name": "foundation", "desc": "10x12 stone_bricks solid rectangle"},
    {"y_start": 1, "y_end": 4, "name": "walls", "desc": "dark_oak_log pillars at all 4 corners and midpoints. oak_planks fill between pillars. Glass_pane 2x2 windows centered on each wall at y=2-3. oak_door[facing=south] center of south wall."},
    {"y_start": 5, "y_end": 7, "name": "roof", "desc": "dark_oak_stairs ascending inward: [facing=east] at x=0, [facing=west] at x=9. Each y level inset by 1. dark_oak_slab ridge at center."},
    {"y_start": 1, "y_end": 3, "name": "interior", "desc": "crafting_table at (1,1,1). furnace at (2,1,1). chest at (8,1,10). bookshelf row along north wall y=1-2. lantern hanging at (5,4,6). bed at (7,1,9)."}
  ]
}

RULES:
- 4-8 layers max
- SPECIFIC descriptions: exact block types, relative positions, facing directions
- Must include: foundation, walls (with windows+doors), roof (proper stair facing), interior (furniture+lighting+decoration)
- Walls = SHELLS not solid
- Use the palette consistently
- Think architecturally: structural integrity, aesthetic coherence, livability`;

const MASON_TOOL = `You are a master Minecraft mason. Convert a layer description into exact block coordinates.

RESPOND WITH ONLY JSON: {"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:stone"},...]}}

RULES:
- ALL coordinates ABSOLUTE: origin + offset
- Walls are SHELLS (perimeter only, hollow interior)
- Use EXACT block IDs with properties where needed:
  - Stairs: minecraft:dark_oak_stairs[facing=east] (north/south/east/west)
  - Doors: oak_door[facing=south,half=lower] AND oak_door[facing=south,half=upper]
  - Slabs: oak_slab (bottom), oak_slab[type=top] (top)
  - Beds: bed[facing=south,part=foot] AND bed[facing=south,part=head]
  - Logs: oak_log[axis=y] (vertical), oak_log[axis=x] (east-west)
- Max 150 blocks per layer
- Place EVERY block needed — don't skip or abbreviate
- NO text, NO explanation, ONLY the JSON`;

const CRITIC_TOOL = `You are a Minecraft build critic. Review blocks against the original plan and identify problems.

RESPOND WITH ONLY JSON:
{
  "score": 7,
  "issues": [
    {"layer": "walls", "problem": "missing windows on north wall", "fix": "add glass_pane at y=2-3 centered on north wall"},
    {"layer": "roof", "problem": "stairs facing wrong direction on west side", "fix": "change to [facing=west]"},
    {"layer": "interior", "problem": "no lighting", "fix": "add lanterns at ceiling"}
  ],
  "missing_layers": []
}

Score 1-10. Be harsh. Check:
- Does it match the plan description?
- Are walls actually hollow shells (not solid)?
- Are windows, doors, stairs present with correct facing?
- Is there interior furniture and lighting?
- Does the roof look right (ascending stairs, not flat)?
- Any floating blocks or gaps?

If score >= 8 and no critical issues: {"score": 9, "issues": [], "missing_layers": []}`;

const INSPECTOR_TOOL = `You are a Minecraft structural inspector. Fix specific issues in a block list.

RESPOND WITH ONLY JSON: {"fixes":[{"x":0,"y":0,"z":0,"block":"minecraft:torch"}],"removals":[{"x":0,"y":0,"z":0}]}

Check and fix:
- Every oak_door[half=lower] must have oak_door[half=upper] at y+1
- Every bed[part=foot] must have bed[part=head] adjacent
- Add torches/lanterns if no lighting exists inside the build
- Fill wall gaps (single missing blocks in an otherwise solid wall)
- Remove any blocks placed inside solid walls (z-fighting)

If no fixes needed: {"fixes":[],"removals":[]}`;

export class ClaudeBuilder extends EventEmitter {
  constructor() {
    super();
  }

  async generateBuild(prompt, origin) {
    const t0 = Date.now();

    // ===== PHASE 1: ARCHITECT PLANS =====
    this.emit('chat', `§7Reading build request: §f"${prompt}"`);
    this.emit('chat', `§7Planning structure, materials, and layout...`);
    this.emit('status', 'Planning...');

    const planText = await this._call(
      `${ARCHITECT_TOOL}\n\nBuild: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})`,
      'sonnet'
    );

    let plan;
    try {
      plan = JSON.parse(planText.match(/\{[\s\S]*\}/)[0]);
    } catch {
      plan = {
        name: prompt, palette: {}, footprint: { w: 8, d: 8 },
        layers: [{ y_start: 0, y_end: 6, name: 'build', desc: prompt }]
      };
      this.emit('chat', `§e⚠ Plan was ambiguous, using simplified approach`);
    }

    const layers = plan.layers || [];
    const matList = Object.values(plan.palette || {}).slice(0, 5).map(m => m.replace('minecraft:', '')).join(', ');
    this.emit('chat', `§a✓ §fPlan: §b${plan.name || prompt}`);
    this.emit('chat', `§7  ${plan.footprint?.w || '?'}×${plan.footprint?.d || '?'} footprint, ${layers.length} layers`);
    if (matList) this.emit('chat', `§7  Palette: §f${matList}`);
    for (const l of layers) {
      this.emit('chat', `§7  · §e${l.name}§7 (y${l.y_start}-${l.y_end})`);
    }

    // ===== PHASE 2: MASON GENERATES LAYER BY LAYER (with context carry) =====
    const allBlocks = [];
    const layerResults = {}; // carry context: previous layers inform next ones

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      this.emit('chat', `§7Building §e${layer.name}§7...`);
      this.emit('status', `Layer ${i + 1}/${layers.length}: ${layer.name}`);

      const t1 = Date.now();
      const blocks = await this._generateLayerWithContext(layer, plan, origin, layerResults);

      if (blocks.length > 0) {
        allBlocks.push(...blocks);
        layerResults[layer.name] = blocks;
        this.emit('blocks', blocks);
        const layerTime = ((Date.now() - t1) / 1000).toFixed(1);
        this.emit('chat', `§a  ✓ §f${layer.name}§7 — ${blocks.length} blocks (${layerTime}s)`);
      } else {
        this.emit('chat', `§c  ✗ §f${layer.name}§7 — failed, will retry`);
        layerResults[layer.name] = [];
      }
    }

    // ===== PHASE 3: SELF-CRITIQUE =====
    this.emit('chat', `§7Reviewing build quality...`);
    this.emit('status', 'Self-critique...');

    let critique = null;
    try {
      const sample = allBlocks.length > 300
        ? allBlocks.filter((_, i) => i % Math.ceil(allBlocks.length / 300) === 0)
        : allBlocks;

      const critiqueText = await this._call(
        `${CRITIC_TOOL}\n\nOriginal request: "${prompt}"\nPlan:\n${JSON.stringify(plan, null, 1)}\n\nGenerated blocks (${allBlocks.length} total, sample):\n${JSON.stringify(sample)}\n\nReview this build.`,
        'sonnet'
      );
      critique = JSON.parse(critiqueText.match(/\{[\s\S]*\}/)[0]);

      this.emit('chat', `§7  Quality score: §f${critique.score}/10`);
      if (critique.issues?.length > 0) {
        for (const issue of critique.issues.slice(0, 4)) {
          this.emit('chat', `§e  ⚠ ${issue.layer}: §7${issue.problem}`);
        }
      } else {
        this.emit('chat', `§a  ✓ §7No issues found`);
      }
    } catch (err) {
      this.emit('chat', `§7  Critique skipped`);
    }

    // ===== PHASE 4: RETRY BAD LAYERS (if critique found issues) =====
    if (critique && critique.score < 8 && critique.issues?.length > 0) {
      const badLayers = [...new Set(critique.issues.map(i => i.layer))];
      this.emit('chat', `§7Regenerating ${badLayers.length} layers with fixes...`);
      this.emit('status', 'Fixing issues...');

      for (const layerName of badLayers) {
        const layer = layers.find(l => l.name === layerName);
        if (!layer) continue;

        const issues = critique.issues
          .filter(i => i.layer === layerName)
          .map(i => `${i.problem} → ${i.fix}`)
          .join('; ');

        this.emit('chat', `§7  Rebuilding §e${layerName}§7...`);
        const t2 = Date.now();

        // Remove old blocks from this layer
        const oldBlocks = layerResults[layerName] || [];
        for (const ob of oldBlocks) {
          const idx = allBlocks.findIndex(b => b.x === ob.x && b.y === ob.y && b.z === ob.z);
          if (idx >= 0) allBlocks.splice(idx, 1);
        }

        // Regenerate with critique context
        const newBlocks = await this._generateLayerWithCritique(layer, plan, origin, layerResults, issues);

        if (newBlocks.length > 0) {
          allBlocks.push(...newBlocks);
          layerResults[layerName] = newBlocks;
          this.emit('blocks', newBlocks);
          const fixTime = ((Date.now() - t2) / 1000).toFixed(1);
          this.emit('chat', `§a  ✓ §f${layerName}§7 rebuilt — ${newBlocks.length} blocks (${fixTime}s)`);
        }
      }
    }

    // ===== PHASE 5: STRUCTURAL INSPECTOR =====
    this.emit('chat', `§7Running structural inspection...`);
    this.emit('status', 'Inspecting...');

    try {
      const sample = allBlocks.length > 250
        ? allBlocks.filter((_, i) => i % Math.ceil(allBlocks.length / 250) === 0)
        : allBlocks;

      const fixText = await this._call(
        `${INSPECTOR_TOOL}\n\nBlocks (${allBlocks.length} total):\n${JSON.stringify(sample)}\n\nFix structural issues.`,
        'haiku'
      );

      const fixes = JSON.parse(fixText.match(/\{[\s\S]*\}/)[0]);
      if (fixes.fixes?.length > 0) {
        allBlocks.push(...fixes.fixes);
        this.emit('blocks', fixes.fixes);
        this.emit('chat', `§a  ✓ §7${fixes.fixes.length} structural fixes applied`);
      } else {
        this.emit('chat', `§a  ✓ §7Structure is solid`);
      }
    } catch {
      this.emit('chat', `§7  Inspection skipped`);
    }

    // ===== DONE =====
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    this.emit('chat', `§a§l✓ Build complete! §r§f${allBlocks.length} blocks §7in ${elapsed}s`);
    this.emit('chat', `§7Position with §fArrow keys§7/§fPgUp§7/§fPgDn§7, §fR§7 to rotate, §fEnter§7 to place`);

    return { blocks: allBlocks, removals: [] };
  }

  // ---- LAYER WITH CONTEXT (previous layers inform this one) ----
  async _generateLayerWithContext(layer, plan, origin, prevResults) {
    // Build context summary of what's been placed so far
    let contextSummary = '';
    const prevNames = Object.keys(prevResults);
    if (prevNames.length > 0) {
      contextSummary = '\n\nALREADY PLACED (build on top of / adjacent to these):';
      for (const name of prevNames) {
        const blocks = prevResults[name];
        if (blocks.length === 0) continue;
        const ys = blocks.map(b => b.y);
        const types = {};
        blocks.forEach(b => { types[b.block] = (types[b.block] || 0) + 1; });
        const topTypes = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t.replace('minecraft:', '')}(${c})`).join(', ');
        contextSummary += `\n  ${name}: ${blocks.length} blocks at y=${Math.min(...ys)}-${Math.max(...ys)} [${topTypes}]`;
      }
    }

    const prompt = `${MASON_TOOL}

ORIGIN: (${origin.x}, ${origin.y}, ${origin.z})
FOOTPRINT: ${plan.footprint?.w || 8} wide (x-axis), ${plan.footprint?.d || 8} deep (z-axis)
PALETTE: ${JSON.stringify(plan.palette || {})}
${contextSummary}

GENERATE THIS LAYER:
Name: ${layer.name}
Y range: y_start=${layer.y_start}, y_end=${layer.y_end}
Absolute Y: ${origin.y + layer.y_start} to ${origin.y + layer.y_end}
Description: ${layer.desc}

Every coordinate must be absolute. x starts at ${origin.x}, z starts at ${origin.z}, y starts at ${origin.y + layer.y_start}.`;

    try {
      const text = await this._call(prompt, 'sonnet');
      return this._parseBlocks(text).blocks || [];
    } catch (err) {
      console.error(`[Mason] Layer ${layer.name} failed: ${err.message}`);
      return [];
    }
  }

  // ---- LAYER WITH CRITIQUE (regenerate with fix instructions) ----
  async _generateLayerWithCritique(layer, plan, origin, prevResults, issues) {
    let contextSummary = '';
    const prevNames = Object.keys(prevResults).filter(n => n !== layer.name);
    if (prevNames.length > 0) {
      contextSummary = '\n\nALREADY PLACED:';
      for (const name of prevNames) {
        const blocks = prevResults[name];
        if (blocks.length === 0) continue;
        contextSummary += `\n  ${name}: ${blocks.length} blocks`;
      }
    }

    const prompt = `${MASON_TOOL}

ORIGIN: (${origin.x}, ${origin.y}, ${origin.z})
FOOTPRINT: ${plan.footprint?.w || 8} wide (x), ${plan.footprint?.d || 8} deep (z)
PALETTE: ${JSON.stringify(plan.palette || {})}
${contextSummary}

GENERATE THIS LAYER (RETRY — fix the issues listed below):
Name: ${layer.name}
Y range: ${layer.y_start} to ${layer.y_end}
Absolute Y: ${origin.y + layer.y_start} to ${origin.y + layer.y_end}
Description: ${layer.desc}

ISSUES FROM PREVIOUS ATTEMPT (you MUST fix these):
${issues}

Be thorough. Don't repeat the same mistakes.`;

    try {
      const text = await this._call(prompt, 'sonnet');
      return this._parseBlocks(text).blocks || [];
    } catch (err) {
      console.error(`[Mason] Retry ${layer.name} failed: ${err.message}`);
      return [];
    }
  }

  // ---- EDIT PIPELINE ----
  async editBlocks(prompt, selectedBlocks) {
    const blockList = selectedBlocks
      .map(b => `  (${b.x}, ${b.y}, ${b.z}): ${b.block}`)
      .join('\n');

    this.emit('chat', `§7Editing ${selectedBlocks.length} blocks: §f"${prompt}"`);
    this.emit('chat', `§7Analyzing structure and planning changes...`);
    this.emit('status', 'Editing...');

    const text = await this._call(
      `You are a master Minecraft editor. Given existing blocks and an instruction, output ONLY the changes.

RESPOND WITH ONLY JSON:
{"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:vine"},...], "removals":[{"x":0,"y":0,"z":0}]}

RULES:
- Only include NEW or CHANGED blocks
- "removals" = blocks to delete
- Be creative and thorough
- Use varied blocks for visual interest
- Consider structural implications of changes

Existing blocks:\n${blockList}\n\nEdit instruction: ${prompt}`,
      'sonnet'
    );

    const result = this._parseBlocks(text);
    const remCount = (result.removals || []).length;
    this.emit('chat', `§a✓ §f${result.blocks.length} changes${remCount > 0 ? `§7, §c${remCount} removals` : ''}`);
    this.emit('chat', `§7Review the preview, then §fEnter§7 to confirm or §fEsc§7 to cancel`);
    return result;
  }

  // ---- CLAUDE CLI CALL ----
  _call(prompt, model = 'sonnet') {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['-p', '-', '--output-format', 'text', '--model', model], {
        timeout: 180000,
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

  // ---- JSON PARSER ----
  _parseBlocks(text) {
    let clean = text;
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) clean = match[0];
    const result = JSON.parse(clean);
    if (!result.blocks || !Array.isArray(result.blocks)) throw new Error('Missing blocks');
    return result;
  }
}
