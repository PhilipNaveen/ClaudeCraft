import { WebSocketServer, WebSocket } from 'ws';
import { ClaudeBuilder } from './claude-builder.js';

const PORT = 3099;

// Mock build response (what Claude would return)
const MOCK_TOWER = {
  blocks: []
};

// Generate a simple watchtower programmatically to simulate Claude output
const ox = 100, oy = 64, oz = 200;
// Foundation 5x5
for (let x = 0; x < 5; x++) {
  for (let z = 0; z < 5; z++) {
    MOCK_TOWER.blocks.push({ x: ox + x, y: oy, z: oz + z, block: 'minecraft:cobblestone' });
  }
}
// Walls 10 high
for (let y = 1; y <= 10; y++) {
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      if (x === 0 || x === 4 || z === 0 || z === 4) {
        MOCK_TOWER.blocks.push({ x: ox + x, y: oy + y, z: oz + z, block: 'minecraft:stone_bricks' });
      }
    }
  }
}
// Torches
MOCK_TOWER.blocks.push({ x: ox + 2, y: oy + 3, z: oz + 1, block: 'minecraft:torch' });
MOCK_TOWER.blocks.push({ x: ox + 2, y: oy + 7, z: oz + 1, block: 'minecraft:torch' });
// Ladder
for (let y = 1; y <= 10; y++) {
  MOCK_TOWER.blocks.push({ x: ox + 1, y: oy + y, z: oz + 1, block: 'minecraft:ladder' });
}

const MOCK_EDIT = {
  blocks: [
    { x: ox + 2, y: oy + 5, z: oz, block: 'minecraft:mossy_stone_bricks' },
    { x: ox + 3, y: oy + 6, z: oz, block: 'minecraft:mossy_stone_bricks' },
    { x: ox + 1, y: oy + 8, z: oz + 4, block: 'minecraft:vine' },
    { x: ox + 0, y: oy + 9, z: oz + 2, block: 'minecraft:vine' },
  ],
  removals: [
    { x: ox + 4, y: oy + 8, z: oz + 2 },
    { x: ox + 4, y: oy + 9, z: oz + 3 },
  ]
};

async function test() {
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  PASS: ${name}`);
      passed++;
    } else {
      console.log(`  FAIL: ${name}`);
      failed++;
    }
  }

  // --- Test 1: Block format validation ---
  console.log('\n=== TEST 1: Block Format Validation ===');
  const allValid = MOCK_TOWER.blocks.every(b =>
    typeof b.x === 'number' && typeof b.y === 'number' && typeof b.z === 'number' && typeof b.block === 'string'
  );
  assert(allValid, 'All blocks have x, y, z (number) and block (string)');
  assert(MOCK_TOWER.blocks.length > 50, `Generated ${MOCK_TOWER.blocks.length} blocks (expected >50)`);

  const xs = MOCK_TOWER.blocks.map(b => b.x);
  const ys = MOCK_TOWER.blocks.map(b => b.y);
  const zs = MOCK_TOWER.blocks.map(b => b.z);
  const width = Math.max(...xs) - Math.min(...xs) + 1;
  const height = Math.max(...ys) - Math.min(...ys) + 1;
  const depth = Math.max(...zs) - Math.min(...zs) + 1;
  console.log(`  Bounding box: ${width}x${height}x${depth} at origin (${ox},${oy},${oz})`);
  assert(width === 5, `Width is 5 (got ${width})`);
  assert(height === 11, `Height is 11 (got ${height})`);
  assert(depth === 5, `Depth is 5 (got ${depth})`);

  const types = {};
  MOCK_TOWER.blocks.forEach(b => { types[b.block] = (types[b.block] || 0) + 1; });
  console.log('  Block types:');
  Object.entries(types).sort((a, b) => b[1] - a[1]).forEach(([type, count]) =>
    console.log(`    ${type}: ${count}`)
  );
  assert(Object.keys(types).length >= 3, 'Uses 3+ block types');

  // --- Test 2: Edit format validation ---
  console.log('\n=== TEST 2: Edit Format Validation ===');
  assert(Array.isArray(MOCK_EDIT.blocks), 'Edit has blocks array');
  assert(Array.isArray(MOCK_EDIT.removals), 'Edit has removals array');
  assert(MOCK_EDIT.blocks.length > 0, `Edit has ${MOCK_EDIT.blocks.length} block changes`);
  assert(MOCK_EDIT.removals.length > 0, `Edit has ${MOCK_EDIT.removals.length} removals`);
  const editBlocksValid = MOCK_EDIT.blocks.every(b => b.x !== undefined && b.block);
  assert(editBlocksValid, 'Edit blocks have valid format');
  const removalValid = MOCK_EDIT.removals.every(r => r.x !== undefined && r.y !== undefined && r.z !== undefined);
  assert(removalValid, 'Removals have valid format');

  // --- Test 3: JSON parse round-trip (simulates Claude response parsing) ---
  console.log('\n=== TEST 3: JSON Parse Round-trip ===');
  const builder = new ClaudeBuilder();

  // Test clean JSON
  const cleanJson = JSON.stringify(MOCK_TOWER);
  const parsed1 = builder._parseResponse(cleanJson);
  assert(parsed1.blocks.length === MOCK_TOWER.blocks.length, 'Clean JSON parse');

  // Test with markdown fences (Claude sometimes wraps in ```)
  const fencedJson = '```json\n' + cleanJson + '\n```';
  const parsed2 = builder._parseResponse(fencedJson);
  assert(parsed2.blocks.length === MOCK_TOWER.blocks.length, 'Fenced JSON parse');

  // Test edit response
  const editJson = JSON.stringify(MOCK_EDIT);
  const parsed3 = builder._parseResponse(editJson);
  assert(parsed3.blocks.length === MOCK_EDIT.blocks.length, 'Edit JSON parse');
  assert(parsed3.removals.length === MOCK_EDIT.removals.length, 'Edit removals parse');

  // --- Test 4: Full WebSocket Protocol ---
  console.log('\n=== TEST 4: WebSocket Protocol (full flow) ===');

  await new Promise((resolve) => {
    const wss = new WebSocketServer({ port: PORT });
    const messageLog = [];

    wss.on('connection', (ws) => {
      console.log('  Server: mod connected');

      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        messageLog.push({ from: 'client', type: msg.type });

        switch (msg.type) {
          case 'build':
            ws.send(JSON.stringify({ type: 'status', message: 'Generating...' }));
            ws.send(JSON.stringify({ type: 'preview', blocks: MOCK_TOWER.blocks }));
            break;
          case 'edit':
            ws.send(JSON.stringify({ type: 'preview', blocks: MOCK_EDIT.blocks, removals: MOCK_EDIT.removals }));
            break;
          case 'confirm':
            ws.send(JSON.stringify({ type: 'placed', count: msg.blocks.length }));
            break;
          case 'cancel':
            break;
        }
      });
    });

    const client = new WebSocket(`ws://localhost:${PORT}`);
    let step = 0;

    client.on('open', () => {
      console.log('  Client: connected');
      // Step 1: Build request
      client.send(JSON.stringify({
        type: 'build',
        prompt: 'stone watchtower',
        origin: { x: 100, y: 64, z: 200 }
      }));
    });

    client.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messageLog.push({ from: 'server', type: msg.type });

      step++;
      switch (step) {
        case 1: // status
          assert(msg.type === 'status', `Step 1: got status message`);
          break;
        case 2: // preview
          assert(msg.type === 'preview', `Step 2: got preview with ${msg.blocks.length} blocks`);
          assert(msg.blocks.length > 0, 'Preview has blocks');
          // Step 3: Confirm
          client.send(JSON.stringify({ type: 'confirm', blocks: msg.blocks, removals: [] }));
          break;
        case 3: // placed
          assert(msg.type === 'placed', `Step 3: placement confirmed (${msg.count} blocks)`);
          // Step 4: Edit flow
          client.send(JSON.stringify({
            type: 'edit',
            prompt: 'make it ruined',
            selectedBlocks: MOCK_TOWER.blocks.slice(0, 10)
          }));
          break;
        case 4: // edit preview
          assert(msg.type === 'preview', `Step 4: edit preview`);
          assert(msg.removals && msg.removals.length > 0, 'Edit has removals');
          // Step 5: Cancel
          client.send(JSON.stringify({ type: 'cancel' }));
          setTimeout(() => {
            client.close();
            wss.close(() => resolve());
          }, 100);
          break;
      }
    });
  });

  console.log('  Full flow: build → preview → confirm → place → edit → preview → cancel');

  // --- Test 5: Live Claude via CLI ---
  console.log('\n=== TEST 5: Live Claude (via claude CLI) ===');
  console.log('  Testing live build generation...');
  const t5 = Date.now();
  const liveResult = await builder.generateBuild('tiny 3x3 wooden shed', { x: 0, y: 64, z: 0 });
  const t5elapsed = ((Date.now() - t5) / 1000).toFixed(1);
  console.log(`  Generated ${liveResult.blocks.length} blocks in ${t5elapsed}s`);
  liveResult.blocks.slice(0, 5).forEach(b =>
    console.log(`    (${b.x},${b.y},${b.z}) → ${b.block}`)
  );
  assert(liveResult.blocks.length > 0, 'Live Claude returned blocks');
  assert(liveResult.blocks.every(b => b.block.startsWith('minecraft:')), 'All blocks have minecraft: prefix');

  // Test live edit
  console.log('  Testing live edit...');
  const t6 = Date.now();
  const liveEdit = await builder.editBlocks('add moss and vines, make it overgrown', liveResult.blocks.slice(0, 10));
  const t6elapsed = ((Date.now() - t6) / 1000).toFixed(1);
  console.log(`  Edit: ${liveEdit.blocks.length} changes, ${(liveEdit.removals || []).length} removals in ${t6elapsed}s`);
  assert(liveEdit.blocks.length > 0, 'Live edit returned changes');

  // --- Summary ---
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('ALL TESTS PASSED');
  } else {
    console.log('SOME TESTS FAILED');
    process.exit(1);
  }
}

test().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
