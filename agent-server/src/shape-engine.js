// ============================================================
// Shape Engine — converts high-level commands to block arrays
// ============================================================
// The LLM describes WHAT to build using commands.
// This engine generates the actual blocks.
// Like a GPU — LLM is the CPU issuing draw calls, this rasterizes.

export function executeCommands(commands) {
  const blocks = [];
  const placed = new Set(); // dedup

  for (const cmd of commands) {
    const newBlocks = executeCommand(cmd);
    for (const b of newBlocks) {
      const key = `${b.x},${b.y},${b.z}`;
      if (!placed.has(key)) {
        placed.add(key);
        blocks.push(b);
      }
    }
  }

  return blocks;
}

function executeCommand(cmd) {
  switch (cmd.type) {
    case 'fill': return cmdFill(cmd);
    case 'walls': return cmdWalls(cmd);
    case 'floor': return cmdFloor(cmd);
    case 'pillar': return cmdPillar(cmd);
    case 'line': return cmdLine(cmd);
    case 'roof': return cmdRoof(cmd);
    case 'door': return cmdDoor(cmd);
    case 'window': return cmdWindow(cmd);
    case 'stairs_spiral': return cmdSpiralStairs(cmd);
    case 'place': return cmdPlace(cmd);
    case 'repeat': return cmdRepeat(cmd);
    case 'circle': return cmdCircle(cmd);
    case 'battlements': return cmdBattlements(cmd);
    default:
      console.warn(`[ShapeEngine] Unknown command: ${cmd.type}`);
      return [];
  }
}

// Fill a 3D box solid
function cmdFill({ x1, y1, z1, x2, y2, z2, block }) {
  const blocks = [];
  for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
    for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++)
      for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++)
        blocks.push({ x, y, z, block });
  return blocks;
}

// Hollow walls (shell) of a box — floor and ceiling optional
function cmdWalls({ x1, y1, z1, x2, y2, z2, block, thickness = 1 }) {
  const blocks = [];
  const t = thickness - 1;
  for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
    for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++)
      for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
        const onXWall = x <= Math.min(x1,x2) + t || x >= Math.max(x1,x2) - t;
        const onZWall = z <= Math.min(z1,z2) + t || z >= Math.max(z1,z2) - t;
        if (onXWall || onZWall)
          blocks.push({ x, y, z, block });
      }
  return blocks;
}

// Floor (single Y level, filled rectangle)
function cmdFloor({ x1, z1, x2, z2, y, block }) {
  const blocks = [];
  for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++)
    for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++)
      blocks.push({ x, y, z, block });
  return blocks;
}

// Vertical pillar
function cmdPillar({ x, z, y1, y2, block }) {
  const blocks = [];
  for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++)
    blocks.push({ x, y, z, block });
  return blocks;
}

// Horizontal line of blocks
function cmdLine({ x1, y1, z1, x2, y2, z2, block }) {
  const blocks = [];
  const steps = Math.max(Math.abs(x2-x1), Math.abs(y2-y1), Math.abs(z2-z1)) || 1;
  for (let i = 0; i <= steps; i++) {
    blocks.push({
      x: Math.round(x1 + (x2-x1) * i / steps),
      y: Math.round(y1 + (y2-y1) * i / steps),
      z: Math.round(z1 + (z2-z1) * i / steps),
      block
    });
  }
  return blocks;
}

// Gable or hip roof using stairs
function cmdRoof({ x1, z1, x2, z2, y_start, axis = 'z', block, cap_block }) {
  const blocks = [];
  const slab = cap_block || block.replace('stairs', 'slab');

  if (axis === 'z') {
    // Roof slopes along Z axis (north-south ridge)
    const midZ = Math.floor((Math.min(z1,z2) + Math.max(z1,z2)) / 2);
    let y = y_start;
    for (let dz = 0; dz <= midZ - Math.min(z1,z2); dz++) {
      // South side
      for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
        blocks.push({ x, y: y + dz, z: Math.min(z1,z2) + dz, block: `${block}[facing=north]` });
      }
      // North side
      for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
        blocks.push({ x, y: y + dz, z: Math.max(z1,z2) - dz, block: `${block}[facing=south]` });
      }
    }
    // Ridge cap
    for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
      blocks.push({ x, y: y + midZ - Math.min(z1,z2), z: midZ, block: slab });
    }
  } else {
    // Roof slopes along X axis (east-west ridge)
    const midX = Math.floor((Math.min(x1,x2) + Math.max(x1,x2)) / 2);
    let y = y_start;
    for (let dx = 0; dx <= midX - Math.min(x1,x2); dx++) {
      for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
        blocks.push({ x: Math.min(x1,x2) + dx, y: y + dx, z, block: `${block}[facing=east]` });
        blocks.push({ x: Math.max(x1,x2) - dx, y: y + dx, z, block: `${block}[facing=west]` });
      }
    }
    for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
      blocks.push({ x: midX, y: y + midX - Math.min(x1,x2), z, block: slab });
    }
  }
  return blocks;
}

// Place a door (both halves)
function cmdDoor({ x, y, z, facing = 'south', block = 'minecraft:oak_door' }) {
  return [
    { x, y, z, block: `${block}[facing=${facing},half=lower]` },
    { x, y: y + 1, z, block: `${block}[facing=${facing},half=upper]` }
  ];
}

// Window (recessed glass pane with optional frame)
function cmdWindow({ x, y, z, w = 2, h = 2, axis = 'x', frame_block, glass_block = 'minecraft:glass_pane' }) {
  const blocks = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dw = 0; dw < w; dw++) {
      if (axis === 'x') {
        blocks.push({ x: x + dw, y: y + dy, z, block: glass_block });
      } else {
        blocks.push({ x, y: y + dy, z: z + dw, block: glass_block });
      }
    }
  }
  // Frame with stairs if specified
  if (frame_block) {
    for (let dw = 0; dw < w; dw++) {
      if (axis === 'x') {
        blocks.push({ x: x + dw, y: y + h, z, block: `${frame_block}[half=top]` });
        blocks.push({ x: x + dw, y: y - 1, z, block: frame_block });
      } else {
        blocks.push({ x, y: y + h, z: z + dw, block: `${frame_block}[half=top]` });
        blocks.push({ x, y: y - 1, z: z + dw, block: frame_block });
      }
    }
  }
  return blocks;
}

// Spiral staircase
function cmdSpiralStairs({ cx, cz, y1, y2, radius = 2, block = 'minecraft:oak_stairs' }) {
  const blocks = [];
  const facings = ['south', 'west', 'north', 'east'];
  const offsets = [
    [0, radius],   // south
    [-radius, 0],  // west
    [0, -radius],  // north
    [radius, 0],   // east
  ];
  for (let y = y1; y <= y2; y++) {
    const step = (y - y1) % 4;
    const [dx, dz] = offsets[step];
    blocks.push({ x: cx + dx, y, z: cz + dz, block: `${block}[facing=${facings[step]}]` });
    // Fill center pillar
    blocks.push({ x: cx, y, z: cz, block: 'minecraft:oak_log' });
  }
  return blocks;
}

// Place single block or list of blocks
function cmdPlace({ blocks: blockList }) {
  return blockList || [];
}

// Repeat a pattern with offset
function cmdRepeat({ command, count, dx = 0, dy = 0, dz = 0 }) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const shifted = { ...command };
    // Shift all coordinates
    for (const key of ['x', 'x1', 'x2']) if (shifted[key] !== undefined) shifted[key] += dx * i;
    for (const key of ['y', 'y1', 'y2', 'y_start']) if (shifted[key] !== undefined) shifted[key] += dy * i;
    for (const key of ['z', 'z1', 'z2']) if (shifted[key] !== undefined) shifted[key] += dz * i;
    blocks.push(...executeCommand(shifted));
  }
  return blocks;
}

// Circle/cylinder outline
function cmdCircle({ cx, cz, y1, y2, radius, block }) {
  const blocks = [];
  for (let y = Math.min(y1,y2); y <= Math.max(y1,y2); y++) {
    for (let angle = 0; angle < 360; angle += 5) {
      const rad = angle * Math.PI / 180;
      const x = Math.round(cx + radius * Math.cos(rad));
      const z = Math.round(cz + radius * Math.sin(rad));
      blocks.push({ x, y, z, block });
    }
  }
  return blocks;
}

// Battlements (crenellations on top of a wall)
function cmdBattlements({ x1, z1, x2, z2, y, block = 'minecraft:cobblestone_wall', spacing = 2 }) {
  const blocks = [];
  // Along X edges
  for (let x = Math.min(x1,x2); x <= Math.max(x1,x2); x++) {
    if (x % spacing === 0) {
      blocks.push({ x, y, z: Math.min(z1,z2), block });
      blocks.push({ x, y, z: Math.max(z1,z2), block });
    }
  }
  // Along Z edges
  for (let z = Math.min(z1,z2); z <= Math.max(z1,z2); z++) {
    if (z % spacing === 0) {
      blocks.push({ x: Math.min(x1,x2), y, z, block });
      blocks.push({ x: Math.max(x1,x2), y, z, block });
    }
  }
  return blocks;
}
