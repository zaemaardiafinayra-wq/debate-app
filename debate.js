// api/debate.js
// Deploy this folder to Vercel. Set these environment variables in Vercel:
//   ANTHROPIC_API_KEY     - your Anthropic API key
//   UPSTASH_REDIS_REST_URL    - from your Upstash Redis database
//   UPSTASH_REDIS_REST_TOKEN  - from your Upstash Redis database
//
// This function tracks how many "debate messages" each device has used
// today, and blocks further calls once the free daily limit is hit
// (unless the device has an active subscription).

const FREE_DAILY_LIMIT = 30; // ~3 debates x ~10 messages each

function todayKey(deviceId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `usage:${deviceId}:${today}`;
}

async function redis(command, ...args) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // No Redis configured - usage tracking disabled, allow all requests
    return null;
  }
  const path = [command, ...args].map(encodeURIComponent).join("/");
  const res = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.result;
}

export default async function handler(req, res) {
  // CORS - allow requests from your app
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { system, prompt, deviceId, isSubscribed } = req.body || {};

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing 'prompt' in request body" });
  }

  // ---- Usage limit check (skip if subscribed or no deviceId provided) ----
  if (!isSubscribed && deviceId) {
    try {
      const key = todayKey(deviceId);
      const current = (await redis("get", key)) || 0;
      const count = parseInt(current, 10) || 0;

      if (count >= FREE_DAILY_LIMIT) {
        return res.status(429).json({
          error: "limit_reached",
          message: "Daily free limit reached. Subscribe for unlimited debates.",
          limit: FREE_DAILY_LIMIT,
          used: count,
        });
      }

      // Increment count, set 25h expiry so it auto-resets daily
      const newCount = count + 1;
      await redis("set", key, newCount, "EX", 90000);

      // Attach remaining count to response later
      req._usageRemaining = FREE_DAILY_LIMIT - newCount;
    } catch (e) {
      // If Redis fails, fail open (don't block users due to infra issues)
      console.error("Usage tracking error:", e.message);
    }
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system: system || "",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const text =
      data.content?.find((c) => c.type === "text")?.text?.trim() || "";

    return res.status(200).json({
      text,
      remaining: req._usageRemaining ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

