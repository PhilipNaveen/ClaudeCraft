// ============================================================
// Minecraft Build Engine — high-level primitives
// ============================================================
// The LLM describes WHAT to build using game-native primitives.
// The engine handles ALL geometry, facing, placement rules.
// Like a game engine rendering a scene graph.

export function executeCommands(commands, origin = { x: 0, y: 0, z: 0 }) {
  const blocks = [];
  const placed = new Set();

  function add(x, y, z, block) {
    const key = `${x},${y},${z}`;
    if (!placed.has(key)) {
      placed.add(key);
      blocks.push({ x, y, z, block: block.startsWith('minecraft:') ? block : `minecraft:${block}` });
    }
  }

  function addOverwrite(x, y, z, block) {
    const key = `${x},${y},${z}`;
    placed.add(key);
    // Remove existing at this pos
    const idx = blocks.findIndex(b => b.x === x && b.y === y && b.z === z);
    if (idx >= 0) blocks.splice(idx, 1);
    blocks.push({ x, y, z, block: block.startsWith('minecraft:') ? block : `minecraft:${block}` });
  }

  for (const cmd of commands) {
    try {
      exec(cmd, add, addOverwrite, origin);
    } catch (err) {
      console.warn(`[Engine] Command failed: ${cmd.type} — ${err.message}`);
    }
  }

  return blocks;
}

function exec(cmd, add, addOverwrite, origin) {
  // Resolve coordinates relative to origin
  const ox = origin.x, oy = origin.y, oz = origin.z;

  switch (cmd.type) {

    // ============ LOW-LEVEL PRIMITIVES ============

    case 'fill': {
      const { x1, y1, z1, x2, y2, z2, block } = cmd;
      for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
        for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++)
          for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++)
            add(x, y, z, block);
      break;
    }

    case 'walls': {
      const { x1, y1, z1, x2, y2, z2, block, thickness = 1 } = cmd;
      const t = thickness - 1;
      for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
        for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++)
          for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
            if (x <= Math.min(x1,x2)+t || x >= Math.max(x1,x2)-t ||
                z <= Math.min(z1,z2)+t || z >= Math.max(z1,z2)-t)
              add(x, y, z, block);
          }
      break;
    }

    case 'floor': {
      const { x1, z1, x2, z2, y, block } = cmd;
      for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
        for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++)
          add(x, y, z, block);
      break;
    }

    case 'pillar': {
      const { x, z, y1, y2, block } = cmd;
      for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++)
        add(x, y, z, block);
      break;
    }

    case 'line': {
      const { x1, y1, z1, x2, y2, z2, block } = cmd;
      const steps = Math.max(Math.abs(x2-x1), Math.abs(y2-y1), Math.abs(z2-z1)) || 1;
      for (let i = 0; i <= steps; i++)
        add(Math.round(x1+(x2-x1)*i/steps), Math.round(y1+(y2-y1)*i/steps), Math.round(z1+(z2-z1)*i/steps), block);
      break;
    }

    case 'circle': {
      const { cx, cz, y1, y2, radius, block, filled = false } = cmd;
      for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++) {
        for (let dx = -radius; dx <= radius; dx++) {
          for (let dz = -radius; dz <= radius; dz++) {
            const dist = Math.sqrt(dx*dx + dz*dz);
            if (filled ? dist <= radius + 0.5 : (dist >= radius - 0.5 && dist <= radius + 0.5))
              add(cx + dx, y, cz + dz, block);
          }
        }
      }
      break;
    }

    case 'place': {
      const list = cmd.blocks || [];
      for (const b of list) addOverwrite(b.x, b.y, b.z, b.block);
      break;
    }

    case 'repeat': {
      const { command, count, dx = 0, dy = 0, dz = 0 } = cmd;
      for (let i = 0; i < count; i++) {
        const shifted = JSON.parse(JSON.stringify(command));
        const shift = (obj, keys) => { for (const k of keys) if (obj[k] !== undefined) obj[k] += (k.includes('x') || k === 'cx' ? dx : k.includes('z') || k === 'cz' ? dz : dy) * i; };
        shift(shifted, ['x','x1','x2','cx']);
        shift(shifted, ['y','y1','y2','y_start']);
        shift(shifted, ['z','z1','z2','cz']);
        if (shifted.blocks) shifted.blocks = shifted.blocks.map(b => ({...b, x: b.x+dx*i, y: b.y+dy*i, z: b.z+dz*i}));
        exec(shifted, add, addOverwrite, origin);
      }
      break;
    }

    // ============ HIGH-LEVEL MINECRAFT PRIMITIVES ============

    case 'room': {
      // Auto-generates: floor, walls with pillars, ceiling, door, windows, interior lighting
      const { x, y, z, w, d, h = 4, wall_block, floor_block, pillar_block, ceiling_block,
              door_side = 'south', door_offset, windows = true, window_block = 'minecraft:glass_pane',
              lit = true, light_block = 'minecraft:lantern[hanging=true]' } = cmd;

      const wb = wall_block || 'minecraft:oak_planks';
      const fb = floor_block || 'minecraft:spruce_planks';
      const pb = pillar_block || 'minecraft:stripped_oak_log';
      const cb = ceiling_block || wb;

      // Floor
      exec({ type: 'floor', x1: x, z1: z, x2: x+w-1, z2: z+d-1, y: y, block: fb }, add, addOverwrite, origin);

      // Walls (hollow)
      exec({ type: 'walls', x1: x, y1: y+1, z1: z, x2: x+w-1, y2: y+h-1, z2: z+d-1, block: wb }, add, addOverwrite, origin);

      // Ceiling
      exec({ type: 'floor', x1: x, z1: z, x2: x+w-1, z2: z+d-1, y: y+h, block: cb }, add, addOverwrite, origin);

      // Corner pillars
      for (const [px, pz] of [[x,z],[x+w-1,z],[x,z+d-1],[x+w-1,z+d-1]]) {
        exec({ type: 'pillar', x: px, z: pz, y1: y+1, y2: y+h-1, block: pb }, add, addOverwrite, origin);
      }

      // Mid pillars on long walls
      if (w > 6) {
        for (let px = x + 3; px < x + w - 2; px += 3) {
          exec({ type: 'pillar', x: px, z: z, y1: y+1, y2: y+h-1, block: pb }, add, addOverwrite, origin);
          exec({ type: 'pillar', x: px, z: z+d-1, y1: y+1, y2: y+h-1, block: pb }, add, addOverwrite, origin);
        }
      }
      if (d > 6) {
        for (let pz = z + 3; pz < z + d - 2; pz += 3) {
          exec({ type: 'pillar', x: x, z: pz, y1: y+1, y2: y+h-1, block: pb }, add, addOverwrite, origin);
          exec({ type: 'pillar', x: x+w-1, z: pz, y1: y+1, y2: y+h-1, block: pb }, add, addOverwrite, origin);
        }
      }

      // Door
      const doff = door_offset || Math.floor(w / 2);
      if (door_side === 'south') {
        addOverwrite(x + doff, y+1, z, `minecraft:air`);
        addOverwrite(x + doff, y+2, z, `minecraft:air`);
        add(x + doff, y+1, z, `minecraft:oak_door[facing=south,half=lower]`);
        add(x + doff, y+2, z, `minecraft:oak_door[facing=south,half=upper]`);
      } else if (door_side === 'north') {
        addOverwrite(x + doff, y+1, z+d-1, `minecraft:air`);
        addOverwrite(x + doff, y+2, z+d-1, `minecraft:air`);
        add(x + doff, y+1, z+d-1, `minecraft:oak_door[facing=north,half=lower]`);
        add(x + doff, y+2, z+d-1, `minecraft:oak_door[facing=north,half=upper]`);
      } else if (door_side === 'east') {
        const dzoff = door_offset || Math.floor(d / 2);
        addOverwrite(x+w-1, y+1, z+dzoff, `minecraft:air`);
        addOverwrite(x+w-1, y+2, z+dzoff, `minecraft:air`);
        add(x+w-1, y+1, z+dzoff, `minecraft:oak_door[facing=east,half=lower]`);
        add(x+w-1, y+2, z+dzoff, `minecraft:oak_door[facing=east,half=upper]`);
      } else if (door_side === 'west') {
        const dzoff = door_offset || Math.floor(d / 2);
        addOverwrite(x, y+1, z+dzoff, `minecraft:air`);
        addOverwrite(x, y+2, z+dzoff, `minecraft:air`);
        add(x, y+1, z+dzoff, `minecraft:oak_door[facing=west,half=lower]`);
        add(x, y+2, z+dzoff, `minecraft:oak_door[facing=west,half=upper]`);
      }

      // Windows (auto-placed between pillars)
      if (windows) {
        const wy = y + Math.floor(h / 2); // window height
        // South and north walls
        for (let wx = x + 2; wx < x + w - 2; wx += 3) {
          addOverwrite(wx, wy, z, window_block);
          addOverwrite(wx, wy+1, z, window_block);
          addOverwrite(wx, wy, z+d-1, window_block);
          addOverwrite(wx, wy+1, z+d-1, window_block);
        }
        // East and west walls
        for (let wz = z + 2; wz < z + d - 2; wz += 3) {
          addOverwrite(x, wy, wz, window_block);
          addOverwrite(x, wy+1, wz, window_block);
          addOverwrite(x+w-1, wy, wz, window_block);
          addOverwrite(x+w-1, wy+1, wz, window_block);
        }
      }

      // Auto-lighting
      if (lit) {
        const spacing = Math.max(3, Math.floor(Math.min(w, d) / 2));
        for (let lx = x + 2; lx < x + w - 1; lx += spacing) {
          for (let lz = z + 2; lz < z + d - 1; lz += spacing) {
            add(lx, y + h - 1, lz, light_block);
          }
        }
      }
      break;
    }

    case 'roof': {
      const { x1, z1, x2, z2, y_start, axis = 'z', block, cap_block } = cmd;
      const slab = cap_block || (block || 'minecraft:oak_stairs').replace('stairs', 'slab');
      const stair = block || 'minecraft:oak_stairs';

      if (axis === 'z') {
        const minZ = Math.min(z1,z2), maxZ = Math.max(z1,z2);
        const midZ = Math.floor((minZ + maxZ) / 2);
        for (let dz = 0; dz <= midZ - minZ; dz++) {
          for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
            add(x, y_start + dz, minZ + dz, `${stair}[facing=north]`);
            add(x, y_start + dz, maxZ - dz, `${stair}[facing=south]`);
          }
        }
        for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
          add(x, y_start + midZ - minZ, midZ, slab);
      } else {
        const minX = Math.min(x1,x2), maxX = Math.max(x1,x2);
        const midX = Math.floor((minX + maxX) / 2);
        for (let dx = 0; dx <= midX - minX; dx++) {
          for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
            add(minX + dx, y_start + dx, z, `${stair}[facing=east]`);
            add(maxX - dx, y_start + dx, z, `${stair}[facing=west]`);
          }
        }
        for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++)
          add(midX, y_start + midX - minX, z, slab);
      }
      break;
    }

    case 'tower': {
      // Generates: circular walls, floor, spiral stairs, battlements, arrow slits, top platform
      const { cx, cz, y_base, height = 15, radius = 4, block = 'minecraft:stone_bricks',
              stair_block = 'minecraft:stone_stairs', battlement_block = 'minecraft:cobblestone_wall',
              lit = true } = cmd;

      // Circular walls
      exec({ type: 'circle', cx, cz, y1: y_base, y2: y_base + height, radius, block }, add, addOverwrite, origin);

      // Floor
      exec({ type: 'circle', cx, cz, y1: y_base, y2: y_base, radius: radius - 1, block, filled: true }, add, addOverwrite, origin);

      // Top platform
      exec({ type: 'circle', cx, cz, y1: y_base + height, y2: y_base + height, radius, block, filled: true }, add, addOverwrite, origin);

      // Battlements
      for (let angle = 0; angle < 360; angle += 20) {
        const rad = angle * Math.PI / 180;
        const bx = Math.round(cx + radius * Math.cos(rad));
        const bz = Math.round(cz + radius * Math.sin(rad));
        add(bx, y_base + height + 1, bz, battlement_block);
      }

      // Spiral stairs
      const facings = ['south', 'west', 'north', 'east'];
      const offsets = [[0, radius-2], [-(radius-2), 0], [0, -(radius-2)], [radius-2, 0]];
      for (let y = y_base + 1; y < y_base + height; y++) {
        const step = (y - y_base) % 4;
        const [dx, dz] = offsets[step];
        add(cx + dx, y, cz + dz, `${stair_block}[facing=${facings[step]}]`);
        add(cx, y, cz, `minecraft:oak_log`); // center pillar
      }

      // Arrow slits
      for (let y = y_base + 3; y < y_base + height - 2; y += 4) {
        add(cx + radius, y, cz, `minecraft:air`);
        add(cx - radius, y, cz, `minecraft:air`);
        add(cx, y, cz + radius, `minecraft:air`);
        add(cx, y, cz - radius, `minecraft:air`);
      }

      // Lighting
      if (lit) {
        for (let y = y_base + 2; y < y_base + height; y += 4) {
          add(cx, y, cz + 1, 'minecraft:lantern');
        }
        add(cx, y_base + height, cz, 'minecraft:lantern');
      }
      break;
    }

    case 'path': {
      // Generates a slab path between two points with lamp posts
      const { x1, z1, x2, z2, y, block = 'minecraft:stone_brick_slab',
              lamp = true, lamp_spacing = 6 } = cmd;

      const steps = Math.max(Math.abs(x2-x1), Math.abs(z2-z1)) || 1;
      for (let i = 0; i <= steps; i++) {
        const px = Math.round(x1 + (x2-x1) * i / steps);
        const pz = Math.round(z1 + (z2-z1) * i / steps);
        add(px, y, pz, block);
        // Widen path
        if (Math.abs(x2-x1) >= Math.abs(z2-z1)) {
          add(px, y, pz + 1, block);
        } else {
          add(px + 1, y, pz, block);
        }

        // Lamp posts
        if (lamp && i % lamp_spacing === 0 && i > 0 && i < steps) {
          const lz = Math.abs(x2-x1) >= Math.abs(z2-z1) ? pz + 2 : pz;
          const lx = Math.abs(x2-x1) >= Math.abs(z2-z1) ? px : px + 2;
          add(lx, y + 1, lz, 'minecraft:oak_fence');
          add(lx, y + 2, lz, 'minecraft:oak_fence');
          add(lx, y + 3, lz, 'minecraft:lantern');
        }
      }
      break;
    }

    case 'garden': {
      // Generates a fenced garden area with flowers and details
      const { x1, z1, x2, z2, y, fence_block = 'minecraft:oak_fence' } = cmd;
      const flowers = ['minecraft:poppy', 'minecraft:dandelion', 'minecraft:cornflower',
                       'minecraft:oxeye_daisy', 'minecraft:azure_bluet', 'minecraft:allium'];

      // Fence border
      for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
        add(x, y + 1, Math.min(z1,z2), fence_block);
        add(x, y + 1, Math.max(z1,z2), fence_block);
      }
      for (let z = Math.min(z1,z2)+1; z < Math.max(z1,z2); z++) {
        add(Math.min(x1,x2), y + 1, z, fence_block);
        add(Math.max(x1,x2), y + 1, z, fence_block);
      }

      // Grass and flowers inside
      for (let x = Math.min(x1,x2)+1; x < Math.max(x1,x2); x++) {
        for (let z = Math.min(z1,z2)+1; z < Math.max(z1,z2); z++) {
          add(x, y, z, 'minecraft:grass_block');
          if ((x + z) % 2 === 0) {
            add(x, y + 1, z, flowers[(x * 7 + z * 13) % flowers.length]);
          }
        }
      }
      break;
    }

    case 'chimney': {
      const { x, z, y_base, height = 5, block = 'minecraft:cobblestone_wall' } = cmd;
      for (let y = y_base; y < y_base + height; y++) add(x, y, z, block);
      add(x, y_base + height, z, 'minecraft:campfire[lit=true]');
      break;
    }

    case 'furniture': {
      // Place a named furniture preset at a location
      const { x, y, z, preset, facing = 'south' } = cmd;
      switch (preset) {
        case 'table':
          add(x, y, z, 'minecraft:oak_fence');
          add(x, y + 1, z, 'minecraft:oak_pressure_plate');
          break;
        case 'chair':
          add(x, y, z, `minecraft:oak_stairs[facing=${facing}]`);
          break;
        case 'desk':
          add(x, y, z, 'minecraft:oak_fence');
          add(x, y + 1, z, `minecraft:oak_trapdoor[facing=${facing},half=top,open=true]`);
          break;
        case 'shelf':
          add(x, y, z, 'minecraft:bookshelf');
          add(x, y + 1, z, 'minecraft:bookshelf');
          break;
        case 'kitchen':
          add(x, y, z, 'minecraft:furnace');
          add(x + 1, y, z, 'minecraft:crafting_table');
          add(x + 2, y, z, 'minecraft:barrel');
          break;
        case 'bed':
          add(x, y, z, `minecraft:red_bed[facing=${facing},part=foot]`);
          const headDir = { south: [0,0,-1], north: [0,0,1], east: [-1,0,0], west: [1,0,0] };
          const [hx,hy,hz] = headDir[facing] || [0,0,-1];
          add(x+hx, y, z+hz, `minecraft:red_bed[facing=${facing},part=head]`);
          break;
        case 'fireplace':
          add(x, y, z, 'minecraft:campfire[lit=true]');
          add(x-1, y, z, 'minecraft:stone_bricks');
          add(x+1, y, z, 'minecraft:stone_bricks');
          add(x-1, y+1, z, 'minecraft:stone_bricks');
          add(x+1, y+1, z, 'minecraft:stone_bricks');
          add(x, y+1, z, 'minecraft:iron_bars');
          add(x-1, y+2, z, 'minecraft:stone_bricks');
          add(x+1, y+2, z, 'minecraft:stone_bricks');
          add(x, y+2, z, 'minecraft:stone_bricks');
          break;
      }
      break;
    }

    case 'door': {
      const { x, y, z, facing = 'south', block = 'minecraft:oak_door' } = cmd;
      add(x, y, z, `${block}[facing=${facing},half=lower]`);
      add(x, y + 1, z, `${block}[facing=${facing},half=upper]`);
      break;
    }

    case 'window': {
      const { x, y, z, w = 2, h = 2, axis = 'x', glass_block = 'minecraft:glass_pane' } = cmd;
      for (let dy = 0; dy < h; dy++)
        for (let dw = 0; dw < w; dw++) {
          if (axis === 'x') addOverwrite(x + dw, y + dy, z, glass_block);
          else addOverwrite(x, y + dy, z + dw, glass_block);
        }
      break;
    }

    case 'battlements': {
      const { x1, z1, x2, z2, y, block = 'minecraft:cobblestone_wall', spacing = 2 } = cmd;
      for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
        if (x % spacing === 0) {
          add(x, y, Math.min(z1,z2), block);
          add(x, y, Math.max(z1,z2), block);
        }
      }
      for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
        if (z % spacing === 0) {
          add(Math.min(x1,x2), y, z, block);
          add(Math.max(x1,x2), y, z, block);
        }
      }
      break;
    }

    case 'stairs_spiral': {
      const { cx, cz, y1, y2, radius = 2, block = 'minecraft:oak_stairs' } = cmd;
      const facings = ['south', 'west', 'north', 'east'];
      const offsets = [[0, radius], [-radius, 0], [0, -radius], [radius, 0]];
      for (let y = y1; y <= y2; y++) {
        const step = (y - y1) % 4;
        const [dx, dz] = offsets[step];
        add(cx + dx, y, cz + dz, `${block}[facing=${facings[step]}]`);
        add(cx, y, cz, 'minecraft:oak_log');
      }
      break;
    }

    default:
      console.warn(`[Engine] Unknown: ${cmd.type}`);
  }
}
