package com.claudecraft;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.text.Text;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;
import net.minecraft.util.math.BlockPos;
import org.lwjgl.glfw.GLFW;

public class ClaudeCraftMod implements ClientModInitializer {

    // Keybinds
    private static KeyBinding buildKey;
    private static KeyBinding selectKey;
    private static KeyBinding confirmKey;
    private static KeyBinding cancelKey;
    private static KeyBinding rotateKey;
    private static KeyBinding volumeKey;

    // State
    public static SelectionManager selection = new SelectionManager();
    public static GhostRenderer ghostRenderer = new GhostRenderer();
    public static AgentConnection agent = new AgentConnection();
    public static BlockPlacerClient placer = new BlockPlacerClient();
    public static Mode currentMode = Mode.NONE;

    public enum Mode { NONE, SELECTING, VOLUME_FIRST, VOLUME_SECOND, PROMPTING, PREVIEWING }

    @Override
    public void onInitializeClient() {
        // Register keybinds
        buildKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Build (prompt)", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_B, "ClaudeCraft"
        ));
        selectKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Click Select", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_V, "ClaudeCraft"
        ));
        confirmKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Confirm", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_ENTER, "ClaudeCraft"
        ));
        cancelKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Cancel", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_ESCAPE, "ClaudeCraft"
        ));
        rotateKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Rotate Preview", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_R, "ClaudeCraft"
        ));
        volumeKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Volume Select", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_G, "ClaudeCraft"
        ));

        // Connect to agent server
        agent.connect("ws://localhost:3001");

        // Tick handler for keybinds
        ClientTickEvents.END_CLIENT_TICK.register(this::onTick);

        // World render handler for ghost blocks and selection highlights
        WorldRenderEvents.AFTER_TRANSLUCENT.register(ghostRenderer::render);

        System.out.println("[ClaudeCraft] Mod initialized! Keys: B=build, V=select, G=volume, R=rotate, Enter=confirm, Esc=cancel");
    }

    private void onTick(MinecraftClient client) {
        if (client.player == null) return;

        // B — Open build prompt
        if (buildKey.wasPressed()) {
            if (currentMode == Mode.NONE || currentMode == Mode.SELECTING) {
                if (selection.hasSelection()) {
                    // Edit mode — we have selected blocks
                    currentMode = Mode.PROMPTING;
                    client.setScreen(new PromptScreen(false));
                } else {
                    // Build mode — fresh build at crosshair
                    currentMode = Mode.PROMPTING;
                    client.setScreen(new PromptScreen(true));
                }
            }
        }

        // V — Click select (add block at crosshair to selection)
        if (selectKey.wasPressed()) {
            HitResult hit = client.crosshairTarget;
            if (hit != null && hit.getType() == HitResult.Type.BLOCK) {
                BlockHitResult blockHit = (BlockHitResult) hit;
                BlockPos pos = blockHit.getBlockPos();
                var state = client.world.getBlockState(pos);
                if (!state.isAir()) {
                    boolean added = selection.toggleBlock(pos, state);
                    String blockName = state.getBlock().getTranslationKey();
                    if (added) {
                        client.player.sendMessage(Text.literal("§a[+] Selected " + blockName + " at " + pos.toShortString()), true);
                    } else {
                        client.player.sendMessage(Text.literal("§c[-] Deselected " + pos.toShortString()), true);
                    }
                    currentMode = selection.hasSelection() ? Mode.SELECTING : Mode.NONE;
                }
            }
        }

        // G — Volume select (two-corner box)
        if (volumeKey.wasPressed()) {
            HitResult hit = client.crosshairTarget;
            if (hit != null && hit.getType() == HitResult.Type.BLOCK) {
                BlockPos pos = ((BlockHitResult) hit).getBlockPos();
                if (currentMode != Mode.VOLUME_SECOND) {
                    // First corner
                    selection.setVolumeCorner1(pos);
                    currentMode = Mode.VOLUME_SECOND;
                    client.player.sendMessage(Text.literal("§e[Volume] Corner 1: " + pos.toShortString() + " — press G on second corner"), true);
                } else {
                    // Second corner — fill selection
                    int count = selection.fillVolume(pos, client.world);
                    currentMode = Mode.SELECTING;
                    client.player.sendMessage(Text.literal("§a[Volume] Selected " + count + " blocks"), true);
                }
            }
        }

        // R — Rotate preview 90 degrees
        if (rotateKey.wasPressed() && currentMode == Mode.PREVIEWING) {
            ghostRenderer.rotate90();
            client.player.sendMessage(Text.literal("§b[Rotated]"), true);
        }

        // Enter — Confirm placement (client-side via /setblock)
        if (confirmKey.wasPressed() && currentMode == Mode.PREVIEWING) {
            placer.placeBlocks(ghostRenderer.getPreviewBlocks(), ghostRenderer.getRemovals());
            ghostRenderer.clear();
            selection.clear();
            currentMode = Mode.NONE;
            client.player.sendMessage(Text.literal("§a[Confirmed] Placing blocks..."), true);
        }

        // Esc — Cancel (handled in screen, but also here for preview mode)
        if (cancelKey.wasPressed() && currentMode == Mode.PREVIEWING) {
            ghostRenderer.clear();
            selection.clear();
            currentMode = Mode.NONE;
            client.player.sendMessage(Text.literal("§c[Cancelled]"), true);
        }
    }
}
