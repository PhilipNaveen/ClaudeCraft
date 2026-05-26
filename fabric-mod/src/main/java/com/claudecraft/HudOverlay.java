package com.claudecraft;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.render.RenderTickCounter;

/**
 * Fortnite-style HUD overlay showing current mode, controls, and build status.
 */
public class HudOverlay {

    public static void render(DrawContext context, RenderTickCounter tickCounter) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player == null || client.currentScreen != null) return;

        TextRenderer font = client.textRenderer;
        int screenW = client.getWindow().getScaledWidth();
        int screenH = client.getWindow().getScaledHeight();

        ClaudeCraftMod.Mode mode = ClaudeCraftMod.currentMode;

        // Status message (fading)
        if (System.currentTimeMillis() < ClaudeCraftMod.statusTime) {
            String status = ClaudeCraftMod.statusMessage;
            int sw = font.getWidth(status);
            context.drawTextWithShadow(font, status, (screenW - sw) / 2, screenH / 2 + 20, 0xFFFFFF);
        }

        // Mode-specific HUD
        if (mode == ClaudeCraftMod.Mode.NONE) return;

        int y = 6;
        int x = 6;
        int bgColor = 0x88000000;

        switch (mode) {
            case SELECTING -> {
                int count = ClaudeCraftMod.selection.getSelectedPositions().size();
                drawBar(context, font, x, y, screenW,
                    "§e EDIT MODE §r— " + count + " blocks selected",
                    "§7[V] Select  [G] Volume  [B] Edit  [Esc] Cancel");
            }
            case VOLUME_SECOND -> {
                drawBar(context, font, x, y, screenW,
                    "§e VOLUME SELECT",
                    "§7Press [G] on second corner");
            }
            case GENERATING -> {
                drawBar(context, font, x, y, screenW,
                    "§b⟳ GENERATING...",
                    "§7AI is building — blocks appear as they're ready");
            }
            case PREVIEWING -> {
                int blocks = ClaudeCraftMod.ghostRenderer.getPreviewBlocks().size();
                int removals = ClaudeCraftMod.ghostRenderer.getRemovals().size();
                String info = "§a " + blocks + " blocks";
                if (removals > 0) info += " §c" + removals + " removals";

                drawBar(context, font, x, y, screenW,
                    "§a PREVIEW" + info,
                    "§7[R] Rotate  [Arrows] Move  [PgUp/Dn] Height  [Enter] Place  [Esc] Cancel");
            }
            default -> {}
        }
    }

    private static void drawBar(DrawContext context, TextRenderer font, int x, int y, int screenW,
                                 String line1, String line2) {
        // Semi-transparent background bar
        context.fill(0, 0, screenW, 24, 0x88000000);
        context.drawTextWithShadow(font, line1, x, y, 0xFFFFFF);
        context.drawTextWithShadow(font, line2, x, y + 10, 0xAAAAAA);
    }
}
