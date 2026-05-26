import { Vec3 } from 'vec3';

export class BlockPlacer {
  constructor(bot) {
    this.bot = bot;
    this.placementDelay = 50; // ms between placements — visible but fast
  }

  async placeBlocks(blocks, removals = []) {
    // First handle removals (set to air)
    for (const rem of removals) {
      try {
        await this.bot.creative.setBlock(
          new Vec3(rem.x, rem.y, rem.z),
          this._getBlockId('minecraft:air')
        );
        await this._delay(this.placementDelay);
      } catch (err) {
        console.warn(`[Placer] Failed to remove block at ${rem.x},${rem.y},${rem.z}: ${err.message}`);
      }
    }

    // Sort blocks bottom-up for natural building look
    const sorted = [...blocks].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      if (a.z !== b.z) return a.z - b.z;
      return a.x - b.x;
    });

    let placed = 0;
    for (const block of sorted) {
      try {
        const blockName = block.block.startsWith('minecraft:')
          ? block.block
          : `minecraft:${block.block}`;

        // Use creative mode setBlock
        const mcData = this.bot.registry;
        const blockData = mcData.blocksByName[blockName.replace('minecraft:', '')];

        if (!blockData) {
          console.warn(`[Placer] Unknown block: ${blockName}, using stone`);
          const stone = mcData.blocksByName['stone'];
          await this.bot.creative.setBlock(new Vec3(block.x, block.y, block.z), stone);
        } else {
          await this.bot.creative.setBlock(new Vec3(block.x, block.y, block.z), blockData);
        }

        placed++;
        await this._delay(this.placementDelay);
      } catch (err) {
        console.warn(`[Placer] Failed to place ${block.block} at ${block.x},${block.y},${block.z}: ${err.message}`);
      }
    }

    console.log(`[Placer] Placed ${placed}/${blocks.length} blocks`);
    return placed;
  }

  _getBlockId(name) {
    const mcData = this.bot.registry;
    const clean = name.replace('minecraft:', '');
    return mcData.blocksByName[clean] || mcData.blocksByName['air'];
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
