package com.claudecraft;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.network.ClientPlayerEntity;
import net.minecraft.text.Text;

import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Places blocks by sending /setblock commands client-side.
 * Works with any MC version, requires cheats enabled.
 */
public class BlockPlacerClient {

    private static final int BLOCKS_PER_TICK = 5; // commands per batch
    private static final long BATCH_DELAY_MS = 100; // ms between batches
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    public void placeBlocks(List<GhostRenderer.PreviewBlock> blocks, List<GhostRenderer.Removal> removals) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null) return;

        // Build command queue: removals first, then placements (bottom-up)
        var sorted = blocks.stream()
            .sorted((a, b) -> {
                if (a.y() != b.y()) return Integer.compare(a.y(), b.y());
                if (a.z() != b.z()) return Integer.compare(a.z(), b.z());
                return Integer.compare(a.x(), b.x());
            })
            .toList();

        int totalOps = removals.size() + sorted.size();
        int[] progress = {0};

        // Schedule removals
        for (int i = 0; i < removals.size(); i++) {
            var rem = removals.get(i);
            long delay = (i / BLOCKS_PER_TICK) * BATCH_DELAY_MS;
            scheduler.schedule(() -> {
                client.execute(() -> {
                    sendCommand(client, String.format("/setblock %d %d %d air", rem.x(), rem.y(), rem.z()));
                    progress[0]++;
                });
            }, delay, TimeUnit.MILLISECONDS);
        }

        // Schedule placements after removals
        long removalTime = ((removals.size() / BLOCKS_PER_TICK) + 1) * BATCH_DELAY_MS;
        for (int i = 0; i < sorted.size(); i++) {
            var block = sorted.get(i);
            long delay = removalTime + (i / BLOCKS_PER_TICK) * BATCH_DELAY_MS;
            scheduler.schedule(() -> {
                client.execute(() -> {
                    String blockId = block.block().startsWith("minecraft:") ? block.block() : "minecraft:" + block.block();
                    sendCommand(client, String.format("/setblock %d %d %d %s", block.x(), block.y(), block.z(), blockId));
                    progress[0]++;
                    if (progress[0] == totalOps) {
                        client.player.sendMessage(Text.literal("§a[ClaudeCraft] Done! Placed " + totalOps + " blocks."), true);
                    }
                });
            }, delay, TimeUnit.MILLISECONDS);
        }
    }

    private void sendCommand(MinecraftClient client, String command) {
        if (client.getNetworkHandler() != null) {
            // Remove leading slash for sendCommand
            String cmd = command.startsWith("/") ? command.substring(1) : command;
            client.getNetworkHandler().sendCommand(cmd);
        }
    }
}
