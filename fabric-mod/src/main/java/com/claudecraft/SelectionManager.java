package com.claudecraft;

import net.minecraft.block.BlockState;
import net.minecraft.util.math.BlockPos;
import net.minecraft.world.World;

import java.util.*;

public class SelectionManager {

    public record SelectedBlock(BlockPos pos, String blockId) {}

    private final Map<BlockPos, String> selected = new LinkedHashMap<>();
    private BlockPos volumeCorner1 = null;

    /**
     * Toggle a block in/out of the selection.
     * Returns true if added, false if removed.
     */
    public boolean toggleBlock(BlockPos pos, BlockState state) {
        BlockPos immutable = pos.toImmutable();
        if (selected.containsKey(immutable)) {
            selected.remove(immutable);
            return false;
        } else {
            String id = state.getBlock().toString(); // e.g. "Block{minecraft:stone}"
            // Extract just the ID
            id = id.replaceAll("Block\\{(.+)}", "$1");
            selected.put(immutable, id);
            return true;
        }
    }

    public void setVolumeCorner1(BlockPos pos) {
        this.volumeCorner1 = pos.toImmutable();
    }

    /**
     * Fill selection with all non-air blocks in the volume between corner1 and pos.
     */
    public int fillVolume(BlockPos corner2, World world) {
        if (volumeCorner1 == null) return 0;

        selected.clear();
        int minX = Math.min(volumeCorner1.getX(), corner2.getX());
        int minY = Math.min(volumeCorner1.getY(), corner2.getY());
        int minZ = Math.min(volumeCorner1.getZ(), corner2.getZ());
        int maxX = Math.max(volumeCorner1.getX(), corner2.getX());
        int maxY = Math.max(volumeCorner1.getY(), corner2.getY());
        int maxZ = Math.max(volumeCorner1.getZ(), corner2.getZ());

        for (int x = minX; x <= maxX; x++) {
            for (int y = minY; y <= maxY; y++) {
                for (int z = minZ; z <= maxZ; z++) {
                    BlockPos p = new BlockPos(x, y, z);
                    BlockState state = world.getBlockState(p);
                    if (!state.isAir()) {
                        String id = state.getBlock().toString().replaceAll("Block\\{(.+)}", "$1");
                        selected.put(p.toImmutable(), id);
                    }
                }
            }
        }

        volumeCorner1 = null;
        return selected.size();
    }

    public boolean hasSelection() {
        return !selected.isEmpty();
    }

    public void clear() {
        selected.clear();
        volumeCorner1 = null;
    }

    public Set<BlockPos> getSelectedPositions() {
        return selected.keySet();
    }

    public List<SelectedBlock> getSelectedBlocks() {
        List<SelectedBlock> list = new ArrayList<>();
        for (var entry : selected.entrySet()) {
            list.add(new SelectedBlock(entry.getKey(), entry.getValue()));
        }
        return list;
    }
}
