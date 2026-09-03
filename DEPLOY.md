# Deploying the AI review feature

The site itself (`index.html`) works exactly as before with no setup. The
new "✨ Get Claude's real take" button needs one thing added on Vercel:

1. Go to your project on vercel.com → **Settings → Environment Variables**
2. Add a variable:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your Anthropic API key (starts with `sk-ant-...`)
   - Environment: Production (and Preview if you want it working on preview deploys too)
3. Redeploy (Vercel doesn't pick up new env vars on already-built deployments —
   trigger a new deploy, e.g. push a commit or hit "Redeploy" in the dashboard)

That's it — `api/review-prompt.js` picks it up automatically. The key never
reaches the browser; only this one serverless function ever sees it.

## Files added
- `api/review-prompt.js` — the serverless function that calls the real Claude API
- `package.json` — tells Vercel this is a Node project (`engines.node >= 18`,
  needed since the function uses the built-in `fetch`)

## Cost note
Each click of "Get Claude's real take" is one real API call (model:
`claude-sonnet-5`, capped at 1024 output tokens). It only fires on that
button click — generating a prompt or using the instant checker never
calls the API.
