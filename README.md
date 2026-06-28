# Arena

A minimalist multi-model comparator powered by [OpenRouter](https://openrouter.ai).
Write one prompt, pick several AI models, and watch them answer **side by side, streaming
in real time**. Then anonymize the responses (A, B, C…) and let a panel of **blind judges**
score them on a standard evaluation rubric.

- **Parallel live streaming** — each model answers in its own column, token by token.
- **Free + premium models, one key** — free `:free` models (Llama, Qwen, Gemma…) and
  premium ones (GPT‑4o, Claude, Grok…) all run through the same OpenRouter API key.
- **Blind judging** — 1–3 judge models score every anonymized answer on a standard
  evaluation rubric (Accuracy, Reasoning, Completeness, Clarity, Safety; 0–10 each),
  producing a ranked leaderboard, an **agreement** metric (with 2+ judges), and a
  highlighted winner.
- **Key never touches the browser** — every OpenRouter call goes through a Next.js API
  route (`app/api/chat`, `app/api/judge`). The `OPENROUTER_API_KEY` is read server‑side
  only; `lib/openrouter.ts` is marked `import "server-only"` so the build fails if it is
  ever pulled into client code.

## Architecture

```
app/
  page.tsx              UI orchestrator (client): prompt, columns, judging
  api/chat/route.ts     streaming proxy → OpenRouter (one model per request, SSE)
  api/judge/route.ts    blind judge → strict rubric JSON
components/             PromptBar, ModelPicker, ResponseColumn, JudgePanel, Leaderboard, ModelIcon
lib/
  models.ts             ← THE model registry. Edit this to add/remove models.
  openrouter.ts         server-only OpenRouter client (reads the API key)
  rubric.ts             scoring, ranking, and agreement math
  stream-client.ts      browser-side SSE reader + anonymization helpers
  types.ts              shared types
```

### Editing the model list

All models live in [`lib/models.ts`](lib/models.ts). Each entry is
`{ slug, label, provider, tier }` where `slug` is the exact OpenRouter model id from
<https://openrouter.ai/models>. Set `defaultSelected` to pre‑tick a model for comparison
and `defaultJudge` to pre‑tick it as a judge. OpenRouter's free catalog changes often — if
a `:free` slug stops working, swap it for a current one from that page.

## Run it locally

1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Add your OpenRouter key.** Get one at <https://openrouter.ai/keys>, then:
   ```bash
   cp .env.example .env.local
   ```
   Open `.env.local` and set `OPENROUTER_API_KEY=sk-or-...`
3. **Start the dev server**
   ```bash
   npm run dev
   ```
   Open <http://localhost:3000>, write a prompt, pick a few models, and hit **Compare**
   (or ⌘/Ctrl + Enter). After responses finish, choose judges and hit **Judge blind**.

---

## Deploy: GitHub → Vercel

### 1 · Create a new GitHub repo and push

Create an **empty** repo at <https://github.com/new> (no README/.gitignore — this project
already has them). Then, from the project folder:

```bash
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

> The first commit is already made for you (see below). `.env.local` is gitignored, so your
> key is **not** pushed.

### 2 · Import the project into Vercel

1. Go to <https://vercel.com/new>.
2. Click **Import** next to your new GitHub repo (authorize Vercel for GitHub if asked).
3. Vercel auto-detects **Next.js** — leave Framework Preset, Build Command, and Output
   Directory at their defaults.

### 3 · Add the `OPENROUTER_API_KEY` environment variable (exact location)

**Before** clicking Deploy, on that same import screen:

1. Expand the **“Environment Variables”** section.
2. **Key:** `OPENROUTER_API_KEY`  **Value:** your `sk-or-...` key.
3. Leave all three environments (Production, Preview, Development) checked → **Add**.

> Already deployed and forgot? Add it later at:
> **Vercel Dashboard → your project → Settings → Environment Variables → Add New**,
> name it `OPENROUTER_API_KEY`, paste the value, save, then **Deployments → ⋯ → Redeploy**
> so the new variable is picked up.

### 4 · Deploy

Click **Deploy**. When it finishes, open the generated URL — Arena is live.

---

Built with Next.js (App Router) + Tailwind CSS. The accent color lives in one place
(`--accent` in `app/globals.css`) if you want to re-skin it.
