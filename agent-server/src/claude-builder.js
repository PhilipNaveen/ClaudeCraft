import { EventEmitter } from 'events';
import { LLMBackend } from './llm-backend.js';
import { executeCommands } from './shape-engine.js';

// ============================================================
// ClaudeCraft Builder — High-level Minecraft primitives
// ============================================================
// Sonnet designs with game-native commands (room, tower, furniture)
// Engine handles ALL geometry. LLM focuses purely on creative design.

const COLOR_AND_TEXTURE = `
PALETTE GUIDE:
Warm(cozy): cherry_planks, spruce_planks, stripped_oak_log, cobblestone, bricks, lantern
Cool(elegant): birch_planks, quartz_block, prismarine, diorite, sea_lantern
Dark(gothic): deepslate_bricks, blackstone, nether_bricks, soul_lantern, crimson_planks
Natural(organic): moss_block, mangrove_log, mud_bricks, azalea_leaves, glow_lichen
Desert(warm): sandstone, smooth_sandstone, terracotta, red_sandstone, dead_bush
Pixel art colors: wool/concrete in 16 colors. Shading: darker on shadow side, lighter on lit side.
TEXTURE: rough=old(cobblestone,mossy), smooth=modern(quartz,concrete), mixed=realistic(70%+20%+10%)
`;

const ARCHITECT_PROMPT = `You are a master Minecraft architect. Design builds using HIGH-LEVEL COMMANDS that a build engine will render.

${COLOR_AND_TEXTURE}

RESPOND WITH ONLY JSON: {"name": "Build Name", "commands": [...]}

=== HIGH-LEVEL COMMANDS (preferred — engine handles geometry automatically) ===

room: COMPLETE room — auto-generates walls with pillars, floor, ceiling, door, windows, lighting.
  {"type":"room", "x":0, "y":64, "z":0, "w":12, "d":10, "h":4,
   "wall_block":"minecraft:cherry_planks", "floor_block":"minecraft:spruce_planks",
   "pillar_block":"minecraft:cherry_log", "door_side":"south",
   "window_block":"minecraft:pink_stained_glass_pane", "light_block":"minecraft:lantern[hanging=true]"}

tower: COMPLETE tower — circular walls, spiral stairs, battlements, arrow slits, lighting.
  {"type":"tower", "cx":20, "cz":5, "y_base":64, "height":15, "radius":4,
   "block":"minecraft:stone_bricks", "stair_block":"minecraft:stone_stairs"}

roof: Gable roof with correct stair facing + slab ridge + overhang.
  {"type":"roof", "x1":-1, "z1":-1, "x2":13, "z2":11, "y_start":69, "axis":"x", "block":"minecraft:cherry_stairs"}

path: Slab path with lamp posts.
  {"type":"path", "x1":6, "z1":-1, "x2":6, "z2":-8, "y":64}

garden: Fenced flower area.
  {"type":"garden", "x1":14, "z1":0, "x2":18, "z2":6, "y":64}

chimney: Cobblestone stack with campfire smoke.
  {"type":"chimney", "x":-1, "z":5, "y_base":69, "height":4}

furniture: Presets — table, chair, desk, shelf, kitchen, bed, fireplace.
  {"type":"furniture", "x":3, "y":65, "z":3, "preset":"fireplace"}
  {"type":"furniture", "x":8, "y":65, "z":7, "preset":"bed", "facing":"north"}
  {"type":"furniture", "x":5, "y":65, "z":5, "preset":"table"}
  {"type":"furniture", "x":4, "y":65, "z":5, "preset":"chair", "facing":"east"}
  {"type":"furniture", "x":2, "y":65, "z":8, "preset":"kitchen"}
  {"type":"furniture", "x":9, "y":65, "z":2, "preset":"shelf"}

=== LOW-LEVEL COMMANDS (for custom shapes, sculptures, terrain) ===

fill: Solid box. {"type":"fill", "x1":0,"y1":0,"z1":0, "x2":5,"y2":3,"z2":5, "block":"minecraft:stone"}
walls: Hollow shell. {"type":"walls", "x1":0,"y1":0,"z1":0, "x2":10,"y2":5,"z2":10, "block":"minecraft:stone_bricks"}
floor: Flat rect. {"type":"floor", "x1":0,"z1":0, "x2":10,"z2":10, "y":64, "block":"minecraft:oak_planks"}
pillar: Column. {"type":"pillar", "x":0, "z":0, "y1":64, "y2":70, "block":"minecraft:oak_log"}
circle: Cylinder. {"type":"circle", "cx":10,"cz":10, "y1":64,"y2":70, "radius":5, "block":"minecraft:stone", "filled":true|false}
line: Between points. {"type":"line", "x1":0,"y1":64,"z1":0, "x2":10,"y2":64,"z2":0, "block":"minecraft:stone"}
window: {"type":"window", "x":3, "y":67, "z":0, "w":2, "h":2, "axis":"x", "glass_block":"minecraft:glass_pane"}
door: {"type":"door", "x":5, "y":65, "z":0, "facing":"south", "block":"minecraft:oak_door"}
battlements: {"type":"battlements", "x1":0,"z1":0, "x2":15,"z2":15, "y":71}
stairs_spiral: {"type":"stairs_spiral", "cx":5, "cz":5, "y1":65, "y2":75, "radius":2}
place: Individual blocks. {"type":"place", "blocks":[{"x":5,"y":65,"z":5,"block":"minecraft:lantern"}]}
repeat: Repeat with offset. {"type":"repeat", "command":{...}, "count":4, "dx":5, "dy":0, "dz":0}

ALL COORDINATES ABSOLUTE from origin.
SCALE: 1 block ≈ 1 meter. Compact+detailed by default. Big only if user asks.

BUILDING PATTERN — a detailed cottage in ~15 commands:
1. room (auto: walls+pillars+floor+ceiling+door+windows+lanterns)
2. roof (overhang 1 past walls)
3. chimney
4. furniture: fireplace, bed, table+chairs, kitchen, shelf
5. path from door
6. garden beside house
7. place: extra decor (flower_pot, carpet, trapdoors as shutters, paintings)

FOR SCULPTURES: fill+circle for mass, place for surface color/shading.

QUALITY: NEVER empty boxes. Every room furnished. Every exterior landscaped. Compact > oversized.`;

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
      this.llm.killAll();
      this.emit('chat', '§c✗ Build cancelled');
    }
  }

  async generateBuild(prompt, origin) {
    this._abortController = new AbortController();
    const signal = this._abortController.signal;
    const t0 = Date.now();

    try {
      this.emit('chat', `§7Designing: §f"${prompt}"`);
      this.emit('status', 'Designing...');

      if (signal.aborted) throw new Error('cancelled');

      const text = await this.llm.call(
        `${ARCHITECT_PROMPT}\n\nBuild: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})`,
        'quality'
      );

      if (signal.aborted) throw new Error('cancelled');

      let result;
      try {
        result = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
      } catch {
        this.emit('chat', `§c✗ Parse error — retrying...`);
        const retry = await this.llm.call(
          `${ARCHITECT_PROMPT}\n\nBuild: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})\n\nIMPORTANT: ONLY valid JSON, no text.`,
          'quality'
        );
        result = JSON.parse(retry.match(/\{[\s\S]*\}/)[0]);
      }

      const commands = result.commands || [];
      this.emit('chat', `§a✓ §b${result.name || prompt} §7— ${commands.length} commands`);
      this.emit('status', 'Rendering...');

      const allBlocks = executeCommands(commands);
      this.emit('blocks', allBlocks);

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      this.emit('chat', `§a§l✓ Done! §r§f${allBlocks.length} blocks §7in ${elapsed}s`);
      this.emit('chat', `§7Arrows=move R=rotate PgUp/Dn=height Enter=place Esc=cancel`);

      this._abortController = null;
      return { blocks: allBlocks, removals: [] };

    } catch (err) {
      this._abortController = null;
      if (err.message === 'cancelled') return { blocks: [], removals: [] };
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
      'fast'
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
