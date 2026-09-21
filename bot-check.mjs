// Checks middleware.js's isBot against real user agents: `node bot-check.mjs`.
//
// isBot decides at the edge, before anything is written down, so a term that
// matches too eagerly loses a reader for good — there is no log to go back to.
// Run this after touching BOT_RE. Both lists are real strings, the browsers
// from what people actually read the site in (the in-app ones LinkedIn and
// Facebook send included) and the robots from what turns up in the log.
import { isBot } from './middleware.js';

// Must be kept: real browsers a reader could actually arrive in.
const PEOPLE = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0',
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/120.0.0.0',
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 Ddg/17.0',
  // The in-app browsers a recruiter actually clicks through in.
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.2',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.35.107;FBBV/700000000]',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 360.0.0.30.98',
  'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/140.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Brave/140',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Vivaldi/7.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Arc/1.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/120.0.0.0 (Edition Yx)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Slack_SSB/4.41.0',
];
// Must be dropped: what actually turns up in a log like his.
const ROBOTS = [
  'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
  'Mozilla/5.0 (compatible; DataForSeoBot/1.0; +https://dataforseo.com/dataforseo-bot)',
  'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)',
  'Screaming Frog SEO Spider/21.0',
  'Go-http-client/2.0',
  'python-requests/2.32.3',
  'Python-urllib/3.12',
  'axios/1.7.9',
  'node-fetch/1.0 (+https://github.com/bitinn/node-fetch)',
  'curl/8.7.1',
  'Wget/1.21.4',
  'okhttp/4.12.0',
  'Apache-HttpClient/4.5.14 (Java/17.0.10)',
  'Java/21.0.2',
  'libwww-perl/6.77',
  'GuzzleHttp/7',
  'PostmanRuntime/7.43.0',
  'Scrapy/2.12.0 (+https://scrapy.org)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Puppeteer',
  'Mozilla/5.0 (compatible; Barracuda Sentinel (EE))',
  'Mozilla/5.0 (compatible; ProofPoint URL Defense)',
  'Mimecast Link Scanner',
  'Microsoft Office Word 2014',
  'Microsoft Office Existence Discovery',
  'Microsoft-CryptoAPI/10.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SafeLinks/1.0',
  'Mozilla/5.0+(compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)',
  'Pingdom.com_bot_version_1.4',
  'Mozilla/5.0 (compatible; Site24x7/1.0)',
  'Datadog/Synthetics',
  'Checkly/1.0 (https://www.checklyhq.com)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Chrome-Lighthouse',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  'LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1)',
  'Twitterbot/1.0',
  'TelegramBot (like TwitterBot)',
  'WhatsApp/2.23.20.0 A',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
  'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
  'Bluesky Cardyb/1.1',
  'Iframely/1.3.1 (+https://iframely.com/docs/about)',
  'vercel-screenshot/1.0',
  'Mozilla/5.0 (compatible; Google-Read-Aloud; +https://support.google.com/webmasters)',
  'Mozilla/5.0 (compatible; GoogleOther)',
  'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 W3C_Validator/1.3',
  '',
];

let bad = 0;
for (const ua of PEOPLE) if (isBot(ua)) { bad++; console.log('FALSE POSITIVE (a reader would be lost):', ua); }
for (const ua of ROBOTS) if (!isBot(ua)) { bad++; console.log('MISSED:', ua || '(empty user agent)'); }
console.log(`${PEOPLE.length} browsers kept, ${ROBOTS.length} robots dropped, ${bad} wrong`);
process.exit(bad ? 1 : 0);
