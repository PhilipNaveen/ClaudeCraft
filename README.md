# ClaudeCraft

ClaudeCraft is basically Claude Code but for Minecraft. You press B, type what you want to build, and watch it happen block by block in front of you. It plans the build, generates each layer, critiques its own work, fixes mistakes, and lets you move/rotate the whole thing before placing it. You can also select existing blocks and reprompt to edit them — same iterative loop you'd use prompting code changes, but with blocks instead of files.

## How it works

![Planning phase](images/1.png)

The AI plans your build — picking materials, dimensions, and breaking it into layers.

![Layers generating](images/2.png)

Blocks appear layer by layer as each piece generates. Chat shows progress like a build log.

![Ghost preview](images/3.png)

Full ghost preview. Green = new blocks. Arrow keys to slide it around, R to rotate, PgUp/PgDn to adjust height.

![Placed build](images/4.png)

Hit Enter and it places. Every block goes down via /setblock.

![Edit mode](images/5.png)

Select blocks with V (click) or G (volume), press B, describe changes. Same loop — preview, adjust, confirm.

## Setup

**Agent server** (runs on any machine with Claude Code installed):
```bash
cd agent-server
npm install
node src/index.js
```

**Fabric mod** (Minecraft 1.21.5):
```bash
cd fabric-mod
./gradlew build
# copy build/libs/claudecraft-1.0.0.jar to .minecraft/mods/
# also need Fabric API for 1.21.5 in mods/
```

**Controls**: B = build/edit, V = click select, G = volume select, R = rotate, Arrow keys = move, PgUp/PgDn = height, Enter = place, Esc = cancel

## Remote setup (SSH)

If the agent server is on a remote machine:
```bash
ssh -L 3001:localhost:3001 user@remote-host
```
The mod connects to `ws://localhost:3001` so the tunnel makes it seamless.
