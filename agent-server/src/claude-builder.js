import { EventEmitter } from 'events';
import { LLMBackend } from './llm-backend.js';
import { BLOCK_PROPERTIES, BUILDING_PATTERNS, ANTI_PATTERNS } from './minecraft-knowledge.js';

// ============================================================
// ClaudeCraft Builder — hierarchical multi-section builds
// ============================================================
// Small builds: plan → layers → critique → fix → inspect
// Massive builds: master plan → sections → each section gets full pipeline
// Supports: Claude CLI, Groq (free), Ollama (local)

const MASTER_ARCHITECT = `You are a master Minecraft architect. For LARGE/COMPLEX builds, decompose into SECTIONS that each get built independently.

${BUILDING_PATTERNS}

RESPOND WITH ONLY JSON:
{
  "name": "Grand Castle",
  "scale": "massive",
  "palette": {
    "primary": "minecraft:stone_bricks",
    "walls": "minecraft:stone_bricks",
    "frame": "minecraft:deepslate_bricks",
    "roof": "minecraft:dark_oak_stairs",
    "floor": "minecraft:polished_andesite",
    "accent": "minecraft:cobblestone_wall",
    "light": "minecraft:lantern",
    "glass": "minecraft:glass_pane",
    "detail": "minecraft:oak_trapdoor"
  },
  "sections": [
    {
      "name": "main_hall",
      "offset": {"x": 0, "z": 0},
      "footprint": {"w": 16, "d": 20},
      "height": 12,
      "desc": "Central great hall. 16x20 stone_bricks walls with deepslate_brick pillars every 4 blocks. Vaulted ceiling with upside-down stairs. Grand entrance on south: 3-wide double-height doorway with stair arch. Windows on all walls. Interior: long oak table (trapdoor+fence), throne at north end, chandelier (chains+lanterns), banners on walls."
    },
    {
      "name": "north_tower",
      "offset": {"x": 2, "z": -8},
      "footprint": {"w": 8, "d": 8},
      "height": 20,
      "desc": "Tall circular watchtower. Stone_bricks base, narrows at top. Spiral staircase inside (stairs winding around center). Arrow slit windows (1x2 gaps with iron_bars). Crenellated top with cobblestone_wall battlements. Lantern at peak."
    },
    {
      "name": "courtyard_walls",
      "offset": {"x": -10, "z": -10},
      "footprint": {"w": 40, "d": 40},
      "height": 6,
      "desc": "Perimeter walls only (no fill). 2-block-thick stone_brick walls, 6 high. Cobblestone_wall battlements on top. Walkway with slab floor at y=4. Torch lighting every 4 blocks on inner wall."
    }
  ]
}

For SMALL builds (houses, shops, statues), use a single section.

RULES:
- Each section has its own offset from the build origin
- Sections must not overlap — leave gaps for paths between them
- Each section description must be DETAILED: specific blocks, dimensions, features
- Max 6 sections for massive builds
- Include exterior sections (walls, paths, gardens) not just buildings
- Use the palette consistently across all sections`;

const SECTION_PLANNER = `You are a Minecraft section planner. Break a single section into 4-8 buildable layers.

${ANTI_PATTERNS}

RESPOND WITH ONLY JSON:
{
  "layers": [
    {"y_start": 0, "y_end": 0, "name": "foundation", "desc": "...specific block placement..."},
    {"y_start": 1, "y_end": 4, "name": "walls", "desc": "...specific block placement..."}
  ]
}

RULES:
- 4-8 layers per section
- ALWAYS include foundation, walls with depth, roof, interior/details
- Be SPECIFIC: exact block types, positions, facing directions
- Follow all building patterns: wall depth, proper roofs, recessed windows, texture mixing`;

const MASON_TOOL = `You are a master Minecraft mason with encyclopedic block knowledge.

${BLOCK_PROPERTIES}

RESPOND WITH ONLY JSON: {"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:stone"},...]}}

BLOCK PLACEMENT RULES:
- ALL coordinates ABSOLUTE: section_origin + offset
- Walls are SHELLS (perimeter only, hollow interior)
- EXACT block state syntax:
  Stairs: minecraft:dark_oak_stairs[facing=east,half=bottom]
  Doors: BOTH halves: oak_door[facing=south,half=lower] AND [half=upper] at y+1
  Slabs: oak_slab (bottom), oak_slab[type=top] (upper)
  Beds: BOTH parts: bed[facing=south,part=foot] AND [part=head]
  Logs: oak_log[axis=y] (vertical), [axis=x] (east-west), [axis=z] (north-south)
  Trapdoors: oak_trapdoor[facing=south,half=bottom,open=true]
  Lanterns: lantern (floor), lantern[hanging=true] (ceiling)
  Walls/Fences: auto-connect, just place
- TEXTURE MIXING: mix 70% main + 20% variant + 10% accent for large surfaces
- Max 200 blocks per layer
- NO text, ONLY JSON`;

const CRITIC_TOOL = `You are a harsh Minecraft build critic.

${ANTI_PATTERNS}

RESPOND WITH ONLY JSON:
{"score": 7, "issues": [{"layer": "walls", "problem": "...", "fix": "..."}], "missing_layers": []}

Score 1-10. Check EVERY anti-pattern:
- Flat walls with no depth?
- Wrong stair facing on roof?
- No foundation?
- Full glass blocks instead of glass_pane?
- Torches instead of lanterns?
- Empty interior?
- Single-material surfaces?
- No landscaping?
- Missing door upper halves / bed head parts?

If score >= 8: {"score": 9, "issues": [], "missing_layers": []}`;

const INSPECTOR_TOOL = `Minecraft structural inspector. Fix issues.
RESPOND WITH ONLY JSON: {"fixes":[{"x":0,"y":0,"z":0,"block":"minecraft:lantern"}],"removals":[{"x":0,"y":0,"z":0}]}
Fix: missing door tops, missing bed heads, no lighting, wall gaps.
If clean: {"fixes":[],"removals":[]}`;

export class ClaudeBuilder extends EventEmitter {
  constructor() {
    super();
    this.llm = new LLMBackend();
  }

  async generateBuild(prompt, origin) {
    const t0 = Date.now();

    // ===== PHASE 1: MASTER ARCHITECT =====
    this.emit('chat', `§7Reading: §f"${prompt}"`);
    this.emit('chat', `§7Designing structure...`);
    this.emit('status', 'Planning...');

    const masterText = await this.llm.call(
      `${MASTER_ARCHITECT}\n\nBuild: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})`,
      'quality'
    );

    let masterPlan;
    try {
      masterPlan = JSON.parse(masterText.match(/\{[\s\S]*\}/)[0]);
    } catch {
      masterPlan = {
        name: prompt, palette: {}, scale: 'small',
        sections: [{ name: 'main', offset: { x: 0, z: 0 }, footprint: { w: 10, d: 10 }, height: 8, desc: prompt }]
      };
      this.emit('chat', `§e⚠ Simplified plan`);
    }

    const sections = masterPlan.sections || [];
    const matList = Object.values(masterPlan.palette || {}).slice(0, 5).map(m => m.replace('minecraft:', '')).join(', ');
    this.emit('chat', `§a✓ §fPlan: §b${masterPlan.name || prompt}`);
    this.emit('chat', `§7  ${sections.length} section${sections.length > 1 ? 's' : ''}, scale: ${masterPlan.scale || 'normal'}`);
    if (matList) this.emit('chat', `§7  Palette: §f${matList}`);
    for (const s of sections) {
      this.emit('chat', `§7  · §e${s.name}§7 (${s.footprint?.w}×${s.footprint?.d}, h=${s.height})`);
    }

    // ===== PHASE 2: BUILD EACH SECTION =====
    const allBlocks = [];

    for (let si = 0; si < sections.length; si++) {
      const section = sections[si];
      const sectionOrigin = {
        x: origin.x + (section.offset?.x || 0),
        y: origin.y,
        z: origin.z + (section.offset?.z || 0)
      };

      this.emit('chat', `§7━━━ Section ${si + 1}/${sections.length}: §b${section.name} §7━━━`);

      // Plan layers for this section
      this.emit('status', `Planning ${section.name}...`);
      const layerText = await this.llm.call(
        `${SECTION_PLANNER}\n\nSection: "${section.name}"\nSize: ${section.footprint?.w}×${section.footprint?.d}, height=${section.height}\nPalette: ${JSON.stringify(masterPlan.palette || {})}\nDescription: ${section.desc}`,
        'quality'
      );

      let sectionPlan;
      try {
        sectionPlan = JSON.parse(layerText.match(/\{[\s\S]*\}/)[0]);
      } catch {
        sectionPlan = { layers: [{ y_start: 0, y_end: section.height || 6, name: section.name, desc: section.desc }] };
      }

      const layers = sectionPlan.layers || [];
      for (const l of layers) {
        this.emit('chat', `§7  · §f${l.name}§7 (y${l.y_start}-${l.y_end})`);
      }

      // Generate each layer with context carry
      const sectionBlocks = [];
      const layerResults = {};

      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        this.emit('chat', `§7  Building §e${layer.name}§7...`);
        this.emit('status', `${section.name}: ${layer.name} (${i + 1}/${layers.length})`);

        const t1 = Date.now();
        const blocks = await this._generateLayer(layer, masterPlan, sectionOrigin, section, layerResults);

        if (blocks.length > 0) {
          sectionBlocks.push(...blocks);
          allBlocks.push(...blocks);
          layerResults[layer.name] = blocks;
          this.emit('blocks', blocks);
          this.emit('chat', `§a    ✓ §f${layer.name}§7 — ${blocks.length} blocks (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
        } else {
          this.emit('chat', `§c    ✗ §f${layer.name}§7 — failed`);
          layerResults[layer.name] = [];
        }
      }

      // Critique this section
      if (sectionBlocks.length > 0 && sections.length <= 3) {
        this.emit('chat', `§7  Reviewing ${section.name}...`);
        try {
          const sample = sectionBlocks.length > 250
            ? sectionBlocks.filter((_, i) => i % Math.ceil(sectionBlocks.length / 250) === 0)
            : sectionBlocks;

          const critiqueText = await this.llm.call(
            `${CRITIC_TOOL}\n\nSection: "${section.name}"\nDescription: ${section.desc}\nBlocks (${sectionBlocks.length} total, sample):\n${JSON.stringify(sample)}\n\nReview.`,
            'quality'
          );
          const critique = JSON.parse(critiqueText.match(/\{[\s\S]*\}/)[0]);
          this.emit('chat', `§7  Quality: §f${critique.score}/10`);

          if (critique.score < 8 && critique.issues?.length > 0) {
            for (const issue of critique.issues.slice(0, 3)) {
              this.emit('chat', `§e    ⚠ ${issue.problem}`);
            }

            // Retry worst layers
            const badLayers = [...new Set(critique.issues.map(i => i.layer))].slice(0, 2);
            for (const layerName of badLayers) {
              const layer = layers.find(l => l.name === layerName);
              if (!layer) continue;

              const issues = critique.issues
                .filter(i => i.layer === layerName)
                .map(i => `${i.problem} → ${i.fix}`)
                .join('; ');

              this.emit('chat', `§7    Rebuilding §e${layerName}§7...`);
              const oldBlocks = layerResults[layerName] || [];
              for (const ob of oldBlocks) {
                const idx = allBlocks.findIndex(b => b.x === ob.x && b.y === ob.y && b.z === ob.z);
                if (idx >= 0) allBlocks.splice(idx, 1);
              }

              const newBlocks = await this._generateLayerWithFixes(layer, masterPlan, sectionOrigin, section, layerResults, issues);
              if (newBlocks.length > 0) {
                allBlocks.push(...newBlocks);
                layerResults[layerName] = newBlocks;
                this.emit('blocks', newBlocks);
                this.emit('chat', `§a    ✓ §f${layerName}§7 rebuilt — ${newBlocks.length} blocks`);
              }
            }
          } else {
            this.emit('chat', `§a    ✓ §7Section looks good`);
          }
        } catch {
          this.emit('chat', `§7    Critique skipped`);
        }
      }
    }

    // ===== PHASE 3: FINAL STRUCTURAL INSPECTION =====
    this.emit('chat', `§7Running final inspection...`);
    this.emit('status', 'Inspecting...');

    try {
      const sample = allBlocks.length > 300
        ? allBlocks.filter((_, i) => i % Math.ceil(allBlocks.length / 300) === 0)
        : allBlocks;

      const fixText = await this.llm.call(
        `${INSPECTOR_TOOL}\n\nBlocks (${allBlocks.length} total):\n${JSON.stringify(sample)}\n\nFix issues.`,
        'fast'
      );
      const fixes = JSON.parse(fixText.match(/\{[\s\S]*\}/)[0]);
      if (fixes.fixes?.length > 0) {
        allBlocks.push(...fixes.fixes);
        this.emit('blocks', fixes.fixes);
        this.emit('chat', `§a  ✓ §7${fixes.fixes.length} fixes applied`);
      } else {
        this.emit('chat', `§a  ✓ §7Structure is solid`);
      }
    } catch {
      this.emit('chat', `§7  Inspection skipped`);
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    this.emit('chat', `§a§l✓ Build complete! §r§f${allBlocks.length} blocks §7in ${elapsed}s`);
    this.emit('chat', `§7Position with §fArrow keys§7/§fPgUp§7/§fPgDn§7, §fR§7 rotate, §fEnter§7 place`);

    return { blocks: allBlocks, removals: [] };
  }

  // ---- EDIT ----
  async editBlocks(prompt, selectedBlocks) {
    const blockList = selectedBlocks
      .map(b => `  (${b.x}, ${b.y}, ${b.z}): ${b.block}`)
      .join('\n');

    this.emit('chat', `§7Editing ${selectedBlocks.length} blocks: §f"${prompt}"`);
    this.emit('status', 'Editing...');

    const text = await this.llm.call(
      `You are a master Minecraft editor.\n${BLOCK_PROPERTIES}\n\nRESPOND WITH ONLY JSON:\n{"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:vine"},...], "removals":[{"x":0,"y":0,"z":0}]}\n\nOnly NEW/CHANGED blocks. Be creative.\n\nExisting:\n${blockList}\n\nEdit: ${prompt}`,
      'quality'
    );

    const result = this._parseBlocks(text);
    this.emit('chat', `§a✓ §f${result.blocks.length} changes${(result.removals?.length || 0) > 0 ? `, §c${result.removals.length} removals` : ''}`);
    return result;
  }

  // ---- LAYER GENERATION ----
  async _generateLayer(layer, masterPlan, sectionOrigin, section, prevResults) {
    let context = '';
    const prevNames = Object.keys(prevResults);
    if (prevNames.length > 0) {
      context = '\n\nALREADY PLACED:';
      for (const name of prevNames) {
        const blocks = prevResults[name];
        if (blocks.length === 0) continue;
        const ys = blocks.map(b => b.y);
        const types = {};
        blocks.forEach(b => { types[b.block] = (types[b.block] || 0) + 1; });
        const top = Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t.replace('minecraft:', '')}(${c})`).join(', ');
        context += `\n  ${name}: ${blocks.length} blocks y=${Math.min(...ys)}-${Math.max(...ys)} [${top}]`;
      }
    }

    const prompt = `${MASON_TOOL}\n\nORIGIN: (${sectionOrigin.x}, ${sectionOrigin.y}, ${sectionOrigin.z})\nSECTION: ${section.name} (${section.footprint?.w}×${section.footprint?.d})\nPALETTE: ${JSON.stringify(masterPlan.palette || {})}${context}\n\nGENERATE LAYER:\nName: ${layer.name}\nY: ${sectionOrigin.y + layer.y_start} to ${sectionOrigin.y + layer.y_end}\nDesc: ${layer.desc}\n\nAbsolute coords. x from ${sectionOrigin.x}, z from ${sectionOrigin.z}, y from ${sectionOrigin.y + layer.y_start}.`;

    try {
      const text = await this.llm.call(prompt, 'quality');
      return this._parseBlocks(text).blocks || [];
    } catch (err) {
      console.error(`[Mason] ${layer.name} failed: ${err.message}`);
      return [];
    }
  }

  async _generateLayerWithFixes(layer, masterPlan, sectionOrigin, section, prevResults, issues) {
    let context = '';
    for (const [name, blocks] of Object.entries(prevResults)) {
      if (name !== layer.name && blocks.length > 0) context += `\n  ${name}: ${blocks.length} blocks`;
    }

    const prompt = `${MASON_TOOL}\n\nORIGIN: (${sectionOrigin.x}, ${sectionOrigin.y}, ${sectionOrigin.z})\nSECTION: ${section.name} (${section.footprint?.w}×${section.footprint?.d})\nPALETTE: ${JSON.stringify(masterPlan.palette || {})}${context ? '\n\nALREADY PLACED:' + context : ''}\n\nRETRY LAYER (fix issues below):\nName: ${layer.name}\nY: ${sectionOrigin.y + layer.y_start} to ${sectionOrigin.y + layer.y_end}\nDesc: ${layer.desc}\n\nISSUES TO FIX:\n${issues}\n\nDon't repeat mistakes.`;

    try {
      const text = await this.llm.call(prompt, 'quality');
      return this._parseBlocks(text).blocks || [];
    } catch (err) {
      console.error(`[Mason] Retry ${layer.name} failed: ${err.message}`);
      return [];
    }
  }

  _parseBlocks(text) {
    let clean = text;
    if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) clean = match[0];
    const result = JSON.parse(clean);
    if (!result.blocks || !Array.isArray(result.blocks)) throw new Error('Missing blocks');
    return result;
  }
}
