import { EventEmitter } from 'events';
import { LLMBackend } from './llm-backend.js';
import { executeCommands } from './shape-engine.js';

// ============================================================
// ClaudeCraft Builder — Shape command architecture
// ============================================================
// LLM outputs COMMANDS (fill, walls, roof, pillar, etc.)
// Shape engine rasterizes commands into actual blocks
// Result: LLM writes 20 commands → engine generates 2000 blocks

const COMMAND_PROMPT = `You are a Minecraft architect. Describe builds using SHAPE COMMANDS that a rendering engine will convert to blocks.

RESPOND WITH ONLY JSON:
{
  "name": "Medieval Castle",
  "commands": [
    {"type": "floor", "x1": 0, "z1": 0, "x2": 15, "z2": 15, "y": 64, "block": "minecraft:stone_bricks"},
    {"type": "walls", "x1": 0, "y1": 65, "z1": 0, "x2": 15, "y2": 70, "z2": 15, "block": "minecraft:stone_bricks"},
    {"type": "pillar", "x": 0, "z": 0, "y1": 65, "y2": 70, "block": "minecraft:dark_oak_log"},
    {"type": "pillar", "x": 15, "z": 0, "y1": 65, "y2": 70, "block": "minecraft:dark_oak_log"},
    {"type": "window", "x": 5, "y": 67, "z": 0, "w": 2, "h": 2, "axis": "x"},
    {"type": "door", "x": 8, "y": 65, "z": 0, "facing": "south"},
    {"type": "roof", "x1": -1, "z1": -1, "x2": 16, "z2": 16, "y_start": 71, "axis": "x", "block": "minecraft:dark_oak_stairs"},
    {"type": "place", "blocks": [{"x": 5, "y": 65, "z": 5, "block": "minecraft:crafting_table"}]}
  ]
}

AVAILABLE COMMANDS:

fill: Solid box. {"type":"fill", "x1":0,"y1":0,"z1":0, "x2":5,"y2":3,"z2":5, "block":"minecraft:stone"}
walls: Hollow shell (walls only, no floor/ceiling). {"type":"walls", "x1":0,"y1":0,"z1":0, "x2":10,"y2":5,"z2":10, "block":"minecraft:stone_bricks", "thickness":1}
floor: Single-layer rectangle. {"type":"floor", "x1":0,"z1":0, "x2":10,"z2":10, "y":64, "block":"minecraft:oak_planks"}
pillar: Vertical column. {"type":"pillar", "x":0, "z":0, "y1":64, "y2":70, "block":"minecraft:oak_log"}
line: Line between two points. {"type":"line", "x1":0,"y1":64,"z1":0, "x2":10,"y2":64,"z2":0, "block":"minecraft:stone"}
roof: Gable roof with stairs. {"type":"roof", "x1":0,"z1":0, "x2":10,"z2":10, "y_start":71, "axis":"x"|"z", "block":"minecraft:dark_oak_stairs"}
door: Both halves auto-placed. {"type":"door", "x":5, "y":65, "z":0, "facing":"south"}
window: Glass pane rectangle. {"type":"window", "x":3, "y":67, "z":0, "w":2, "h":2, "axis":"x"|"z", "glass_block":"minecraft:glass_pane"}
pillar: Vertical column. {"type":"pillar", "x":0, "z":0, "y1":65, "y2":70, "block":"minecraft:dark_oak_log"}
stairs_spiral: Spiral staircase. {"type":"stairs_spiral", "cx":5, "cz":5, "y1":65, "y2":75, "radius":2, "block":"minecraft:oak_stairs"}
circle: Cylinder shell. {"type":"circle", "cx":10, "cz":10, "y1":65, "y2":75, "radius":5, "block":"minecraft:stone_bricks"}
battlements: Crenellations on top of walls. {"type":"battlements", "x1":0,"z1":0, "x2":15,"z2":15, "y":71, "block":"minecraft:cobblestone_wall"}
place: Individual blocks. {"type":"place", "blocks":[{"x":5,"y":65,"z":5,"block":"minecraft:lantern"}]}
repeat: Repeat a command with offset. {"type":"repeat", "command":{...}, "count":4, "dx":5, "dy":0, "dz":0}

ALL COORDINATES ARE ABSOLUTE. Origin is provided — add offsets to it.

STRUCTURE COMMANDS (use these for the skeleton):
- "walls" for walls (hollow shell, not "fill")
- "floor" for foundations and floors
- "roof" for proper stair roofs (auto-facing)
- "pillar" at ALL corners + every 3-4 blocks along walls (this creates wall depth)
- "door" and "window" (auto multi-block)

DETAIL IS EVERYTHING — spend most of your commands on these:
- "place" for ALL individual detail blocks. A good build has 30-50+ place blocks:
  INTERIOR (mandatory): lantern[hanging=true] from ceiling, crafting_table, furnace, bookshelf rows,
  chest, bed (foot+head), oak_stairs as chairs, oak_trapdoor+oak_fence as tables, carpet,
  flower_pot, brewing_stand, anvil, barrel, item_frame, painting, cake
  EXTERIOR (mandatory): cobblestone_wall low borders, flower beds (grass_block+poppy+dandelion),
  lantern on fence_post lamp posts along paths, stone_brick_slab paths from door,
  oak_fence railings, composters, hay_bale, water features, leaf hedges
  WALL DETAIL: oak_trapdoor as shutters on windows, stone_button as nail heads,
  cobblestone_wall as chimney stack, banner on walls, iron_bars accent
  ROOF DETAIL: cobblestone_wall chimney, lantern at peak, trapdoor dormers
- "repeat" for repeating details (lanterns every 4 blocks, window shutters, pillars)

A build with no interior furniture, no exterior landscaping, and no wall details is UNACCEPTABLE.
The structure is just the canvas — details make it look real.
Aim for 40%+ of your commands being "place" or detail-focused.`;

const PLANNER_PROMPT = `You are a Minecraft master planner. Decompose a build into 2-5 independent sections for parallel building.

RESPOND WITH ONLY JSON:
{
  "name": "Grand Castle",
  "sections": [
    {"name": "main_keep", "ox": 0, "oz": 0, "desc": "Central keep 16x16, 10 tall. Stone_bricks walls, dark_oak_log pillars, glass_pane windows, oak_door, stair roof, interior with throne and chandelier."},
    {"name": "east_tower", "ox": 18, "oz": 4, "desc": "Round watchtower radius 4, 20 tall. Spiral stairs, arrow slits, battlements."},
    {"name": "walls", "ox": -5, "oz": -5, "desc": "Perimeter walls 30x30, 6 tall. Battlements, walkway, gate opening at south."}
  ]
}

Each section gets built by a separate agent in parallel. Sections must not overlap.
In each description, specify BOTH structure AND details:
- Structure: dimensions, block types, features (walls, roof, windows)
- Interior details: specific furniture, lighting placement, decoration
- Exterior details: paths, gardens, lamp posts, fences, landscaping
A section description without interior/exterior details is INCOMPLETE.`;

export class ClaudeBuilder extends EventEmitter {
  constructor() {
    super();
    this.llm = new LLMBackend();
  }

  async generateBuild(prompt, origin) {
    const t0 = Date.now();

    // ===== STEP 1: Plan sections =====
    this.emit('chat', `§7Analyzing: §f"${prompt}"`);
    this.emit('status', 'Planning...');

    const planText = await this.llm.call(
      `${PLANNER_PROMPT}\n\nBuild: "${prompt}"\nOrigin: (${origin.x}, ${origin.y}, ${origin.z})`,
      'fast'
    );

    let plan;
    try {
      plan = JSON.parse(planText.match(/\{[\s\S]*\}/)[0]);
    } catch {
      plan = { name: prompt, sections: [{ name: 'main', ox: 0, oz: 0, desc: prompt }] };
    }

    const sections = plan.sections || [];
    this.emit('chat', `§a✓ §b${plan.name || prompt} §7— ${sections.length} sections`);
    for (const s of sections) this.emit('chat', `§7  · §e${s.name}`);

    // ===== STEP 2: Parallel sub-agents output COMMANDS =====
    this.emit('chat', `§7Spawning §f${sections.length} §7builders...`);
    this.emit('status', `Building ${sections.length} sections...`);

    const allBlocks = [];

    const promises = sections.map(section => {
      const so = { x: origin.x + (section.ox || 0), y: origin.y, z: origin.z + (section.oz || 0) };

      return this.llm.call(
        `${COMMAND_PROMPT}\n\nSECTION: "${section.name}"\nORIGIN: (${so.x}, ${so.y}, ${so.z})\nDESCRIPTION: ${section.desc}\n\nGenerate commands. All coordinates absolute from origin.`,
        'quality'
      ).then(text => {
        try {
          const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)[0]);
          const commands = parsed.commands || [];
          const blocks = executeCommands(commands);
          allBlocks.push(...blocks);
          this.emit('blocks', blocks);
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          this.emit('chat', `§a  ✓ §e${section.name} §7— ${commands.length} commands → ${blocks.length} blocks (${elapsed}s)`);
        } catch (err) {
          this.emit('chat', `§c  ✗ §e${section.name} §7— ${err.message.substring(0, 50)}`);
        }
      }).catch(err => {
        this.emit('chat', `§c  ✗ §e${section.name} §7— failed`);
      });
    });

    await Promise.allSettled(promises);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    this.emit('chat', `§a§l✓ Done! §r§f${allBlocks.length} blocks §7in ${elapsed}s`);
    this.emit('chat', `§7Arrows=move R=rotate PgUp/Dn=height Enter=place Esc=cancel`);

    return { blocks: allBlocks, removals: [] };
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
