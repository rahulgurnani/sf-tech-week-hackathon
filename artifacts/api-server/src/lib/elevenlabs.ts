export function redactProviderError(text: string): string {
  for (const key of ["ELEVENLABS_API_KEY", "NEBIUS_API_KEY"]) {
    if (process.env[key]) text = text.split(process.env[key]!).join("[redacted]");
  }
  return text.replace(/wss?:\/\/[^\s"<>]+/gi, "[signed URL redacted]").slice(0, 1000);
}

export async function elevenlabsGet(path: string): Promise<Record<string, any>> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY is missing.");
  const response = await fetch(`https://api.elevenlabs.io/v1${path}`, {
    headers: { "xi-api-key": key }, signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(redactProviderError(`ElevenLabs HTTP ${response.status}: ${text}`));
  return JSON.parse(text);
}
