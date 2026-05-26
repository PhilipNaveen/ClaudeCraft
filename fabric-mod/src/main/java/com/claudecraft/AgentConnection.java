package com.claudecraft;

import com.google.gson.*;
import net.minecraft.client.MinecraftClient;
import net.minecraft.text.Text;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

public class AgentConnection {

    private WebSocketClient ws;
    private boolean connected = false;
    private final Gson gson = new Gson();
    private String serverUrl;
    private Thread reconnectThread;

    public void connect(String url) {
        this.serverUrl = url;
        startReconnectLoop();
    }

    private void startReconnectLoop() {
        reconnectThread = new Thread(() -> {
            while (true) {
                if (!connected) {
                    try {
                        System.out.println("[ClaudeCraft] Attempting connection to " + serverUrl + "...");
                        ws = new WebSocketClient(new URI(serverUrl)) {
                            @Override
                            public void onOpen(ServerHandshake handshake) {
                                connected = true;
                                System.out.println("[ClaudeCraft] Connected to agent server!");
                                sendChat("§a[ClaudeCraft] Connected to AI agent!");
                            }

                            @Override
                            public void onMessage(String message) {
                                handleServerMessage(message);
                            }

                            @Override
                            public void onClose(int code, String reason, boolean remote) {
                                connected = false;
                                System.out.println("[ClaudeCraft] Disconnected: " + reason);
                                sendChat("§c[ClaudeCraft] Disconnected. Reconnecting...");
                            }

                            @Override
                            public void onError(Exception ex) {
                                System.err.println("[ClaudeCraft] Error: " + ex.getMessage());
                            }
                        };
                        ws.connectBlocking();
                    } catch (Exception e) {
                        System.err.println("[ClaudeCraft] Connection failed: " + e.getMessage());
                    }
                }
                try {
                    Thread.sleep(5000);
                } catch (InterruptedException e) {
                    break;
                }
            }
        });
        reconnectThread.setDaemon(true);
        reconnectThread.start();
    }

    public boolean isConnected() {
        return connected && ws != null && ws.isOpen();
    }

    public void requestBuild(String prompt, int x, int y, int z) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "build");
        msg.addProperty("prompt", prompt);
        JsonObject origin = new JsonObject();
        origin.addProperty("x", x);
        origin.addProperty("y", y);
        origin.addProperty("z", z);
        msg.add("origin", origin);
        send(msg);
    }

    public void requestEdit(String prompt, List<SelectionManager.SelectedBlock> blocks) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "edit");
        msg.addProperty("prompt", prompt);
        JsonArray arr = new JsonArray();
        for (var b : blocks) {
            JsonObject bj = new JsonObject();
            bj.addProperty("x", b.pos().getX());
            bj.addProperty("y", b.pos().getY());
            bj.addProperty("z", b.pos().getZ());
            bj.addProperty("block", b.blockId());
            arr.add(bj);
        }
        msg.add("selectedBlocks", arr);
        send(msg);
    }

    public void confirmPlacement(List<GhostRenderer.PreviewBlock> blocks, List<GhostRenderer.Removal> removals) {
        JsonObject msg = new JsonObject();
        msg.addProperty("type", "confirm");
        JsonArray bArr = new JsonArray();
        for (var b : blocks) {
            JsonObject bj = new JsonObject();
            bj.addProperty("x", b.x());
            bj.addProperty("y", b.y());
            bj.addProperty("z", b.z());
            bj.addProperty("block", b.block());
            bArr.add(bj);
        }
        msg.add("blocks", bArr);

        JsonArray rArr = new JsonArray();
        for (var r : removals) {
            JsonObject rj = new JsonObject();
            rj.addProperty("x", r.x());
            rj.addProperty("y", r.y());
            rj.addProperty("z", r.z());
            rArr.add(rj);
        }
        msg.add("removals", rArr);
        send(msg);
    }

    private void handleServerMessage(String raw) {
        try {
            JsonObject msg = gson.fromJson(raw, JsonObject.class);
            String type = msg.get("type").getAsString();

            switch (type) {
                case "preview_clear" -> {
                    ClaudeCraftMod.ghostRenderer.clear();
                    ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.GENERATING;
                }
                case "preview_add" -> {
                    // Streaming: add blocks incrementally as they generate
                    JsonArray blocksArr = msg.getAsJsonArray("blocks");
                    List<GhostRenderer.PreviewBlock> blocks = new ArrayList<>();
                    for (var el : blocksArr) {
                        JsonObject b = el.getAsJsonObject();
                        blocks.add(new GhostRenderer.PreviewBlock(
                            b.get("x").getAsInt(),
                            b.get("y").getAsInt(),
                            b.get("z").getAsInt(),
                            b.get("block").getAsString()
                        ));
                    }
                    ClaudeCraftMod.ghostRenderer.addBlocks(blocks);
                    ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.GENERATING;
                    ClaudeCraftMod.setStatus("§b+" + blocks.size() + " blocks", 2000);
                }
                case "preview" -> {
                    // Final complete preview
                    JsonArray blocksArr = msg.getAsJsonArray("blocks");
                    List<GhostRenderer.PreviewBlock> blocks = new ArrayList<>();
                    for (var el : blocksArr) {
                        JsonObject b = el.getAsJsonObject();
                        blocks.add(new GhostRenderer.PreviewBlock(
                            b.get("x").getAsInt(),
                            b.get("y").getAsInt(),
                            b.get("z").getAsInt(),
                            b.get("block").getAsString()
                        ));
                    }

                    List<GhostRenderer.Removal> rems = new ArrayList<>();
                    if (msg.has("removals")) {
                        for (var el : msg.getAsJsonArray("removals")) {
                            JsonObject r = el.getAsJsonObject();
                            rems.add(new GhostRenderer.Removal(
                                r.get("x").getAsInt(),
                                r.get("y").getAsInt(),
                                r.get("z").getAsInt()
                            ));
                        }
                    }

                    ClaudeCraftMod.ghostRenderer.setPreview(blocks, rems);
                    ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.PREVIEWING;
                    ClaudeCraftMod.setStatus("§aDone! " + blocks.size() + " blocks — move, rotate, then Enter to place", 5000);
                }
                case "status" -> {
                    String statusMsg = msg.get("message").getAsString();
                    ClaudeCraftMod.setStatus("§e" + statusMsg, 10000);
                }
                case "placed" -> {
                    int count = msg.get("count").getAsInt();
                    sendChat("§a[ClaudeCraft] Placed " + count + " blocks!");
                }
                case "error" -> {
                    String errMsg = msg.get("message").getAsString();
                    sendChat("§c[ClaudeCraft] Error: " + errMsg);
                    ClaudeCraftMod.currentMode = ClaudeCraftMod.Mode.NONE;
                }
            }
        } catch (Exception e) {
            System.err.println("[ClaudeCraft] Failed to parse: " + e.getMessage());
        }
    }

    private void send(JsonObject msg) {
        if (!isConnected()) {
            sendChat("§c[ClaudeCraft] Not connected! Waiting for agent server...");
            return;
        }
        ws.send(gson.toJson(msg));
    }

    private void sendChat(String message) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (client.player != null) {
            client.execute(() -> client.player.sendMessage(Text.literal(message), false));
        }
    }
}
