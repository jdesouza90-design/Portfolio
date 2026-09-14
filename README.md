# John DeSouza — portfolio

A static site (plain HTML, CSS and JavaScript, no build step) generated from the
"Strategic Design & Business Results" slide deck. Hosted on Vercel, deployed from
GitHub.

Live: https://john-desouza.com

## Structure

```
index.html                      Home: hero, selected work, how I lead, how I track design, about, contact
work.html                       Work index: all five case studies
work/cross-sell.html            Best Egg · Cross-Sell (Vehicle Equity & Home Secured Loans)
work/verifications.html         Best Egg · Verifications
work/staking.html               Chainlink Labs · Staking v0.1
work/no-code-tools.html         Auth0 · No-code tools
work/sign-in-with-ethereum.html Auth0 · Sign-in with Ethereum
styles.css                      Design tokens, components, case-study layout
main.js                         CONFIG links, nav, scroll reveal, scroll-spy, chart, walkthroughs
middleware.js                   Vercel Edge Middleware: the password gate for /work/*
vercel.json                     Cache and security headers
assets/                         Mockups, logos, walkthrough recordings exported from the deck
og-image.png                    Social preview image used when the link is shared
```

## Deploying

Push to `main` and Vercel builds and publishes automatically. For a one-off
manual deploy, run `npx vercel --prod` from this folder.

## The case-study password

Everything under `work/` is gated by `middleware.js`, which runs at Vercel's edge
before any file is served. The home page and the work index stay public.

- The password is the `CASE_STUDY_PASSWORD` environment variable, set in
  Vercel → Project → Settings → Environment Variables. It is deliberately not
  stored in this repo.
- A correct password sets a cookie scoped to `/work` that lasts 30 days, so a
  visitor unlocks all five case studies once.
- Changing the password invalidates every existing cookie, because the cookie
  value is derived from the password.
- If the variable is missing the gate fails closed and says so.
- Running `python3 -m http.server` locally has no edge runtime, so the case
  studies open without a password. Use `npx vercel dev` to exercise the gate.

## Before sending the link out

1. **Set your links** at the top of `main.js`:
   ```js
   const CONFIG = {
     linkedin: "https://www.linkedin.com/in/johndesouza-/",
     email: "",     // add your email to show the "Email me" buttons
     resume: "",    // e.g. "assets/john-desouza-resume.pdf" to show "Resume" links
   };
   ```
   Empty values hide their buttons, so nothing looks broken while they're blank.
2. **Check the colleague names.** Team details use first names, roles and
   locations from the deck. Remove anyone who would rather not be listed.

## Editing content

- Case-study copy lives directly in each `work/*.html` file.
- The originations chart on the Cross-Sell page reads its numbers from the
  `data-series` attribute on the `.chart` element; the table below it is the
  accessible fallback.
- Company logos in `assets/logo-*.svg` are the companies' own vector files. Each
  is sized in `styles.css` so the wordmark text matches across all three, since
  the three lockups have different icon-to-text proportions.
- Each case study has its own background, set by a `case-*` class on `<body>`
  and on its row in the work index.
- The three walkthrough recordings are 2.8–7.8 MB and only load when a visitor
  presses Play. They come from the deck's GIFs, so their resolution is capped;
  replace them if you still have the original screen recordings.
- Image URLs carry a `?v=` content hash. If you replace a file in `assets/`,
  update that hash (or any changed value) so visitors stop seeing the old one.
