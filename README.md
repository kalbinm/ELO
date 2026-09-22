# ELO

ELO is a tiny, dependency-free voice assistant web app for an older Android Go tablet. It uses browser speech recognition and speech synthesis in the frontend, a Vercel serverless function to call Groq, and lightweight server-side web/news endpoints. API keys never reach the browser.

## Run and deploy

1. Create an account at [Groq Console](https://console.groq.com/) and create an API key.
2. Put the project in a GitHub repository. No npm install or build step is required.
3. In [Vercel](https://vercel.com/), choose **Add New Project**, import the GitHub repository, and deploy.
4. Open **Project Settings → Environment Variables** and add `GROQ_API_KEY`. Optionally add `GROQ_MODEL` and `ACCESS_CODE`.
5. Redeploy after adding variables. Open the deployed HTTPS URL on the tablet, then use Chrome’s menu → **Add to Home screen**.

The default model is `openai/gpt-oss-20b`, a current fast production model. Change `GROQ_MODEL` if you prefer another model available in your Groq account.

## Use

On a browser that permits hands-free microphone startup, ELO arms itself when the page opens. Say “Hey ELO” followed by a request. If the browser requires a user gesture, tap the orb once to arm it; after that, the wake word keeps the interaction hands-free. Press the orb while ELO is speaking to stop it. If browser speech recognition is unavailable, the text box appears automatically.

Say “Hey ELO, search the web for …” to use web search, or “Hey ELO, what’s the latest news?” for current headlines. These use DuckDuckGo HTML search and Google News RSS through the Vercel functions in `api/search.js` and `api/news.js`.

After 60 seconds without interaction, ELO enters ambient mode with a clock, date, and weather. The default weather fallback is Tirana; when permitted, browser geolocation is used instead. Touch anywhere to return.

## Troubleshooting

- Microphone access requires HTTPS; Vercel provides HTTPS. Allow microphone access for the site in Chrome’s site settings.
- On Android Go, update Chrome and the Google app from the Play Store. Speech recognition depends on Google speech services being installed and enabled.
- If speech recognition is unavailable, use the text input fallback. This is expected on some old WebViews.
- If the voice sounds robotic, install or update Android’s Speech Services by Google and choose a downloaded English voice in Android text-to-speech settings. ELO selects a natural English voice when one is available and uses a slightly slower, warmer delivery for the small speaker.
- If replies stop during a quota spike, wait briefly and try again; the app reports Groq rate-limit errors as a friendly overload message.

## Local API smoke test

The function is standard CommonJS and can be syntax-checked with:

```text
node --check api/chat.js
```

For a real response, set `GROQ_API_KEY` and deploy or run it through a Vercel-compatible local server. Never commit `.env` files or API keys.
