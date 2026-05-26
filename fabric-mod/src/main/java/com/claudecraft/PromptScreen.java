package com.claudecraft;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.text.Text;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.hit.HitResult;

public class PromptScreen extends Screen {

    private TextFieldWidget promptField;
    private final boolean isBuildMode;

    public PromptScreen(boolean isBuildMode) {
        super(Text.literal("ClaudeCraft"));
        this.isBuildMode = isBuildMode;
    }

    @Override
    protected void init() {
        int centerX = this.width / 2;
        int centerY = this.height / 2;

        // Prompt text field — wide, centered
        promptField = new TextFieldWidget(
            this.textRenderer,
            centerX - 200, centerY - 10,
            400, 20,
            Text.literal("Describe your build...")
        );
        promptField.setMaxLength(500);
        promptField.setFocused(true);
        this.addDrawableChild(promptField);

        // Submit button
        this.addDrawableChild(ButtonWidget.builder(Text.literal("Generate"), button -> {
            submit();
        }).dimensions(centerX - 50, centerY + 20, 100, 20).build());
    }

    private void submit() {
        String prompt = promptField.getText().trim();
        if (prompt.isEmpty()) return;

        MinecraftClient client = MinecraftClient.getInstance();

        if (isBuildMode) {
            // Get position from crosshair
            int x = 0, y = 64, z = 0;
            if (client.player != null) {
                // Place 3 blocks in front of player's look direction
                var pos = client.player.getBlockPos().offset(client.player.getHorizontalFacing(), 3);
                x = pos.getX();
                y = pos.getY();
                z = pos.getZ();
            }
            ClaudeCraftMod.agent.requestBuild(prompt, x, y, z);
        } else {
            // Edit mode — send selected blocks + prompt
            ClaudeCraftMod.agent.requestEdit(prompt, ClaudeCraftMod.selection.getSelectedBlocks());
        }

        client.setScreen(null); // Close prompt screen
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == 257) { // Enter
            submit();
            return true;
        }
        if (keyCode == 256) { // Escape
            ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.NONE;
            this.close();
            return true;
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        this.renderBackground(context, mouseX, mouseY, delta);

        String title = isBuildMode ? "Build Mode — Describe what to build:" : "Edit Mode — Describe the changes:";
        context.drawCenteredTextWithShadow(this.textRenderer, title, this.width / 2, this.height / 2 - 30, 0x55FFFF);

        if (!isBuildMode) {
            int count = ClaudeCraftMod.selection.getSelectedPositions().size();
            context.drawCenteredTextWithShadow(this.textRenderer, count + " blocks selected", this.width / 2, this.height / 2 - 45, 0xFFFF55);
        }

        super.render(context, mouseX, mouseY, delta);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}
