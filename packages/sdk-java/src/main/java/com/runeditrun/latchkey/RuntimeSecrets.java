package com.runeditrun.latchkey;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** Java 8+ runtime binding to the explicitly installed Latchkey Node bridge. */
public final class RuntimeSecrets {
    private final String node;
    private final String bridgePath;

    public RuntimeSecrets(String bridgePath) { this(bridgePath, "node"); }

    public RuntimeSecrets(String bridgePath, String node) {
        if (bridgePath == null || bridgePath.isEmpty() || node == null || node.isEmpty()) {
            throw new IllegalArgumentException("runtime_configuration_required");
        }
        this.bridgePath = bridgePath;
        this.node = node;
    }

    private static byte[] read(InputStream stream, int limit) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int count;
            while ((count = input.read(chunk)) != -1) {
                if (count > limit - output.size()) throw new Exception();
                output.write(chunk, 0, count);
            }
            return output.toByteArray();
        }
    }

    /** Returns the bridge's JSON object of approved string values; caller parses JSON. */
    public String fetchJson(String requestJson) throws RuntimeRequestException {
        Process process = null;
        ExecutorService workers = Executors.newFixedThreadPool(3);
        try {
            byte[] request = requestJson.getBytes(StandardCharsets.UTF_8);
            if (request.length > 1500000) throw new Exception();
            process = new ProcessBuilder(node, bridgePath).start();
            final Process child = process;
            Future<byte[]> stdout = workers.submit(() -> read(child.getInputStream(), 4000001));
            Future<byte[]> stderr = workers.submit(() -> read(child.getErrorStream(), 4096));
            Future<?> stdin = workers.submit(() -> {
                try (java.io.OutputStream stream = child.getOutputStream()) {
                    stream.write(request);
                }
                return null;
            });
            if (!child.waitFor(30, TimeUnit.SECONDS) || child.exitValue() != 0) throw new Exception();
            stdin.get(1, TimeUnit.SECONDS);
            stderr.get(1, TimeUnit.SECONDS);
            byte[] response = stdout.get(1, TimeUnit.SECONDS);
            String json = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(response)).toString().trim();
            if (!json.startsWith("{") || !json.endsWith("}")) throw new Exception();
            return json;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new RuntimeRequestException();
        } catch (Exception failure) {
            throw new RuntimeRequestException();
        } finally {
            if (process != null) {
                process.destroyForcibly();
                // Close only this invocation's private pipes.
                try { process.getInputStream().close(); } catch (Exception ignored) { }
                try { process.getErrorStream().close(); } catch (Exception ignored) { }
                try { process.getOutputStream().close(); } catch (Exception ignored) { }
            }
            workers.shutdownNow();
        }
    }

    public static final class RuntimeRequestException extends Exception {
        private RuntimeRequestException() { super("runtime_request_failed"); }
    }
}
