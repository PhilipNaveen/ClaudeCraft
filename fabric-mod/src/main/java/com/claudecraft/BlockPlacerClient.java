package com.claudecraft;

import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Places blocks via /setblock. Cancellable, fast, shows progress.
 */
public class BlockPlacerClient {

    private static final int BLOCKS_PER_BATCH = 20; // commands per tick (much faster)
    private static final long BATCH_DELAY_MS = 50;   // ms between batches
    private volatile Thread placementThread = null;
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    public boolean isPlacing() {
        return placementThread != null && placementThread.isAlive();
    }

    public void cancel() {
        cancelled.set(true);
        if (placementThread != null) {
            placementThread.interrupt();
            placementThread = null;
        }
    }

    public void placeBlocks(List<GhostRenderer.PreviewBlock> blocks, List<GhostRenderer.Removal> removals) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null) return;

        // Cancel any existing placement
        cancel();
        cancelled.set(false);

        // Build sorted command list: removals first, then placements bottom-up
        List<String> commands = new ArrayList<>();

        for (var rem : removals) {
            commands.add(String.format("setblock %d %d %d air", rem.x(), rem.y(), rem.z()));
        }

        var sorted = blocks.stream()
            .sorted(Comparator.comparingInt(GhostRenderer.PreviewBlock::y)
                .thenComparingInt(GhostRenderer.PreviewBlock::z)
                .thenComparingInt(GhostRenderer.PreviewBlock::x))
            .toList();

        for (var block : sorted) {
            String blockId = block.block().startsWith("minecraft:") ? block.block() : "minecraft:" + block.block();
            commands.add(String.format("setblock %d %d %d %s", block.x(), block.y(), block.z(), blockId));
        }

        int total = commands.size();

        // Run placement on a background thread
        placementThread = new Thread(() -> {
            int placed = 0;

            for (int i = 0; i < commands.size(); i += BLOCKS_PER_BATCH) {
                if (cancelled.get() || Thread.currentThread().isInterrupted()) {
                    int finalPlaced = placed;
                    client.execute(() -> {
                        ClaudeCraftMod.setStatus("§cPlacement cancelled at " + finalPlaced + "/" + total, 3000);
                        ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.NONE;
                    });
                    return;
                }

                int end = Math.min(i + BLOCKS_PER_BATCH, commands.size());
                List<String> batch = commands.subList(i, end);

                // Send batch on render thread
                client.execute(() -> {
                    if (client.getNetworkHandler() == null) return;
                    for (String cmd : batch) {
                        client.getNetworkHandler().sendCommand(cmd);
                    }
                });

                placed += batch.size();
                int pct = (placed * 100) / total;
                int finalPlaced = placed;
                client.execute(() -> {
                    ClaudeCraftMod.setStatus("§bPlacing... " + finalPlaced + "/" + total + " (" + pct + "%)", 2000);
                });

                try {
                    Thread.sleep(BATCH_DELAY_MS);
                } catch (InterruptedException e) {
                    int interruptedAt = finalPlaced;
                    client.execute(() -> {
                        ClaudeCraftMod.setStatus("§cPlacement cancelled at " + interruptedAt + "/" + total, 3000);
                        ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.NONE;
                    });
                    return;
                }
            }

            client.execute(() -> {
                ClaudeCraftMod.setStatus("§a✓ Placed " + total + " blocks!", 3000);
                ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.NONE;
            });
        });

        placementThread.setDaemon(true);
        placementThread.start();
    }
}
