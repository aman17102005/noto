# Noto

**Every parent understands every school notice.**

Noto turns an English school notice into a short, simple summary, a checklist and important dates in 5 languages (simple English, Hindi, Spanish, Chinese, Vietnamese). The teacher shares one link or QR code. Parents scan it — no app, no login — pick their language, and read or listen.

> 🚧 Work in progress — being built during **STEMergent Hacks 2026** (Oct 30 – Nov 15, 2026). The full README is written at the end of the event.

## Run locally

Needs Node.js 20.12 or newer. No packages to install.

```bash
cp .env.example .env.local   # then paste your Gemini API key into .env.local
npm run dev                  # starts http://localhost:3000
```

- Demo notice: http://localhost:3000/n/demo-school
- Try the AI from the terminal: `npm run try -- samples/ptm-notice.txt`
- Run the tests: `npm test`

## AI model

Noto uses Google's Gemini API (free tier): `gemini-3.5-flash-lite`, with `gemini-3.1-flash-lite` as a fallback. In our test on 1 Nov 2026 these answered in about 6 seconds, while `gemini-3.8-flash` took about 96 seconds on the free tier — too slow for a teacher to wait.

## License

MIT — see [LICENSE](LICENSE).
