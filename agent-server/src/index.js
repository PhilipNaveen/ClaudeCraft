import { WebSocketServer } from 'ws';
import { ClaudeBuilder } from './claude-builder.js';

const PORT = 3001;

async function main() {
  console.log('[ClaudeCraft] Starting agent server...');

  const claude = new ClaudeBuilder();

  const wss = new WebSocketServer({ port: PORT });
  console.log(`[ClaudeCraft] WebSocket server on ws://localhost:${PORT}`);
  console.log('[ClaudeCraft] Waiting for mod to connect...');

  wss.on('connection', (ws) => {
    console.log('[ClaudeCraft] Fabric mod connected!');

    // Wire up streaming: as blocks are generated, send them to mod in real-time
    const onBlocks = (blocks) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'preview_add', blocks }));
      }
    };
    const onStatus = (message) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: 'status', message }));
      }
    };

    claude.on('blocks', onBlocks);
    claude.on('status', onStatus);

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        await handleMessage(msg, ws, claude);
      } catch (err) {
        console.error('[ClaudeCraft] Error:', err.message);
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
    });

    ws.on('close', () => {
      console.log('[ClaudeCraft] Fabric mod disconnected');
      claude.removeListener('blocks', onBlocks);
      claude.removeListener('status', onStatus);
    });
  });
}

async function handleMessage(msg, ws, claude) {
  switch (msg.type) {
    case 'build': {
      console.log(`[Mod] Build: "${msg.prompt}" at ${JSON.stringify(msg.origin)}`);

      // Clear any previous preview
      ws.send(JSON.stringify({ type: 'preview_clear' }));
      ws.send(JSON.stringify({ type: 'status', message: 'Planning build...' }));

      const result = await claude.generateBuild(msg.prompt, msg.origin);

      // Send final complete preview (in case streaming missed any)
      ws.send(JSON.stringify({ type: 'preview', blocks: result.blocks, origin: msg.origin }));
      break;
    }

    case 'edit': {
      console.log(`[Mod] Edit: "${msg.prompt}" on ${msg.selectedBlocks.length} blocks`);
      ws.send(JSON.stringify({ type: 'status', message: 'Generating edit...' }));

      const result = await claude.editBlocks(msg.prompt, msg.selectedBlocks);
      ws.send(JSON.stringify({
        type: 'preview',
        blocks: result.blocks,
        removals: result.removals || [],
        origin: msg.selectedBlocks[0]
      }));
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    }
  }
}

main().catch(console.error);
