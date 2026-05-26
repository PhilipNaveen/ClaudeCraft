import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { BLOCK_PROPERTIES, BUILDING_PATTERNS, ANTI_PATTERNS } from './minecraft-knowledge.js';

// ============================================================
// ClaudeCraft Builder — Full Claude Code agent loop
// ============================================================
// 1. Plan (Sonnet) — architect decomposes into layers
// 2. Execute (Sonnet) — mason generates layer-by-layer WITH context carry
// 3. Self-critique (Sonnet) — reviews own output, identifies issues
// 4. Retry (Sonnet) — regenerates bad layers with critique as context
// 5. Inspect & fix (Sonnet) — structural validation pass

const ARCHITECT_TOOL = `You are a master Minecraft architect with deep knowledge of block properties, building techniques, and design patterns.

${BUILDING_PATTERNS}

${ANTI_PATTERNS}

YOUR TASK: Decompose a build request into 4-8 layers. Choose materials based on the build's theme using your knowledge of block visual properties.

RESPOND WITH ONLY JSON:
{
  "name": "Build Name",
  "palette": {
    "primary": "minecraft:stone_bricks",
    "walls": "minecraft:oak_planks",
    "frame": "minecraft:dark_oak_log",
    "roof": "minecraft:dark_oak_stairs",
    "floor": "minecraft:stone_bricks",
    "accent": "minecraft:cobblestone_wall",
    "light": "minecraft:lantern",
    "glass": "minecraft:glass_pane",
    "detail": "minecraft:oak_trapdoor"
  },
  "footprint": {"w": 10, "d": 12},
  "layers": [
    {"y_start": 0, "y_end": 0, "name": "foundation", "desc": "10x12 cobblestone base extending 1 block past walls on all sides. stone_brick_slab border on top edge."},
    {"y_start": 1, "y_end": 4, "name": "walls", "desc": "dark_oak_log pillars at all 4 corners and every 3 blocks. oak_planks fill between pillars. Glass_pane windows (2 wide, 2 tall) centered between each pair of pillars, recessed 1 block. oak_door[facing=south] at south wall center with dark_oak_stairs[half=top] as header above door."},
    {"y_start": 5, "y_end": 7, "name": "roof", "desc": "Gable roof: dark_oak_stairs[facing=south] along z=0 ascending inward, [facing=north] along z=11. Each y level insets by 1 block. dark_oak_slab ridge at center. Overhang: extend roof 1 block past walls. Upside-down dark_oak_stairs[half=top] under overhang as soffit."},
    {"y_start": 1, "y_end": 3, "name": "interior", "desc": "spruce_planks floor different from walls. crafting_table+furnace in corner. bookshelf wall 3-wide. lantern on chain from ceiling at center. bed in back corner. oak_stairs as bench seats. trapdoor+fence=table. chest against wall. Carpet for color."},
    {"y_start": 0, "y_end": 1, "name": "exterior", "desc": "cobblestone_wall chimney on side going up above roofline. Stone_brick_slab path from door. oak_fence + lantern lamp posts flanking path. Flower bed: grass_block + poppy + dandelion along front wall. Cobblestone_wall low garden border."}
  ]
}

RULES:
- 4-8 layers
- ALWAYS include: foundation (never build on bare ground), walls with DEPTH (pillars+fill, not flat), proper stair roof with overhang, furnished interior, exterior landscaping
- Wall depth is MANDATORY: log/stripped_log pillars + planks between + recessed windows
- Roof MUST use stairs with correct facing directions and slab ridges
- Interior MUST have: lighting (lanterns not torches), furniture (stairs=chairs, trapdoor+fence=tables), storage, purpose
- Specify EXACT stair facing: [facing=north/south/east/west] and [half=bottom/top]
- Mix textures: 70% main + 20% variant + 10% accent (mossy_stone_bricks in stone walls, etc.)
- Palette must have 6+ blocks that work together thematically`;

const MASON_TOOL = `You are a master Minecraft mason with encyclopedic knowledge of every block in the game.

${BLOCK_PROPERTIES}

RESPOND WITH ONLY JSON: {"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:stone"},...]}}

BLOCK PLACEMENT RULES:
- ALL coordinates ABSOLUTE: origin + offset
- Walls are SHELLS (perimeter only, hollow interior)
- EXACT block state syntax:
  Stairs: minecraft:dark_oak_stairs[facing=east,half=bottom] — facing=direction of the LOW side
  Doors: ALWAYS place BOTH halves: oak_door[facing=south,half=lower] AND oak_door[facing=south,half=upper] at y+1
  Slabs: oak_slab (bottom half), oak_slab[type=top] (upper half)
  Beds: ALWAYS place BOTH parts: bed[facing=south,part=foot] AND bed[facing=south,part=head] 1 block in facing direction
  Logs: oak_log[axis=y] (vertical pillar), oak_log[axis=x] (east-west beam), oak_log[axis=z] (north-south beam)
  Trapdoors: oak_trapdoor[facing=south,half=bottom,open=false] — or open=true for decorative
  Fences: auto-connect, just place. oak_fence, cobblestone_wall etc.
  Chains: chain (vertical by default)
  Lanterns: lantern (floor) or lantern[hanging=true] (ceiling)
  Campfire: campfire[lit=true] or campfire[lit=false] for smoke only
  Buttons: stone_button[face=wall,facing=south] for wall detail
  Carpet: white_carpet, red_carpet etc. — thin floor layer

TEXTURE MIXING: Don't use one block type for large surfaces.
  Stone walls: mix stone_bricks (70%) + mossy_stone_bricks (15%) + cracked_stone_bricks (10%) + andesite (5%)
  Wood walls: planks (80%) + stripped_log accents (20%)

- Max 150 blocks per layer
- Place EVERY block needed — don't skip or abbreviate
- NO text, NO explanation, ONLY the JSON`;

const CRITIC_TOOL = `You are a Minecraft build critic and expert builder. Review builds against professional building standards.

${ANTI_PATTERNS}

RESPOND WITH ONLY JSON:
{
  "score": 7,
  "issues": [
    {"layer": "walls", "problem": "flat single-material walls with no depth", "fix": "add log pillars every 3-4 blocks, recess windows, add trapdoor shutters"},
    {"layer": "roof", "problem": "stairs facing wrong — open side should face inward", "fix": "north side needs [facing=south], south side needs [facing=north]"},
    {"layer": "interior", "problem": "empty room with only a crafting table", "fix": "add lantern lighting, stairs as chairs, trapdoor+fence table, bookshelves, carpet"}
  ],
  "missing_layers": []
}

Score 1-10. Be HARSH. Check against every anti-pattern:
- Are walls FLAT with no depth? (pillars, mixed materials, recessed windows?)
- Is the roof FLAT or are stairs facing wrong? (correct facing: open side faces INWARD)
- Is there a foundation or does building sit on bare ground?
- Are windows full glass blocks instead of glass_pane?
- Is lighting torches-on-walls instead of lanterns on chains?
- Is the interior empty or properly furnished?
- Are surfaces single-material or properly texture-mixed?
- Is there exterior landscaping (path, garden, lamp posts)?
- Are doors missing their upper half?
- Are beds missing their head part?

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
