package com.claudecraft;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.HudRenderCallback;
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
    private static KeyBinding buildKey;     // B — open prompt
    private static KeyBinding selectKey;    // V — click-select block
    private static KeyBinding confirmKey;   // Enter — place it
    private static KeyBinding cancelKey;    // Esc — cancel
    private static KeyBinding rotateKey;    // R — rotate 90°
    private static KeyBinding volumeKey;    // G — volume select
    private static KeyBinding nudgeUpKey;   // Page Up — move preview up
    private static KeyBinding nudgeDownKey; // Page Down — move preview down

    // State
    public static SelectionManager selection = new SelectionManager();
    public static GhostRenderer ghostRenderer = new GhostRenderer();
    public static AgentConnection agent = new AgentConnection();
    public static BlockPlacerClient placer = new BlockPlacerClient();
    public static Mode currentMode = Mode.NONE;
    public static String statusMessage = "";
    public static long statusTime = 0;

    public enum Mode {
        NONE,
        SELECTING,       // Click-selecting blocks
        VOLUME_FIRST,    // Waiting for first corner
        VOLUME_SECOND,   // Waiting for second corner
        PROMPTING,       // Typing prompt
        GENERATING,      // Waiting for AI
        PREVIEWING       // Ghost preview visible — Fortnite mode
    }

    @Override
    public void onInitializeClient() {
        buildKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Build / Edit", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_B, "ClaudeCraft"
        ));
        selectKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Click Select", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_V, "ClaudeCraft"
        ));
        confirmKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Confirm Place", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_ENTER, "ClaudeCraft"
        ));
        cancelKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Cancel", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_ESCAPE, "ClaudeCraft"
        ));
        rotateKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Rotate 90°", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_R, "ClaudeCraft"
        ));
        volumeKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Volume Select", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_G, "ClaudeCraft"
        ));
        nudgeUpKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Move Up", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_PAGE_UP, "ClaudeCraft"
        ));
        nudgeDownKey = KeyBindingHelper.registerKeyBinding(new KeyBinding(
            "Move Down", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_PAGE_DOWN, "ClaudeCraft"
        ));

        agent.connect("ws://localhost:3001");

        ClientTickEvents.END_CLIENT_TICK.register(this::onTick);
        WorldRenderEvents.AFTER_TRANSLUCENT.register(ghostRenderer::render);
        HudRenderCallback.EVENT.register(HudOverlay::render);

        System.out.println("[ClaudeCraft] Initialized — B=build, V=select, G=volume, R=rotate, PgUp/PgDn=nudge, Enter=place, Esc=cancel");
    }

    private void onTick(MinecraftClient client) {
        if (client.player == null || client.currentScreen != null) return;

        // ---- BUILD / EDIT PROMPT ----
        if (buildKey.wasPressed()) {
            if (currentMode == Mode.NONE || currentMode == Mode.SELECTING) {
                boolean isBuild = !selection.hasSelection();
                currentMode = Mode.PROMPTING;
                client.setScreen(new PromptScreen(isBuild));
            }
        }

        // ---- CLICK SELECT ----
        if (selectKey.wasPressed()) {
            HitResult hit = client.crosshairTarget;
            if (hit != null && hit.getType() == HitResult.Type.BLOCK) {
                BlockPos pos = ((BlockHitResult) hit).getBlockPos();
                var state = client.world.getBlockState(pos);
                if (!state.isAir()) {
                    boolean added = selection.toggleBlock(pos, state);
                    setStatus(added ? "§a+ Selected" : "§c- Deselected", 1500);
                    currentMode = selection.hasSelection() ? Mode.SELECTING : Mode.NONE;
                }
            }
        }

        // ---- VOLUME SELECT ----
        if (volumeKey.wasPressed()) {
            HitResult hit = client.crosshairTarget;
            if (hit != null && hit.getType() == HitResult.Type.BLOCK) {
                BlockPos pos = ((BlockHitResult) hit).getBlockPos();
                if (currentMode != Mode.VOLUME_SECOND) {
                    selection.setVolumeCorner1(pos);
                    currentMode = Mode.VOLUME_SECOND;
                    setStatus("§eCorner 1 set — G on corner 2", 5000);
                } else {
                    int count = selection.fillVolume(pos, client.world);
                    currentMode = Mode.SELECTING;
                    setStatus("§a" + count + " blocks selected", 2000);
                }
            }
        }

        // ---- PREVIEW MODE (Fortnite-style) ----
        if (currentMode == Mode.PREVIEWING) {
            // R — Rotate 90°
            if (rotateKey.wasPressed()) {
                ghostRenderer.rotate90();
                setStatus("§bRotated 90°", 1000);
            }

            // Page Up / Page Down — Nudge vertically
            if (nudgeUpKey.wasPressed()) {
                ghostRenderer.nudge(0, 1, 0);
                setStatus("§b▲ Up", 500);
            }
            if (nudgeDownKey.wasPressed()) {
                ghostRenderer.nudge(0, -1, 0);
                setStatus("§b▼ Down", 500);
            }

            // WASD nudge (using raw key checks for snappy feel)
            long window = client.getWindow().getHandle();
            if (GLFW.glfwGetKey(window, GLFW.GLFW_KEY_UP) == GLFW.GLFW_PRESS && canNudge()) {
                ghostRenderer.nudge(0, 0, -1);
                lastNudge = System.currentTimeMillis();
            }
            if (GLFW.glfwGetKey(window, GLFW.GLFW_KEY_DOWN) == GLFW.GLFW_PRESS && canNudge()) {
                ghostRenderer.nudge(0, 0, 1);
                lastNudge = System.currentTimeMillis();
            }
            if (GLFW.glfwGetKey(window, GLFW.GLFW_KEY_LEFT) == GLFW.GLFW_PRESS && canNudge()) {
                ghostRenderer.nudge(-1, 0, 0);
                lastNudge = System.currentTimeMillis();
            }
            if (GLFW.glfwGetKey(window, GLFW.GLFW_KEY_RIGHT) == GLFW.GLFW_PRESS && canNudge()) {
                ghostRenderer.nudge(1, 0, 0);
                lastNudge = System.currentTimeMillis();
            }

            // Enter — Confirm and place
            if (confirmKey.wasPressed()) {
                int count = ghostRenderer.getPreviewBlocks().size();
                placer.placeBlocks(ghostRenderer.getPreviewBlocks(), ghostRenderer.getRemovals());
                ghostRenderer.clear();
                selection.clear();
                currentMode = Mode.NONE;
                setStatus("§aPlacing " + count + " blocks!", 3000);
            }

            // Esc — Cancel
            if (cancelKey.wasPressed()) {
                ghostRenderer.clear();
                selection.clear();
                currentMode = Mode.NONE;
                setStatus("§cCancelled", 1500);
            }
        }

        // ---- CANCEL DURING GENERATION ----
        if (currentMode == Mode.GENERATING && cancelKey.wasPressed()) {
            agent.sendCancel();
            ghostRenderer.clear();
            currentMode = Mode.NONE;
            setStatus("§cBuild cancelled", 2000);
        }
    }

    // ---- Nudge rate limiting (150ms between nudges for smooth feel) ----
    private static long lastNudge = 0;
    private static boolean canNudge() {
        return System.currentTimeMillis() - lastNudge > 150;
    }

    public static void setStatus(String msg, long durationMs) {
        statusMessage = msg;
        statusTime = System.currentTimeMillis() + durationMs;
    }
}
