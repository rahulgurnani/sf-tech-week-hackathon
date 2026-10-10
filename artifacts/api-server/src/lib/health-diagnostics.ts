import type { ConnectionCheck, ConnectionCheckId } from "@workspace/api-zod";
import { HEALTH_TEST_IMAGE } from "./health-test-image";

const SECRET_NAMES = ["NEBIUS_API_KEY", "NEBIUS_TEXT_MODEL", "NEBIUS_VISION_MODEL", "ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID"] as const;
const CHECKS: { id: ConnectionCheckId; label: string; secrets: string[] }[] = [
  { id: "nebius_models", label: "Nebius · Model catalog", secrets: ["NEBIUS_API_KEY"] },
  { id: "nebius_text", label: "Nebius · Text completion", secrets: ["NEBIUS_API_KEY", "NEBIUS_TEXT_MODEL"] },
  { id: "nebius_vision", label: "Nebius · Vision completion", secrets: ["NEBIUS_API_KEY", "NEBIUS_VISION_MODEL"] },
  { id: "elevenlabs_tts", label: "ElevenLabs · Text to speech", secrets: ["ELEVENLABS_API_KEY"] },
  { id: "elevenlabs_agent", label: "ElevenLabs · Agent signed URL", secrets: ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID"] },
];
const NEBIUS_BASE = "https://api.tokenfactory.nebius.com/v1";
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";
const TEST_SENTENCE = "Audition connection test is working.";
const CACHE_MS = 60_000;
const AUDIO_TTL_MS = 5 * 60_000;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function readLimited(response: Response, limit = 1_048_576): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Provider response exceeded the diagnostic size limit.");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    reader.releaseLock();
  }
}

export function createHealthDiagnostics({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
}: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: () => number } = {}) {
  const results = new Map<ConnectionCheckId, ConnectionCheck>();
  const pending = new Map<ConnectionCheckId, Promise<ConnectionCheck>>();
  let audio: { bytes: Buffer; expiresAt: number } | undefined;

  function safeMessage(input: string): string {
    let message = input;
    for (const name of SECRET_NAMES) {
      const secret = env[name]?.trim();
      if (secret) message = message.split(secret).join("[redacted]");
    }
    return message
      .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
      .replace(/wss?:\/\/[^\s"<>]+/gi, "[signed URL redacted]")
      .slice(0, 1200);
  }

  function initial(id: ConnectionCheckId): ConnectionCheck {
    const definition = CHECKS.find(check => check.id === id)!;
    const missing = definition.secrets.filter(name => !env[name]?.trim());
    return {
      id, label: definition.label, status: missing.length ? "missing" : "untested",
      message: missing.length ? `Missing: ${missing.join(", ")}` : "Ready to test. No provider request has been made.",
      error: null, missing_secrets: missing, checked_at: null, latency_ms: null,
      ...(id === "nebius_vision" ? { image_data_url: HEALTH_TEST_IMAGE } : {}),
    };
  }

  function manifest(): ConnectionCheck[] {
    return CHECKS.map(({ id }) => {
      const base = initial(id);
      if (base.status === "missing") return base;
      const result = results.get(id);
      if (!result) return base;
      if (id === "elevenlabs_tts" && result.status === "ok" && (!audio || audio.expiresAt <= now())) {
        return { ...base, message: "Previous audio sample expired. Run the test to generate a new sample." };
      }
      return result;
    });
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetchImpl(url, {
      ...init, redirect: "error", signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      const text = (await readLimited(response)).toString("utf8");
      let detail = text;
      try {
        const body = record(JSON.parse(text));
        const providerError = record(body.error);
        const providerDetail = record(body.detail);
        detail = String(providerError.message ?? providerDetail.message ?? body.message ?? body.detail ?? text);
      } catch { /* A provider may return a plain-text error. */ }
      throw new Error(`HTTP ${response.status}: ${safeMessage(detail || response.statusText)}`);
    }
    return response;
  }

  async function jsonRequest(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const response = await request(url, init);
    const text = (await readLimited(response)).toString("utf8");
    try { return record(JSON.parse(text)); }
    catch { throw new Error("Provider returned invalid JSON."); }
  }

  async function execute(id: ConnectionCheckId): Promise<ConnectionCheck> {
    const base = initial(id);
    if (base.status === "missing") return base;
    const started = now();
    try {
      let details: Partial<ConnectionCheck> = {};
      let message: string;
      if (id === "nebius_models") {
        const data = await jsonRequest(`${NEBIUS_BASE}/models`, {
          headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY!.trim()}` },
        });
        if (!Array.isArray(data.data)) throw new Error("Provider response has no model catalog.");
        const ids = data.data.map(model => record(model).id).filter((value): value is string => typeof value === "string");
        if (!ids.length) throw new Error("Provider returned an empty model catalog.");
        details = { model_ids: ids };
        message = `${ids.length} model IDs available.`;
      } else if (id === "nebius_text" || id === "nebius_vision") {
        const vision = id === "nebius_vision";
        const content = vision ? [
          { type: "text", text: "What does this image show? Describe the colored shapes in one short sentence." },
          { type: "image_url", image_url: { url: HEALTH_TEST_IMAGE } },
        ] : "Say OK";
        const data = await jsonRequest(`${NEBIUS_BASE}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY!.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: env[vision ? "NEBIUS_VISION_MODEL" : "NEBIUS_TEXT_MODEL"]!.trim(),
            messages: [{ role: "user", content }],
            max_tokens: vision ? 128 : 32,
            temperature: 0,
          }),
        });
        const choice = Array.isArray(data.choices) ? record(data.choices[0]) : {};
        const output = record(choice.message).content;
        if (typeof output !== "string" || !output.trim()) throw new Error("Provider returned no completion text.");
        details = { output: safeMessage(output.trim()) };
        // A valid response tests connection; do not falsely claim semantic vision accuracy.
        message = vision ? "Vision request accepted; response shown below." : "Text completion returned a response.";
      } else if (id === "elevenlabs_tts") {
        audio = undefined;
        // ElevenLabs default George voice; no extra secret required.
        const response = await request(`${ELEVENLABS_BASE}/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128`, {
          method: "POST",
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY!.trim(), "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text: TEST_SENTENCE, model_id: "eleven_multilingual_v2" }),
        });
        const bytes = await readLimited(response, 2_097_152);
        const mime = response.headers.get("content-type") ?? "";
        const id3 = bytes.subarray(0, 3).toString() === "ID3";
        const frame = bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
        if (!bytes.length || (!mime.startsWith("audio/") && !id3 && !frame)) {
          throw new Error("Provider returned no playable audio.");
        }
        audio = { bytes, expiresAt: now() + AUDIO_TTL_MS };
        details = { audio_url: `/api/admin/health/tts-audio?v=${now()}`, output: TEST_SENTENCE };
        message = "Speech generated. Play the short sentence below.";
      } else {
        const data = await jsonRequest(`${ELEVENLABS_BASE}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(env.ELEVENLABS_AGENT_ID!.trim())}`, {
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY!.trim() },
        });
        if (typeof data.signed_url !== "string") throw new Error("Provider returned no signed URL.");
        const url = new URL(data.signed_url);
        if (url.protocol !== "wss:" || !url.hostname.endsWith(".elevenlabs.io")) {
          throw new Error("Provider returned an unexpected signed URL.");
        }
        // Do not log or expose the temporary agent capability in a diagnostics page.
        details = { signed_url_available: true };
        message = "Signed URL retrieved and validated on the server. API key and signed URL are not sent to this page.";
      }
      const result: ConnectionCheck = {
        ...base, ...details, status: "ok", message,
        checked_at: new Date(now()), latency_ms: Math.max(0, now() - started),
      };
      results.set(id, result);
      return result;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Unknown provider error.";
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const message = timeout ? "Provider request timed out after 25 seconds." : safeMessage(raw);
      const result: ConnectionCheck = {
        ...base, status: "error", message: "Connection test failed.", error: message,
        checked_at: new Date(now()), latency_ms: Math.max(0, now() - started),
      };
      results.set(id, result);
      return result;
    }
  }

  async function run(id: ConnectionCheckId): Promise<ConnectionCheck> {
    const base = initial(id);
    if (base.status === "missing") return base;
    const current = pending.get(id);
    if (current) return current;
    const cached = results.get(id);
    if (cached?.checked_at && now() - cached.checked_at.getTime() < CACHE_MS) return cached;
    const work = execute(id);
    pending.set(id, work);
    try { return await work; }
    finally { pending.delete(id); }
  }

  return {
    manifest, run,
    getAudio(): Buffer | undefined {
      if (!audio || audio.expiresAt <= now()) { audio = undefined; return undefined; }
      return audio.bytes;
    },
  };
}
