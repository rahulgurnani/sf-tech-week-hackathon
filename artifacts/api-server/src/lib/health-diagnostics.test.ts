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
    if (String(url).endsWith("/models")) return json({
      data: [{ id: env.NEBIUS_TEXT_MODEL }, { id: env.NEBIUS_VISION_MODEL }],
    });
    assert.equal(String(url), "https://api.tokenfactory.nebius.com/v1/chat/completions");
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${env.NEBIUS_API_KEY}`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.max_tokens, 1024);
    assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
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
  const text = await diagnostics.run("nebius_text");
  assert.equal(text.output, "OK");
  assert.equal(text.http_status, 200);
  assert.equal(text.model_in_catalog, true);
  const vision = await diagnostics.run("nebius_vision");
  assert.equal(vision.status, "ok");
  assert.equal(vision.model_in_catalog, true);
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

test("configured models are trimmed, checked case-sensitively and not hidden in full errors", async () => {
  const trimmedModel = "qwen/Qwen3.5-397B-A17B";
  const body = JSON.stringify({
    error: { message: `The model ${trimmedModel} does not exist.`, code: "model_not_found" },
    context: "Full diagnostic information. ".repeat(100),
  });
  const diagnostics = createHealthDiagnostics({
    env: { ...env, NEBIUS_TEXT_MODEL: `  ${trimmedModel}\n` },
    fetchImpl: async (url, init) => {
      if (String(url).endsWith("/models")) return json({ data: [{ id: "Qwen/Qwen3.5-397B-A17B" }] });
      assert.equal(JSON.parse(String(init?.body)).model, trimmedModel);
      return new Response(body, { status: 404 });
    },
  });
  const result = await diagnostics.run("nebius_text");
  assert.equal(result.configured_model, trimmedModel);
  assert.equal(result.model_in_catalog, false);
  assert.equal(result.http_status, 404);
  assert.equal(result.error_response_body, body); // Not sliced to the summary limit.
  assert(result.error!.includes(trimmedModel));
  assert.equal(JSON.parse(result.request_body!).model, trimmedModel);
  assert.equal(diagnostics.manifest().find(check => check.id === "nebius_text")?.model_in_catalog, false);
});

test("all five provider checks expose upstream HTTP status and complete redacted error bodies", async () => {
  const body = JSON.stringify({ error: { message: "Provider failure", extra: { nested: true } },
    supplied_key: env.NEBIUS_API_KEY, eleven_key: env.ELEVENLABS_API_KEY });
  const diagnostics = createHealthDiagnostics({ env, fetchImpl: async () => new Response(body, { status: 429 }) });
  for (const check of diagnostics.manifest()) {
    const result = await diagnostics.run(check.id);
    assert.equal(result.status, "error");
    assert.equal(result.http_status, 429);
    assert.equal(result.error_response_body, body.replaceAll(env.NEBIUS_API_KEY, "[redacted]").replaceAll(env.ELEVENLABS_API_KEY, "[redacted]"));
  }
});

test("HTTP 200 with no answer exposes the full response and identifies an exhausted token budget", async () => {
  const body = JSON.stringify({ choices: [{
    message: { content: null, reasoning_content: null }, finish_reason: "length",
  }], usage: { completion_tokens: 1024 } });
  const diagnostics = createHealthDiagnostics({ env, fetchImpl: async (url) => {
    if (String(url).endsWith("/models")) return json({ data: [{ id: env.NEBIUS_TEXT_MODEL }] });
    return new Response(body, { status: 200 });
  } });
  const result = await diagnostics.run("nebius_text");
  assert.equal(result.http_status, 200);
  assert.equal(result.status, "error");
  assert.match(result.error!, /exhausted max_tokens/);
  assert.equal(result.error_response_body, body);
});

test("both checks log completion fields and use a clearly marked health-only reasoning fallback", async () => {
  const events: unknown[] = [];
  const usage = { prompt_tokens: 18, completion_tokens: 12, total_tokens: 30,
    completion_tokens_details: { reasoning_tokens: 12 } };
  const diagnostics = createHealthDiagnostics({
    env, logCompletion: event => events.push(event),
    fetchImpl: async (url) => {
      if (String(url).endsWith("/models")) return json({ data: [
        { id: env.NEBIUS_TEXT_MODEL }, { id: env.NEBIUS_VISION_MODEL },
      ] });
      return json({ choices: [{ finish_reason: "stop",
        message: { content: "", reasoning_content: "Diagnostic reasoning answer." } }], usage });
    },
  });
  for (const id of ["nebius_text", "nebius_vision"] as const) {
    const result = await diagnostics.run(id);
    assert.equal(result.status, "ok");
    assert.equal(result.output_source, "reasoning_content");
    assert.equal(result.output, "Diagnostic reasoning answer.");
    assert.match(result.message, /health-only/);
    assert.equal(result.completion_details!.message.content, "");
    assert.equal(result.completion_details!.message.reasoning_content, result.output);
    assert.equal(result.completion_details!.finish_reason, "stop");
    assert.deepEqual(result.completion_details!.usage, usage);
  }
  assert.equal(events.length, 2);
  assert.deepEqual((events[0] as { usage: unknown }).usage, usage);
});

test("content takes priority over reasoning and logged fields redact credentials", async () => {
  const events: unknown[] = [];
  const diagnostics = createHealthDiagnostics({ env, logCompletion: event => events.push(event),
    fetchImpl: async (url) => String(url).endsWith("/models")
      ? json({ data: [{ id: env.NEBIUS_TEXT_MODEL }] })
      : json({ choices: [{ finish_reason: "stop", message: {
        content: "OK", reasoning_content: `Diagnostic echo ${env.NEBIUS_API_KEY}`,
      } }], usage: { total_tokens: 10 } }),
  });
  const result = await diagnostics.run("nebius_text");
  assert.equal(result.output, "OK");
  assert.equal(result.output_source, "content");
  assert(!JSON.stringify(events).includes(env.NEBIUS_API_KEY));
  assert(!JSON.stringify(result).includes(env.NEBIUS_API_KEY));
});

test("explicit thinking parameter rejection retries once without it and records the rejection", async () => {
  let calls = 0;
  const diagnostics = createHealthDiagnostics({ env, fetchImpl: async (url, init) => {
    if (String(url).endsWith("/models")) return json({ data: [{ id: env.NEBIUS_TEXT_MODEL }] });
    const body = JSON.parse(String(init?.body));
    if (calls++ === 0) {
      assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
      return json({ error: { message: "chat_template_kwargs is not supported." } }, 422);
    }
    assert(!("chat_template_kwargs" in body));
    assert.equal(body.max_tokens, 1024);
    return json({ choices: [{ message: { content: "OK" }, finish_reason: "stop" }] });
  } });
  const result = await diagnostics.run("nebius_text");
  assert.equal(calls, 2);
  assert.equal(result.http_status, 200);
  assert.equal(result.status, "ok");
  assert.equal(result.thinking_disabled_requested, false);
  assert.match(result.thinking_parameter_error!, /not supported/);
  assert(!("chat_template_kwargs" in JSON.parse(result.request_body!)));
});
