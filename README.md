# John DeSouza — portfolio site

A static site (plain HTML, CSS and JavaScript, no build step) generated from the
"Strategic Design & Business Results" slide deck.

## Structure

```
index.html                      Home: hero + impact chain, selected work, leadership, additional work, about, contact
work/cross-sell.html            Best Egg · Cross-Sell (Vehicle Equity & Home Secured Loans)
work/verifications.html         Best Egg · Verifications
work/staking.html               Chainlink Labs · Staking v0.1
work/no-code-tools.html         Auth0 · No-code tools
work/sign-in-with-ethereum.html Auth0 · Sign-in with Ethereum
styles.css                      Design tokens (light + dark), components, case-study layout
main.js                         CONFIG links, theme toggle, impact chain, scroll-spy, chart, walkthroughs
assets/                         Mockups, logos, walkthrough animations exported from the deck
og-image.png                    Social preview image used when the link is shared
```

## Before you send it out

1. **Set your links** at the top of `main.js`:
   ```js
   const CONFIG = {
     linkedin: "https://www.linkedin.com/in/johndesouza-/",  // confirm this is your profile
     email: "",     // add your email to show the "Email me" buttons
     resume: "",    // e.g. "assets/john-desouza-resume.pdf" to show "Resume" links
   };
   ```
   Empty values hide their buttons, so nothing looks broken while they're blank.
2. **Confirm colleague names.** Team sections use first names, roles and locations from the deck,
   with initials instead of photos. Remove anyone who would rather not be listed.
3. **Social preview.** The `og:image` and `og:url` meta tags in `index.html` point at
   `https://john-desouza-portfolio.netlify.app`. Once a custom domain is live, swap in that domain.

## Run locally

```bash
python3 -m http.server 4173
```
Then open http://localhost:4173.

## Deploy

The site is a static bundle plus one Vercel Edge Middleware file. Pushing to
`main` deploys it. `middleware.js` gates everything under `/work`; it reads the
password from the `CASE_STUDY_PASSWORD` environment variable, which must be set
in the Vercel project for all environments.

### Legacy

Any static host works. Two easy options:

- **Netlify (current host):** project `john-desouza-portfolio` on the Quicksand Partners team,
  https://app.netlify.com/projects/john-desouza-portfolio. Redeploy with
  `npx netlify-cli deploy --prod --dir . --site c7f93b88-8026-4e09-8acd-b0bd3f67d6a9`
  after `npx netlify-cli login`, or drag the folder onto https://app.netlify.com/drop.
- **Vercel (alternative):** `npx vercel --prod` from this folder.

## Editing content

- Case-study copy lives directly in each `work/*.html` file.
- The impact-chain examples on the home page are the `CHAIN_EXAMPLES` array in `main.js`.
- The originations chart on the Cross-Sell page reads its numbers from the `data-series`
  attribute on the `.chart` element; the table below it is the accessible fallback.
- The three walkthrough animations (`assets/*-walkthrough.webp`) are 1.7 to 5 MB and only load
  when someone presses Play.

## Case-study password

Every page under `work/` is gated by a Netlify edge function (`netlify/edge-functions/gate.js`,
registered in `netlify.toml`). The home page stays public. Visitors see a styled password page;
the right password sets a 30-day cookie scoped to `/work`.

- The password is the `CASE_STUDY_PASSWORD` environment variable on the Netlify project
  (Vercel → Project → Settings → Environment Variables). The value is not stored in this repo.
- To change it, edit the variable and trigger a redeploy. Changing it also logs everyone out,
  because the cookie is derived from the password.
- If the variable is missing, the gate fails closed and shows a "not configured" message.
- Locally (`python3 -m http.server`) there is no edge runtime, so the pages open without a password.

## Custom domain: john-desouza.com

The domain is registered at Squarespace and its DNS is hosted there (nameservers `ns0x.squarespacedns.com`).
Email on the domain runs through Microsoft 365, so only the web records change.

1. **Netlify:** open https://app.netlify.com/projects/john-desouza-portfolio/domain-management →
   *Add a domain* → enter `john-desouza.com` → *Verify* → *Add domain*. Netlify adds both
   `john-desouza.com` and `www.john-desouza.com`. Use *Options → Set as primary domain* on
   `john-desouza.com`.
2. **Squarespace:** Domains → `john-desouza.com` → DNS → *DNS settings*. If the domain is still
   connected to a Squarespace site, disconnect it first (Settings → Domains). Remove the Squarespace
   default web records (the four `@` A records pointing at 198.185.159.x / 198.49.23.x and the `www`
   CNAME to `ext-sq.squarespace.com`), then add:

   | Type  | Host | Data                                   |
   |-------|------|----------------------------------------|
   | A     | @    | 75.2.60.5                              |
   | CNAME | www  | john-desouza-portfolio.netlify.app     |

   Leave the MX record (`*.mail.protection.outlook.com`) and the TXT records (SPF, Microsoft
   verification) exactly as they are.
3. Wait for DNS to propagate (minutes to a few hours). In Netlify's Domain management → HTTPS,
   click *Verify DNS configuration*; the certificate is issued automatically.
4. Once https://john-desouza.com loads, change the `og:image` URL in `index.html` to
   `https://john-desouza.com/og-image.png`, add `<meta property="og:url" content="https://john-desouza.com/">`,
   and redeploy.
