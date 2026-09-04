// POST /api/review-prompt
// Sends the user's assembled prompt to Claude for a real review: a critique,
// concrete suggestions, and a short sample response — so the user can see
// roughly what they'd actually get back before using the prompt for real.
//
// Requires an ANTHROPIC_API_KEY environment variable set in the Vercel
// project (Settings -> Environment Variables). The key never reaches the
// browser — this function is the only thing that ever sees it.

const MAX_PROMPT_LENGTH = 6000;
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You are reviewing a prompt a user has written for Claude, before they send it for real. You have two jobs:

1. Review it: point out anything unclear, missing, contradictory, or likely to produce a weak result. Be specific and constructive, not generic — reference the actual content of the prompt.
2. Demonstrate: write a genuine, concise sample response to the prompt exactly as given, so the user can see roughly what they'd actually get back. Keep it under 180 words — it's a preview, not the full answer.

Call the submit_review tool with your review. Always fill in all three fields.`;

const REVIEW_TOOL = {
  name: "submit_review",
  description: "Submit a structured review of the user's prompt.",
  input_schema: {
    type: "object",
    properties: {
      critique: {
        type: "string",
        description: "2-4 sentence overview of how strong the prompt is and why."
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description: "Specific, actionable suggestions for improving the prompt."
      },
      sample_response: {
        type: "string",
        description: "A real, concise sample response to the prompt, under 180 words."
      }
    },
    required: ["critique", "suggestions", "sample_response"]
  }
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Server is missing ANTHROPIC_API_KEY. Add it under your Vercel project's Settings \u2192 Environment Variables, then redeploy."
    });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    res.status(400).json({ error: "Invalid request body." });
    return;
  }

  const prompt = ((body && body.prompt) || "").toString().trim();
  if (!prompt) {
    res.status(400).json({ error: "No prompt provided." });
    return;
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    res.status(400).json({
      error: "That prompt is too long for the AI review (max " + MAX_PROMPT_LENGTH + " characters). Try trimming a field first."
    });
    return;
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
        tools: [REVIEW_TOOL],
        tool_choice: { type: "tool", name: "submit_review" }
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(anthropicRes.status >= 400 && anthropicRes.status < 600 ? anthropicRes.status : 502).json({
        error: "Claude API error: " + errText.slice(0, 300)
      });
      return;
    }

    const data = await anthropicRes.json();
    const toolBlock = (data.content || []).find((b) => b.type === "tool_use" && b.name === "submit_review");

    if (!toolBlock || typeof toolBlock.input !== "object" || toolBlock.input === null) {
      res.status(502).json({ error: "Claude didn't return a structured review this time. Try again." });
      return;
    }

    const parsed = toolBlock.input;
    res.status(200).json({
      critique: typeof parsed.critique === "string" ? parsed.critique : "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((s) => typeof s === "string") : [],
      sample_response: typeof parsed.sample_response === "string" ? parsed.sample_response : ""
    });
  } catch (e) {
    res.status(500).json({ error: "Request to Claude failed: " + e.message });
  }
}
