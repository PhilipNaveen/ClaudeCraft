import { EventEmitter } from 'events';
import { LLMBackend } from './llm-backend.js';
import { executeCommands } from './shape-engine.js';

// ============================================================
// ClaudeCraft Builder — Shape command architecture
// ============================================================

const COLOR_AND_TEXTURE = `
TEXTURE & COLOR MASTERY:

WARM PALETTE (cozy, medieval, rustic):
  Primary: oak_planks(golden), spruce_planks(warm brown), stripped_oak_log(honey)
  Stone: cobblestone(rough gray), stone_bricks(clean), bricks(red-orange)
  Accent: dark_oak_log(deep brown frame), lantern(warm glow), red_carpet
  Feels like: tavern, farmhouse, cottage, bakery

COOL PALETTE (elegant, modern, oceanic):
  Primary: birch_planks(cream), quartz_block(white), prismarine(teal)
  Stone: diorite(white-gray), calcite(bright white), packed_ice(blue-white)
  Accent: sea_lantern(cool glow), light_blue_carpet, chain
  Feels like: temple, modern house, underwater base, ice palace

DARK PALETTE (gothic, evil, nether):
  Primary: deepslate_bricks(charcoal), blackstone(pure dark), nether_bricks(purple-red)
  Stone: polished_basalt(dark striped), crying_obsidian(purple glow)
  Accent: soul_lantern(blue flame), crimson_planks(blood red), chain
  Feels like: fortress, dungeon, nether castle, haunted mansion

NATURAL PALETTE (organic, overgrown, forest):
  Primary: moss_block(bright green), rooted_dirt(earthy), mud_bricks(brown)
  Wood: mangrove_log(red-brown), cherry_log(pink), azalea_leaves(flowering)
  Accent: glow_lichen(dim glow), hanging_roots, dripleaf, spore_blossom
  Feels like: treehouse, druid grove, mushroom house, fairy garden

DESERT/WARM PALETTE:
  Primary: sandstone(tan), smooth_sandstone(clean tan), cut_sandstone(paneled)
  Stone: terracotta(adobe orange), red_sandstone(warm red)
  Accent: dead_bush, cactus, orange_terracotta, blue_terracotta(contrast)
  Feels like: pyramid, desert temple, mesa village, bazaar

TEXTURE RULES:
- ROUGH textures (cobblestone, mossy variants, cracked bricks) = old, weathered, natural
- SMOOTH textures (smooth_stone, quartz, concrete) = modern, clean, new
- MIXED textures = lived-in, realistic. Mix 70% main + 20% weathered + 10% accent
- CONTRAST creates visual interest: dark frame (dark_oak) + light fill (birch_planks)
- GRADIENTS: transition between similar blocks (stone → cobblestone → mossy_cobblestone → moss_block)
- DEPTH: darker blocks recessed, lighter blocks forward. Creates shadow illusion.

STATUE/PIXEL ART COLORS:
  Skin tones: sandstone(light), oak_planks(medium), jungle_planks(dark), terracotta variants
  Black: black_wool, black_concrete, coal_block
  White: white_wool, white_concrete, snow_block, quartz
  Red: red_wool, red_concrete, red_mushroom_block, nether_wart_block
  Blue: blue_wool, blue_concrete, lapis_block
  Green: green_wool, green_concrete, emerald_block, moss_block
  Yellow: yellow_wool, yellow_concrete, gold_block, sponge
  Orange: orange_wool, orange_concrete, pumpkin, copper_block
  Pink: pink_wool, pink_concrete, cherry_planks
  Purple: purple_wool, purple_concrete, purpur_block
  Brown: brown_wool, brown_concrete, soul_sand, dark_oak_planks
  Gray: gray_wool, gray_concrete, stone, andesite
  Light gray: light_gray_wool, light_gray_concrete, smooth_stone
  For SHADING: use darker variant on shadow side, lighter on lit side
  For HIGHLIGHTS: use white_concrete or glowstone sparingly for bright spots
`;

const COMMAND_PROMPT = `You are a Minecraft builder with expert knowledge of color, texture, and visual design. Describe builds using SHAPE COMMANDS.

RESPOND WITH ONLY JSON:
{
  "name": "Build Name",
  "commands": [...]
}

AVAILABLE COMMANDS:

fill: Solid box. {"type":"fill", "x1":0,"y1":0,"z1":0, "x2":5,"y2":3,"z2":5, "block":"minecraft:stone"}
walls: Hollow shell. {"type":"walls", "x1":0,"y1":0,"z1":0, "x2":10,"y2":5,"z2":10, "block":"minecraft:stone_bricks", "thickness":1}
floor: Flat rectangle. {"type":"floor", "x1":0,"z1":0, "x2":10,"z2":10, "y":64, "block":"minecraft:oak_planks"}
pillar: Vertical column. {"type":"pillar", "x":0, "z":0, "y1":64, "y2":70, "block":"minecraft:oak_log"}
line: Line between points. {"type":"line", "x1":0,"y1":64,"z1":0, "x2":10,"y2":64,"z2":0, "block":"minecraft:stone"}
roof: Gable roof with stairs. {"type":"roof", "x1":0,"z1":0, "x2":10,"z2":10, "y_start":71, "axis":"x"|"z", "block":"minecraft:dark_oak_stairs"}
door: Auto both halves. {"type":"door", "x":5, "y":65, "z":0, "facing":"south"}
window: Glass pane rect. {"type":"window", "x":3, "y":67, "z":0, "w":2, "h":2, "axis":"x"|"z"}
stairs_spiral: Spiral staircase. {"type":"stairs_spiral", "cx":5, "cz":5, "y1":65, "y2":75, "radius":2}
circle: Cylinder shell. {"type":"circle", "cx":10, "cz":10, "y1":65, "y2":75, "radius":5, "block":"minecraft:stone_bricks"}
battlements: Crenellations. {"type":"battlements", "x1":0,"z1":0, "x2":15,"z2":15, "y":71}
place: Individual blocks. {"type":"place", "blocks":[{"x":5,"y":65,"z":5,"block":"minecraft:lantern"}]}
repeat: Repeat with offset. {"type":"repeat", "command":{...}, "count":4, "dx":5, "dy":0, "dz":0}

ALL COORDINATES ABSOLUTE — origin is provided.

${COLOR_AND_TEXTURE}

ADAPT TO THE BUILD TYPE:

FOR BUILDINGS (houses, castles, temples, shops):
- walls + pillar for wall depth, floor for foundation, roof for roofline
- window + door commands, interior furniture via place (lanterns, chairs, tables, bookshelves)
- Exterior landscaping via place (paths, gardens, lamp posts)

FOR ORGANIC/SCULPTURES (statues, animals, trees, food, objects):
- Use fill for solid sections, circle for round parts
- Use place for surface detail and color (wool, concrete, terracotta for pixel art)
- Think in cross-sections: build layer by layer using fill at each Y level
- Use varied colored blocks for shading and texture
- Example apple: circle for the round body (red_wool), pillar for stem (oak_log), place for leaf (oak_leaves)

FOR TERRAIN/LANDSCAPE (mountains, caves, islands, gardens):
- fill + circle for terrain mass (stone, dirt, grass_block)
- place for surface detail (flowers, mushrooms, sugar_cane, lily_pad)
- Use varied blocks for natural look (stone + cobblestone + mossy_cobblestone)

FOR REDSTONE/MECHANICAL:
- place for all redstone components (exact positioning matters)
- fill for housing/walls around mechanisms

CRITICAL QUALITY RULES:
- NEVER make empty boxes. Every room needs furniture, lighting, and purpose.
- NEVER leave large flat surfaces bare. Break them up with pillars, trim, variation.
- NEVER build oversized unless the user specifically asks for massive/huge/large.
- Default size: compact and detailed. A rich 10x10 house > an empty 25x25 shell.
- Every wall needs depth: pillars, recessed windows, trapdoor shutters, button details.
- Every interior needs: light source, furniture (stairs+trapdoor=chair/table), storage, floor different from walls.
- Every exterior needs: path to door, some landscaping (flowers, fences, lamp posts).
- Roofs need: overhang, chimney (cobblestone_wall stack), variety (don't just do one flat stair layer).
- Think like a real builder: would you walk inside this and feel like it's a real place?
- 50%+ of your commands should be detail/decoration, not just structure.
- Use "repeat" for evenly spaced details (lanterns, pillars, windows) — don't skip them.`;

const PLANNER_PROMPT = `You are a Minecraft build planner. Decide if a build needs multiple sections or just one.

RESPOND WITH ONLY JSON:
{
  "name": "Build Name",
  "sections": [
    {"name": "section_name", "ox": 0, "oz": 0, "desc": "Detailed description of what to build."}
  ]
}

RULES:
- SMALL builds (single house, statue, tree, object): use 1 section. Don't over-decompose.
- LARGE builds (castle, village, fortress): use 2-4 sections with offsets so they don't overlap.
- Each description must be SPECIFIC about what blocks, features, and details to include.
- Sections build in PARALLEL so they must be independent.
- DEFAULT TO SMALL AND DETAILED. A 10x12 house with rich detail beats a 30x30 empty shell.
- Only make things large if the user EXPLICITLY says "big", "massive", "huge", "large", or "size of X".
- Every section description MUST include interior details (furniture, lighting, decoration) and exterior details (paths, gardens, landscaping).
- A section description that only says "stone walls and a roof" is INCOMPLETE. Specify the furniture, the window shutters, the flower beds, the chimney.`;

export class ClaudeBuilder extends EventEmitter {
  constructor() {
    super();
    this.llm = new LLMBackend();
    this._abortController = null;
  }

  cancel() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
      this.llm.killAll(); // Kill all running claude processes
      this.emit('chat', '§c✗ Build cancelled');
    }
  }

  async generateBuild(prompt, origin) {
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
    const t0 = Date.now();

    try {
      // ===== STEP 1: Plan (use fast tier — haiku is fine for planning) =====
      this.emit('chat', `§7Building: §f"${prompt}"`);
      this.emit('status', 'Planning...');

      if (signal.aborted) throw new Error('cancelled');

      const planText = await this.llm.call(
        `${PLANNER_PROMPT}\n\nBuild: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})`,
        'quality'
      );

      if (signal.aborted) throw new Error('cancelled');

      let plan;
      try {
        plan = JSON.parse(planText.match(/\{[\s\S]*\}/)[0]);
      } catch {
        plan = { name: prompt, sections: [{ name: 'main', ox: 0, oz: 0, desc: prompt }] };
      }

      const sections = plan.sections || [];
      this.emit('chat', `§a✓ §b${plan.name || prompt} §7— ${sections.length} section${sections.length > 1 ? 's' : ''}`);

      // ===== STEP 2: Parallel sub-agents =====
      this.emit('status', `Building...`);

      const allBlocks = [];

      const promises = sections.map(section => {
        if (signal.aborted) return Promise.resolve();

        const so = { x: origin.x + (section.ox || 0), y: origin.y, z: origin.z + (section.oz || 0) };

        return this.llm.call(
          `${COMMAND_PROMPT}\n\nSECTION: "${section.name}"\nORIGIN: (${so.x}, ${so.y}, ${so.z})\nDESCRIPTION: ${section.desc}\n\nGenerate commands.`,
          'quality'
        ).then(text => {
          if (signal.aborted) return;
          try {
            const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
            const commands = parsed.commands || [];
            const blocks = executeCommands(commands);
            allBlocks.push(...blocks);
            this.emit('blocks', blocks);
            this.emit('chat', `§a  ✓ §e${section.name} §7— ${commands.length} cmds → ${blocks.length} blocks`);
          } catch (err) {
            this.emit('chat', `§c  ✗ §e${section.name} §7— ${err.message.substring(0, 50)}`);
          }
        }).catch(err => {
          if (!signal.aborted) this.emit('chat', `§c  ✗ §e${section.name} §7— failed`);
        });
      });

      await Promise.allSettled(promises);

      if (signal.aborted) throw new Error('cancelled');

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      this.emit('chat', `§a§l✓ Done! §r§f${allBlocks.length} blocks §7in ${elapsed}s`);
      this.emit('chat', `§7Arrows=move R=rotate PgUp/Dn=height Enter=place Esc=cancel`);

      this._abortController = null;
      return { blocks: allBlocks, removals: [] };

    } catch (err) {
      this._abortController = null;
      if (err.message === 'cancelled') {
        return { blocks: [], removals: [] };
      }
      throw err;
    }
  }

  async editBlocks(prompt, selectedBlocks) {
    const blockList = selectedBlocks
      .map(b => `  (${b.x}, ${b.y}, ${b.z}): ${b.block}`)
      .join('\n');

    this.emit('chat', `§7Editing ${selectedBlocks.length} blocks: §f"${prompt}"`);
    this.emit('status', 'Editing...');

    const text = await this.llm.call(
      `Minecraft editor. JSON only: {"blocks":[{"x":0,"y":0,"z":0,"block":"minecraft:vine"},...], "removals":[{"x":0,"y":0,"z":0}]}\nOnly changes.\n\nExisting:\n${blockList}\n\nEdit: ${prompt}`,
      'quality'
    );

    let clean = text;
    if (clean.startsWith('```')) clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) clean = match[0];
    const result = JSON.parse(clean);
    if (!result.blocks) throw new Error('Missing blocks');

    this.emit('chat', `§a✓ §f${result.blocks.length} changes${(result.removals?.length || 0) > 0 ? `, §c${result.removals.length} removals` : ''}`);
    return result;
  }
}
