import axios from "axios";

// Parses a JSON answer from the model, tolerating a ```json fence around it.
export const parseJsonResponse = (raw) => {
  let text = String(raw || "").trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?/, "")
      .replace(/```$/, "")
      .trim();
  }
  return JSON.parse(text);
};

// Same signature as axios.post. Tries the primary OpenAI key first and, if that
// request fails, retries once with the fallback key.
export const openAiPost = async (url, body, config = {}) => {
  const keys = [
    ...new Set(
      [process.env.CHAT_GPT_API_KEY, process.env.CHAT_GPT_FALL_BACK_API_KEY].filter(Boolean),
    ),
  ];
  if (keys.length === 0) throw new Error("No OpenAI API key configured");

  let lastError;
  for (const [i, key] of keys.entries()) {
    try {
      return await axios.post(url, body, {
        ...config,
        headers: { ...config.headers, Authorization: `Bearer ${key}` },
      });
    } catch (err) {
      lastError = err;
      console.error(
        `OpenAI request failed with ${i === 0 ? "primary" : "fallback"} key:`,
        err.response?.data || err.message,
      );
    }
  }
  throw lastError;
};
