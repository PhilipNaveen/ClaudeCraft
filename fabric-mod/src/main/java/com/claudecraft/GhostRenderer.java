package com.claudecraft;

import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderContext;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.*;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.BlockPos;
import net.minecraft.util.math.Vec3d;
import org.joml.Matrix4f;

import java.util.*;

public class GhostRenderer {

    public record PreviewBlock(int x, int y, int z, String block) {}
    public record Removal(int x, int y, int z) {}

    private volatile List<PreviewBlock> previewBlocks = new java.util.concurrent.CopyOnWriteArrayList<>();
    private volatile List<Removal> removals = new java.util.concurrent.CopyOnWriteArrayList<>();
    private int rotationSteps = 0;
    private BlockPos rotationCenter = null;

    public void setPreview(List<PreviewBlock> blocks, List<Removal> rems) {
        this.previewBlocks = new java.util.concurrent.CopyOnWriteArrayList<>(blocks);
        this.removals = rems != null ? new java.util.concurrent.CopyOnWriteArrayList<>(rems) : new java.util.concurrent.CopyOnWriteArrayList<>();
        this.rotationSteps = 0;

        if (!blocks.isEmpty()) {
            int cx = 0, cz = 0;
            for (var b : blocks) { cx += b.x; cz += b.z; }
            cx /= blocks.size();
            cz /= blocks.size();
            rotationCenter = new BlockPos(cx, 0, cz);
        }
    }

    /**
     * Add blocks incrementally (streaming from server).
     */
    public void addBlocks(List<PreviewBlock> newBlocks) {
        this.previewBlocks.addAll(newBlocks);
    }

    /**
     * Nudge entire preview by offset. Fortnite-style repositioning.
     */
    public void nudge(int dx, int dy, int dz) {
        if (previewBlocks.isEmpty()) return;
        var moved = new java.util.concurrent.CopyOnWriteArrayList<PreviewBlock>();
        for (var b : previewBlocks) {
            moved.add(new PreviewBlock(b.x + dx, b.y + dy, b.z + dz, b.block));
        }
        previewBlocks = moved;

        var movedRem = new java.util.concurrent.CopyOnWriteArrayList<Removal>();
        for (var r : removals) {
            movedRem.add(new Removal(r.x + dx, r.y + dy, r.z + dz));
        }
        removals = movedRem;

        if (rotationCenter != null) {
            rotationCenter = rotationCenter.add(dx, dy, dz);
        }
    }

    public void rotate90() {
        if (rotationCenter == null || previewBlocks.isEmpty()) return;
        rotationSteps = (rotationSteps + 1) % 4;

        int cx = rotationCenter.getX();
        int cz = rotationCenter.getZ();

        var rotated = new java.util.concurrent.CopyOnWriteArrayList<PreviewBlock>();
        for (var b : previewBlocks) {
            int dx = b.x - cx;
            int dz = b.z - cz;
            rotated.add(new PreviewBlock(cx - dz, b.y, cz + dx, b.block));
        }
        previewBlocks = rotated;

        var rotatedRem = new java.util.concurrent.CopyOnWriteArrayList<Removal>();
        for (var r : removals) {
            int dx = r.x - cx;
            int dz = r.z - cz;
            rotatedRem.add(new Removal(cx - dz, r.y, cz + dx));
        }
        removals = rotatedRem;
    }

    public List<PreviewBlock> getPreviewBlocks() { return previewBlocks; }
    public List<Removal> getRemovals() { return removals; }

    public void clear() {
        previewBlocks.clear();
        removals.clear();
        rotationSteps = 0;
        rotationCenter = null;
    }

    public void render(WorldRenderContext context) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.world == null) return;

        Vec3d cam = context.camera().getPos();
        var matrices = context.matrixStack();
        if (matrices == null) return;

        VertexConsumerProvider.Immediate immediate = client.getBufferBuilders().getEntityVertexConsumers();

        matrices.push();
        matrices.translate(-cam.x, -cam.y, -cam.z);

        // Phase 1: Draw all filled blocks first
        for (PreviewBlock pb : previewBlocks) {
            BlockPos pos = new BlockPos(pb.x, pb.y, pb.z);
            drawBlockFilled(matrices, immediate, pos, 0.2f, 0.8f, 0.2f, 0.3f);
        }
        for (Removal rem : removals) {
            BlockPos pos = new BlockPos(rem.x, rem.y, rem.z);
            drawBlockFilled(matrices, immediate, pos, 0.8f, 0.2f, 0.2f, 0.3f);
        }

        // Phase 2: Draw all outlines (single buffer type, no interleaving)
        VertexConsumer lineConsumer = immediate.getBuffer(RenderLayer.LINES);
        for (BlockPos pos : ClaudeCraftMod.selection.getSelectedPositions()) {
            drawBlockOutline(matrices, lineConsumer, pos, 1.0f, 1.0f, 0.0f, 0.8f);
        }
        for (PreviewBlock pb : previewBlocks) {
            BlockPos pos = new BlockPos(pb.x, pb.y, pb.z);
            drawBlockOutline(matrices, lineConsumer, pos, 0.2f, 1.0f, 0.2f, 0.6f);
        }
        for (Removal rem : removals) {
            BlockPos pos = new BlockPos(rem.x, rem.y, rem.z);
            drawBlockOutline(matrices, lineConsumer, pos, 1.0f, 0.2f, 0.2f, 0.6f);
        }

        matrices.pop();
        immediate.draw();
    }

    private void drawBlockOutline(MatrixStack matrices, VertexConsumer consumer, BlockPos pos,
                                   float r, float g, float b, float a) {
        Matrix4f matrix = matrices.peek().getPositionMatrix();
        float x0 = pos.getX();
        float y0 = pos.getY();
        float z0 = pos.getZ();
        float x1 = x0 + 1;
        float y1 = y0 + 1;
        float z1 = z0 + 1;

        var entry = matrices.peek();

        // Bottom
        line(consumer, matrix, entry, x0, y0, z0, x1, y0, z0, r, g, b, a);
        line(consumer, matrix, entry, x1, y0, z0, x1, y0, z1, r, g, b, a);
        line(consumer, matrix, entry, x1, y0, z1, x0, y0, z1, r, g, b, a);
        line(consumer, matrix, entry, x0, y0, z1, x0, y0, z0, r, g, b, a);
        // Top
        line(consumer, matrix, entry, x0, y1, z0, x1, y1, z0, r, g, b, a);
        line(consumer, matrix, entry, x1, y1, z0, x1, y1, z1, r, g, b, a);
        line(consumer, matrix, entry, x1, y1, z1, x0, y1, z1, r, g, b, a);
        line(consumer, matrix, entry, x0, y1, z1, x0, y1, z0, r, g, b, a);
        // Verticals
        line(consumer, matrix, entry, x0, y0, z0, x0, y1, z0, r, g, b, a);
        line(consumer, matrix, entry, x1, y0, z0, x1, y1, z0, r, g, b, a);
        line(consumer, matrix, entry, x1, y0, z1, x1, y1, z1, r, g, b, a);
        line(consumer, matrix, entry, x0, y0, z1, x0, y1, z1, r, g, b, a);
    }

    private void line(VertexConsumer consumer, Matrix4f matrix, MatrixStack.Entry entry,
                      float x0, float y0, float z0, float x1, float y1, float z1,
                      float r, float g, float b, float a) {
        float nx = x1 - x0;
        float ny = y1 - y0;
        float nz = z1 - z0;
        float len = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 0) { nx /= len; ny /= len; nz /= len; }
        consumer.vertex(matrix, x0, y0, z0).color(r, g, b, a).normal(entry, nx, ny, nz);
        consumer.vertex(matrix, x1, y1, z1).color(r, g, b, a).normal(entry, nx, ny, nz);
    }

    private void drawBlockFilled(MatrixStack matrices, VertexConsumerProvider.Immediate immediate,
                                  BlockPos pos, float r, float g, float b, float a) {
        VertexConsumer consumer = immediate.getBuffer(RenderLayer.getDebugFilledBox());
        Matrix4f matrix = matrices.peek().getPositionMatrix();
        float x0 = pos.getX() + 0.01f;
        float y0 = pos.getY() + 0.01f;
        float z0 = pos.getZ() + 0.01f;
        float x1 = pos.getX() + 0.99f;
        float y1 = pos.getY() + 0.99f;
        float z1 = pos.getZ() + 0.99f;

        // Bottom
        consumer.vertex(matrix, x0, y0, z0).color(r, g, b, a);
        consumer.vertex(matrix, x1, y0, z0).color(r, g, b, a);
        consumer.vertex(matrix, x1, y0, z1).color(r, g, b, a);
        consumer.vertex(matrix, x0, y0, z1).color(r, g, b, a);
        // Top
        consumer.vertex(matrix, x0, y1, z0).color(r, g, b, a);
        consumer.vertex(matrix, x0, y1, z1).color(r, g, b, a);
        consumer.vertex(matrix, x1, y1, z1).color(r, g, b, a);
        consumer.vertex(matrix, x1, y1, z0).color(r, g, b, a);
        // North (z=0)
        consumer.vertex(matrix, x0, y0, z0).color(r, g, b, a);
        consumer.vertex(matrix, x0, y1, z0).color(r, g, b, a);
        consumer.vertex(matrix, x1, y1, z0).color(r, g, b, a);
        consumer.vertex(matrix, x1, y0, z0).color(r, g, b, a);
        // South (z=1)
        consumer.vertex(matrix, x0, y0, z1).color(r, g, b, a);
        consumer.vertex(matrix, x1, y0, z1).color(r, g, b, a);
        consumer.vertex(matrix, x1, y1, z1).color(r, g, b, a);
        consumer.vertex(matrix, x0, y1, z1).color(r, g, b, a);
        // West (x=0)
        consumer.vertex(matrix, x0, y0, z0).color(r, g, b, a);
        consumer.vertex(matrix, x0, y0, z1).color(r, g, b, a);
        consumer.vertex(matrix, x0, y1, z1).color(r, g, b, a);
        consumer.vertex(matrix, x0, y1, z0).color(r, g, b, a);
        // East (x=1)
        consumer.vertex(matrix, x1, y0, z0).color(r, g, b, a);
        consumer.vertex(matrix, x1, y1, z0).color(r, g, b, a);
        consumer.vertex(matrix, x1, y1, z1).color(r, g, b, a);
        consumer.vertex(matrix, x1, y0, z1).color(r, g, b, a);
    }
}
