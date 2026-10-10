export const NEBIUS_CHAT_URL = "https://api.tokenfactory.nebius.com/v1/chat/completions";

type Message = { role: "user" | "system" | "assistant"; content: string | { type: string; [key: string]: unknown }[] };

/** Shared defaults for every text/vision request. Scoring never uses reasoning fallback. */
export function nebiusCompletionBody(model: string, messages: Message[], jsonObject = false) {
  return {
    model: model.trim(), messages, max_tokens: 1024,
    chat_template_kwargs: { enable_thinking: false }, temperature: 0,
    ...(jsonObject ? { response_format: { type: "json_object" } } : {}),
  };
}

export function createNebiusClient(apiKey: string, fetchImpl = fetch) {
  return {
    async complete(model: string, messages: Message[], jsonObject = false) {
      const response = await fetchImpl(NEBIUS_CHAT_URL, {
        method: "POST", headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify(nebiusCompletionBody(model, messages, jsonObject)),
        signal: AbortSignal.timeout(25_000), redirect: "error",
      });
      if (!response.ok) throw new Error(`Nebius HTTP ${response.status}`);
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error("Nebius returned no answer content.");
      return jsonObject ? JSON.parse(content) : content;
    },
  };
}
