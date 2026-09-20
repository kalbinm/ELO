# ELO

ELO is a tiny, dependency-free voice assistant web app for an older Android Go tablet. It uses browser speech recognition and speech synthesis in the frontend, and a single Vercel serverless function to call Groq. The API key never reaches the browser.

## Run and deploy

1. Create an account at [Groq Console](https://console.groq.com/) and create an API key.
2. Put the project in a GitHub repository. No npm install or build step is required.
3. In [Vercel](https://vercel.com/), choose **Add New Project**, import the GitHub repository, and deploy.
4. Open **Project Settings → Environment Variables** and add `GROQ_API_KEY`. Optionally add `GROQ_MODEL` and `ACCESS_CODE`.
5. Redeploy after adding variables. Open the deployed HTTPS URL on the tablet, then use Chrome’s menu → **Add to Home screen**.

The default model is `openai/gpt-oss-20b`, a current fast production model. Change `GROQ_MODEL` if you prefer another model available in your Groq account.

## Use

Press and hold the orb, speak, and release. The response is shown and spoken aloud. Press the orb while ELO is speaking to stop it. If browser speech recognition is unavailable, the text box appears automatically.

After 60 seconds without interaction, ELO enters ambient mode with a clock, date, and weather. The default weather fallback is Tirana; when permitted, browser geolocation is used instead. Touch anywhere to return.

## Troubleshooting

- Microphone access requires HTTPS; Vercel provides HTTPS. Allow microphone access for the site in Chrome’s site settings.
- On Android Go, update Chrome and the Google app from the Play Store. Speech recognition depends on Google speech services being installed and enabled.
- If speech recognition is unavailable, use the text input fallback. This is expected on some old WebViews.
- If the voice sounds robotic, install or update Android’s Speech Services by Google and choose a downloaded voice in Android text-to-speech settings. ELO sets maximum volume and a slightly slower rate for the small speaker.
- If replies stop during a quota spike, wait briefly and try again; the app reports Groq rate-limit errors as a friendly overload message.

## Local API smoke test

The function is standard CommonJS and can be syntax-checked with:

```text
node --check api/chat.js
```

For a real response, set `GROQ_API_KEY` and deploy or run it through a Vercel-compatible local server. Never commit `.env` files or API keys.
