// ============================================================
// Minecraft Building Knowledge Base
// ============================================================
// The equivalent of Claude Code's language/framework knowledge.
// Everything an expert Minecraft builder knows, encoded as
// structured constraints and patterns.

export const BLOCK_PROPERTIES = `
=== BLOCK VISUAL PROPERTIES & USAGE ===

WOOD TYPES (warm to cool):
- oak: warm yellow-brown, generic/medieval. Most versatile.
- spruce: dark brown, cold/nordic builds. Great contrast with snow.
- birch: pale cream, light/airy builds. Interior walls, floors.
- jungle: orange-red tint, tropical/exotic. Accent wood.
- acacia: warm orange, savanna/desert. Bold accent.
- dark_oak: deep brown, almost black. Heavy/gothic/medieval frames.
- mangrove: rich red-brown, swamp/organic. Unique tone.
- cherry: pink-white, Japanese/fantasy. Distinct aesthetic.
- crimson: dark red, nether/evil builds. Won't burn.
- warped: teal-blue, alien/nether. Won't burn.

LOG vs PLANKS vs STRIPPED:
- log: bark texture on sides, rings on top/bottom. Use for pillars, frames.
- stripped_log: smooth, lighter. Cleaner look for walls, beams.
- planks: flat wood texture. Walls, floors, general fill.
- wood (6-sided bark): Use log[axis=x/y/z] for direction. Decorative columns.

STONE TYPES (light to dark):
- sandstone: light tan, desert/Egyptian. smooth_sandstone for clean walls.
- stone: medium gray, generic. Too plain alone — mix with cobblestone.
- cobblestone: rough gray, rustic/medieval. Great for foundations.
- stone_bricks: clean gray, formal/castle. The go-to for quality builds.
- mossy_stone_bricks: aged/overgrown variant. Mix 10-20% for weathering.
- cracked_stone_bricks: damaged variant. Mix 5-10% for age.
- andesite: speckled gray, natural. Transitions between stone types.
- diorite: white-gray speckled. Modern/clean accent.
- granite: pink-brown speckled. Warm stone accent.
- deepslate: dark gray, almost black. Heavy/underground/gothic.
- deepslate_bricks/tiles: refined dark stone. Elegant dark builds.
- blackstone: pure dark, nether origin. Evil/fortress builds.
- tuff: brownish-gray, earthy. Good for paths and natural bases.

BRICK/TERRACOTTA:
- bricks: classic red-orange. Chimneys, industrial, colonial.
- nether_bricks: dark purplish-red. Nether fortresses. Menacing.
- red_nether_bricks: darker red variant. Accent for nether builds.
- terracotta: comes in 16 colors. Adobe/southwest/decorative. Muted tones.
- glazed_terracotta: colorful patterns per color. Decorative floors/walls.

CONCRETE & WOOL:
- concrete: flat solid color, 16 variants. Modern/clean builds.
- concrete_powder: slightly textured variant. Falls with gravity.
- wool: soft texture, 16 colors. Banners, interiors, pixel art.

GLASS:
- glass: fully transparent but has visible edges. Windows.
- glass_pane: thin, connects to adjacent blocks. Better windows than full glass.
- tinted_glass: dark, blocks light. Moody/modern windows.
- stained_glass/pane: 16 colors. Cathedral windows, decoration.

COPPER:
- copper_block: orange when new, oxidizes to teal over time.
- cut_copper: panel texture. Roofing, industrial.
- copper_grate: see-through metal. Industrial/steampunk.
- waxed variants prevent oxidation.

PRISMARINE:
- prismarine: teal-green, animated texture. Ocean/aquatic builds.
- dark_prismarine: deeper blue-green. More formal aquatic.
- sea_lantern: glowing aquatic light block (light level 15).

=== DECORATIVE BLOCKS ===

LIGHTING (by warmth):
- torch: warm flickering, light 14. Mount on walls/floors. Medieval.
- soul_torch: blue flame, light 10. Eerie/cold atmosphere.
- lantern: warm, light 15. Hang from ceiling or place on floor. Best medieval light.
- soul_lantern: blue, light 10. Spooky/nether builds.
- glowstone: bright yellow, light 15. Hidden lighting, nether ceilings.
- shroomlight: warm organic glow, light 15. Natural/nether lighting.
- sea_lantern: cool aquatic glow, light 15. Underwater/modern.
- end_rod: white thin rod, light 14. Modern/futuristic/end builds.
- candle: small, 1-4 per block. Ambient/medieval. Low light.
- redstone_lamp: toggleable with redstone. Modern/functional.
- froglight: 3 colors (ochre/pearlescent/verdant). Unique organic light.
- copper_bulb: industrial light. Toggleable.

VEGETATION:
- oak_leaves: dense green. Trees, hedges, garden walls.
- azalea_leaves: flowering variant. Garden accent.
- moss_block: bright green carpet. Lush/overgrown surfaces.
- moss_carpet: thin moss layer. Top surfaces.
- vine: hangs from blocks, grows down. Overgrown/jungle.
- glow_lichen: dim light + texture. Cave/ambient decoration.
- hanging_roots: thin dangling roots. Cave ceilings.
- dripleaf: large lily pad. Jungle/swamp platforms.
- flower_pot: holds flowers/saplings. Interior decoration.
- flowers: poppy, dandelion, cornflower, etc. Gardens.

FURNITURE (using block tricks):
- stairs (upside down) = bench/chair seat
- trapdoor on wall = cabinet/shelf
- trapdoor on fence = table
- item_frame = wall decoration (invisible in some setups)
- flower_pot = vase/decoration
- brewing_stand = laboratory equipment
- anvil = industrial/blacksmith
- grindstone = workshop equipment
- stonecutter = kitchen counter accent
- loom = bedroom/craft furniture
- barrel = storage/decoration
- campfire = cooking area (can be hidden for smoke effect)
- bell = town center/decoration

=== SHAPE BLOCKS (critical for build quality) ===

STAIRS [facing=north/south/east/west][half=bottom/top]:
- The MOST important detail block. Creates depth, roofs, seats, arches.
- facing = direction the "cut" faces (the open/low side)
- half=bottom: normal stair. half=top: upside-down (for arches, soffits)
- Auto-connects to adjacent stairs to form corners
- USE FOR: rooflines, window sills, door frames, wall trim, arches, paths

SLABS [type=bottom/top/double]:
- Half-height blocks. Roofing, floors, shelves, counters.
- type=bottom: lower half. type=top: upper half. double: full block.
- USE FOR: roof ridges, floor transitions, countertops, pathway edging

WALLS:
- cobblestone_wall, stone_brick_wall, etc. Auto-connect like fences but stone.
- USE FOR: low walls, battlements, pillar tops, chimney caps, fences

FENCES:
- oak_fence, nether_brick_fence, etc. Thin posts that auto-connect.
- USE FOR: railings, window bars, table legs, balconies, bridges

FENCE GATES:
- Opens/closes. Use as chair backs, small doors, decoration.

TRAPDOORS:
- Thin panels that open/close. [open=true/false][facing=north/south/east/west]
- USE FOR: shutters, cabinet doors, decorative panels, hidden details
- When open + on wall = great window shutter or wall detail

IRON BARS:
- Thin metal bars that auto-connect.
- USE FOR: prison windows, industrial, castle arrow slits, railings

CHAINS:
- Vertical/horizontal thin chain links.
- USE FOR: hanging lanterns, chandeliers, drawbridge, industrial

BUTTONS/PRESSURE PLATES:
- Tiny surface decorations.
- USE FOR: door handles, wall detail, floor patterns

BANNERS:
- Tall decorative flags. 16 base colors + patterns.
- USE FOR: castle walls, guild halls, decoration

SIGNS:
- Can display text. Mount on walls or posts.
- USE FOR: labels, shop signs, building markers
`;

export const BUILDING_PATTERNS = `
=== BUILDING DESIGN PATTERNS ===

PATTERN: WALL DEPTH (most important technique)
- NEVER make flat 1-block-thick walls. They look terrible.
- Minimum: recess windows by 1 block (place glass_pane 1 block inset)
- Better: use log/stripped_log pillars at corners and every 3-4 blocks, fill between with planks
- Best: alternating materials + stairs as trim + trapdoors as shutters
- Example good wall cross-section at a window:
    L P P G G P P L    (L=log pillar, P=planks, G=glass_pane recessed 1 block)

PATTERN: PROPER ROOFS
- NEVER make flat roofs (just a slab ceiling). Always add a proper roofline.
- Gable roof: stairs ascending from two opposite sides, meeting at a slab/stair ridge
  y=5: S___S     (S=stair facing inward, _=air)
  y=6: _S_S_
  y=7: __L__     (L=slab ridge)
- Hip roof: stairs on ALL four sides, ascending to a point
- Overhang: extend roof 1 block past walls. Use upside-down stairs for soffit.
- Stair facing for roofs:
  North side: stairs[facing=south] (open side faces south = slopes up to north)
  South side: stairs[facing=north]
  East side: stairs[facing=west]
  West side: stairs[facing=east]

PATTERN: FOUNDATIONS
- Buildings should NOT sit directly on ground. Add a foundation.
- Simple: 1-block stone/cobblestone border extending 1 block past walls
- Better: 2-block-tall stone base with the wood structure on top
- This grounds the build and adds visual weight

PATTERN: WINDOWS
- Never use full glass blocks for windows. Use glass_pane.
- Recess the pane 1 block into the wall for depth
- Frame with stairs (top/bottom) and trapdoors (sides) for window frame
- Pattern: stairs[half=top] above, stairs below, trapdoor shutters on sides

PATTERN: DOORWAYS
- Never just cut a 1x2 hole. Build a proper entrance.
- Minimum: stairs as door frame header (upside-down stair above door)
- Better: pillars flanking door, stair arch above, slab step in front
- Porch: extend roof over entrance, add fence post supports

PATTERN: INTERIOR
- Floor: don't use same block as walls. Use contrasting material.
- Ceiling: use slabs or stairs for a finished ceiling (not exposed roof)
- Furniture: use block tricks (stairs=chairs, trapdoor+fence=table, etc.)
- Lighting: lanterns hanging from chains, not torches stuck to walls
- Storage: barrels and chests along walls
- Rooms need: light source, furniture, purpose (bedroom, kitchen, etc.)

PATTERN: TEXTURE MIXING
- Never use a single block type for large surfaces. Mix 2-3 variants.
- Stone walls: 70% stone_bricks, 15% mossy_stone_bricks, 10% cracked_stone_bricks, 5% andesite
- Wood walls: 80% planks + 20% stripped_log accents
- Paths: 60% gravel + 20% coarse_dirt + 20% stone_button details

PATTERN: LANDSCAPING
- Don't just place a building on flat ground. Add context.
- Path from door: gravel, stone_brick_slab, or dirt_path
- Garden: flowers, leaf hedges, composters, fences
- Trees: oak_log trunk + oak_leaves canopy
- Lighting: lanterns on fence posts along paths

PATTERN: COLOR THEORY
- Warm builds: oak/spruce/dark_oak + stone_bricks + bricks
- Cool builds: birch/stripped_birch + diorite + prismarine
- Nether: nether_bricks + blackstone + crimson + soul_fire
- Modern: concrete + glass + iron_block + quartz
- Fantasy: purpur + end_stone_bricks + amethyst + cherry
- Use max 3-4 block types per surface. More = chaotic.

PATTERN: SCALE
- Ceiling height: 3-4 blocks interior (never 2, feels cramped)
- Wall thickness: 1-2 blocks (1 for small builds, 2 for castles)
- Window size: 1x2 minimum, 2x3 for large builds
- Door: always 1x2 (standard) or 2x2 (grand entrance)
- Room size: minimum 4x4 interior, 6x8 for main rooms
- Hallways: 2-3 wide, 3-4 tall

=== STATUE/PIXEL ART PATTERNS ===

PATTERN: PIXEL ART (for statues, murals, etc.)
- Each Minecraft block = 1 pixel
- Plan on a grid first, then convert to block coordinates
- Use wool/concrete for flat color
- Steve skin colors: head=beige(sandstone)+brown(dark_oak_planks)+blue(light_blue_wool)+white(white_wool)
- Build layer by layer (one Y-slice at a time)
- For 3D statues: build the silhouette first, then add depth

STEVE STATUE COLOR MAP:
- Hair: dark_oak_planks or brown_wool
- Skin: sandstone or birch_planks
- Eyes: white_wool + blue_wool (or lapis_block)
- Mouth: spruce_planks (dark line)
- Shirt: light_blue_wool or cyan_terracotta
- Pants: blue_wool or blue_terracotta
- Shoes: gray_wool or gray_concrete
- At 1:1 scale Steve is 2 wide x 2 deep x roughly 32 tall (head 8x8, body, legs)
- Scale up by multiplying: 2x scale = 4 wide, 64 tall

=== REDSTONE PATTERNS ===

REDSTONE BASICS:
- redstone_wire: carries signal, weakens 1 per block (max 15 blocks)
- redstone_torch: power source, inverts signal. Light level 7.
- redstone_repeater: extends signal 15 more blocks, adds 1-4 tick delay
- redstone_comparator: compares/subtracts signals, reads container fill
- lever/button/pressure_plate: input devices
- piston: pushes blocks. sticky_piston pulls them back.
- observer: detects block changes, outputs pulse
- hopper: transfers items between containers. Points into target.
- dropper/dispenser: ejects items. Dispenser uses them (arrows, water, etc.)
- target: outputs redstone signal when hit by projectile
- daylight_detector: outputs signal based on time of day
- tripwire_hook: detects entities crossing string line
- sculk_sensor: detects vibrations wirelessly

PATTERN: HIDDEN DOOR (piston door)
- sticky_piston behind wall pushes blocks to reveal opening
- Input: button/lever/pressure_plate
- Need redstone running behind wall to pistons
- 2x2 flush door: 4 sticky pistons, each pulling one block

PATTERN: AUTO LIGHTING
- daylight_detector → NOT gate (redstone_torch) → redstone_lamp
- Lamps turn on at night automatically

PATTERN: ITEM SORTER
- hopper chain with comparators reading fill level
- Each hopper filtered to one item type
- Overflow goes to next hopper

PATTERN: HIDDEN ENTRANCE
- painting over 1x2 gap (walk through painting)
- Armor stand on pressure plate (move stand to open)
- Bookshelf piston door (bookshelves retract into wall)

REDSTONE PLACEMENT RULES:
- Redstone dust goes on TOP of solid blocks only
- Repeaters/comparators face a direction (output = front)
- Torches can be placed on sides of blocks
- Transparent blocks (glass, slabs, stairs) DON'T conduct redstone on top
- Pistons need 1 tick (0.1s) minimum to extend
- Redstone tick = 0.1 seconds (2 game ticks)
`;

export const ANTI_PATTERNS = `
=== ANTI-PATTERNS (what NOT to do) ===

NEVER: Solid-fill walls
  Bad:  SSSSS    (S=stone, all solid)
  Good: S___S    (hollow shell with interior space)

NEVER: Flat single-material surfaces
  Bad:  PPPPPPP  (all oak_planks)
  Good: LPPPLPPL (L=log pillars breaking up planks)

NEVER: No foundation
  Bad:  building sits directly on grass
  Good: stone/cobble base extending 1 block past walls

NEVER: Flat roof
  Bad:  slab ceiling with nothing above
  Good: proper stair roof with overhang

NEVER: Torches stuck randomly on walls
  Bad:  torch at random heights
  Good: lanterns at consistent heights, on chains or posts

NEVER: Full glass blocks as windows
  Bad:  glass block in wall
  Good: glass_pane recessed 1 block, framed with stairs

NEVER: Single door with no frame
  Bad:  door in flat wall
  Good: door with stair header, slab step, maybe pillars

NEVER: Empty interior
  Bad:  hollow box with nothing inside
  Good: furnished rooms with purpose (bed, crafting, storage)

NEVER: Same Y-level everything
  Bad:  all floor details at y=1
  Good: varied heights (sunken areas, raised platforms, lofts)

NEVER: Symmetric everything
  Bad:  perfectly mirrored building
  Good: slight asymmetry (chimney on one side, extension, varied windows)

NEVER: Ignoring the palette
  Bad:  random block types mixed everywhere
  Good: 3-4 complementary materials used consistently
`;
