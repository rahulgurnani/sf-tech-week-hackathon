import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { createHealthDiagnostics } from "./health-diagnostics";
import { HEALTH_TEST_IMAGE } from "./health-test-image";

// Only fake credentials are used here. Tests never contact real providers.
const env = {
  NEBIUS_API_KEY: "fake-nebius-key",
  NEBIUS_TEXT_MODEL: "fake-text-model",
  NEBIUS_VISION_MODEL: "fake-vision-model",
  ELEVENLABS_API_KEY: "fake-eleven-key",
  ELEVENLABS_AGENT_ID: "fake-agent",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});

test("missing secrets are returned without making network requests", async () => {
  const diagnostics = createHealthDiagnostics({
    env: {},
    fetchImpl: async () => { throw new Error("A missing secret must not trigger fetch"); },
  });
  for (const check of diagnostics.manifest()) {
    assert.equal(check.status, "missing");
    const result = await diagnostics.run(check.id);
    assert.equal(result.status, "missing");
    assert.equal(result.error, null);
    assert(result.missing_secrets.length);
  }
});

test("text and vision send the correct model, prompt and base64 PNG", async () => {
  let calls = 0;
  const diagnostics = createHealthDiagnostics({ env, fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://api.tokenfactory.nebius.com/v1/chat/completions");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${env.NEBIUS_API_KEY}`);
    const body = JSON.parse(String(init?.body));
    if (calls++ === 0) {
      assert.equal(body.model, env.NEBIUS_TEXT_MODEL);
      assert.equal(body.messages[0].content, "Say OK");
      return json({ choices: [{ message: { content: "OK" } }] });
    }
    assert.equal(body.model, env.NEBIUS_VISION_MODEL);
    const image = body.messages[0].content[1].image_url.url;
    assert.equal(image, HEALTH_TEST_IMAGE);
    const png = Buffer.from(image.split(",")[1], "base64");
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), 128);
    assert.equal(png.readUInt32BE(20), 96);
    const idatSize = png.readUInt32BE(33);
    const pixels = inflateSync(png.subarray(41, 41 + idatSize));
    assert.equal(pixels.length, 96 * (128 * 3 + 1));
    return json({ choices: [{ message: { content: "A red square and blue circle." } }] });
  } });
  assert.equal((await diagnostics.run("nebius_text")).output, "OK");
  assert.equal((await diagnostics.run("nebius_vision")).status, "ok");
  assert.equal(calls, 2);
});

test("model catalog lists IDs and concurrent/repeated checks reuse one request", async () => {
  let calls = 0;
  let clock = 1_700_000_000_000;
  const diagnostics = createHealthDiagnostics({ env, now: () => clock, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.tokenfactory.nebius.com/v1/models");
    assert.equal(init?.method, undefined);
    return json({ data: [{ id: "model-a" }, { id: "model-b" }] });
  } });
  const [a, b] = await Promise.all([diagnostics.run("nebius_models"), diagnostics.run("nebius_models")]);
  assert.deepEqual(a.model_ids, ["model-a", "model-b"]);
  assert.deepEqual(a, b);
  await diagnostics.run("nebius_models");
  assert.equal(calls, 1);
  clock += 60_001;
  await diagnostics.run("nebius_models");
  assert.equal(calls, 2);
});

test("provider errors retain HTTP detail but redact credential values", async () => {
  const diagnostics = createHealthDiagnostics({ env, fetchImpl: async () => json({
    error: { message: `Invalid key ${env.NEBIUS_API_KEY} Bearer unexpected-token` },
  }, 401) });
  const failed = await diagnostics.run("nebius_models");
  assert.equal(failed.status, "error");
  assert.match(failed.error!, /HTTP 401/);
  assert(!failed.error!.includes(env.NEBIUS_API_KEY));
  assert(!failed.error!.includes("unexpected-token"));
});

test("timeout and malformed completion responses are visible failures", async () => {
  const timeout = createHealthDiagnostics({ env, fetchImpl: async () => {
    throw new DOMException("Request expired", "TimeoutError");
  } });
  assert.match((await timeout.run("nebius_text")).error!, /25 seconds/);
  const empty = createHealthDiagnostics({ env, fetchImpl: async () => json({ choices: [] }) });
  assert.equal((await empty.run("nebius_vision")).status, "error");
});

test("TTS retains temporary audio for playback and expires it after five minutes", async () => {
  let clock = 1_700_000_000_000;
  const bytes = Buffer.from("ID3-test-audio");
  const diagnostics = createHealthDiagnostics({ env, now: () => clock, fetchImpl: async (url, init) => {
    assert.match(String(url), /elevenlabs\.io\/v1\/text-to-speech\//);
    assert.equal(new Headers(init?.headers).get("xi-api-key"), env.ELEVENLABS_API_KEY);
    assert.equal(JSON.parse(String(init?.body)).text, "Audition connection test is working.");
    return new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } });
  } });
  const result = await diagnostics.run("elevenlabs_tts");
  assert.equal(result.status, "ok");
  assert.match(result.audio_url!, /^\/api\/admin\/health\/tts-audio/);
  assert.deepEqual(diagnostics.getAudio(), bytes);
  clock += 300_001;
  assert.equal(diagnostics.getAudio(), undefined);
  assert.equal(diagnostics.manifest().find(check => check.id === "elevenlabs_tts")?.status, "untested");
});

test("agent signed URL is fetched with a server header, validated and never returned", async () => {
  const token = "temporary-capability";
  const diagnostics = createHealthDiagnostics({ env, fetchImpl: async (url, init) => {
    const requestUrl = new URL(String(url));
    assert.equal(requestUrl.pathname, "/v1/convai/conversation/get-signed-url");
    assert.equal(requestUrl.searchParams.get("agent_id"), env.ELEVENLABS_AGENT_ID);
    assert.equal(new Headers(init?.headers).get("xi-api-key"), env.ELEVENLABS_API_KEY);
    return json({ signed_url: `wss://api.elevenlabs.io/v1/convai/conversation?token=${token}` });
  } });
  const result = await diagnostics.run("elevenlabs_agent");
  assert.equal(result.status, "ok");
  assert.equal(result.signed_url_available, true);
  assert(!JSON.stringify(result).includes(token));
  assert(!JSON.stringify(result).includes(env.ELEVENLABS_API_KEY));
});
