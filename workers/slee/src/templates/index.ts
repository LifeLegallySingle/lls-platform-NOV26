import type { Contact } from "../env";
import { BRAND, LINKS } from "../config";
import { esc } from "./layout";

export interface TCtx {
  c: Contact;
  attrs: Record<string, unknown>;
  first: string;                                  // "Hi Ana" / "Hi there"
  url: (path: string) => string;                  // tracked link placeholder
}
export interface Rendered { subject: string; preheader: string; body: string }
type Tpl = (x: TCtx) => Rendered;

const p = (s: string) => `<p style="margin:0 0 16px;">${s}</p>`;
const h = (s: string) => `<h1 style="margin:0 0 16px;font:700 24px/1.25 Georgia,'Times New Roman',serif;">${s}</h1>`;
const btn = (x: TCtx, path: string, label: string) =>
  `<p style="margin:24px 0;"><a href="${x.url(path)}" style="display:inline-block;background:${BRAND.ink};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;">${esc(label)}</a></p>`;
const a = (x: TCtx, path: string, label: string) => `<a href="${x.url(path)}" style="color:${BRAND.accent};">${esc(label)}</a>`;

/* ---------- SAH tier copy (one place to edit) ---------- */
const SAH: Record<string, { label: string; meaning: string; next: string }> = {
  TRUE: {
    label: "Single at Heart",
    meaning: "Single life isn't your waiting room — it's where you do your best living. Solitude recharges you, your independence is a feature, and you've built a life on your own terms.",
    next: "The next move is protecting that life: your money, your time, and your people — on purpose.",
  },
  MOSTLY: {
    label: "Single at Heart in more ways than not",
    meaning: "Most of your instincts point toward a full, self-directed single life — with a few places where you're still weighing what you want.",
    next: "The next move is getting clear on which parts of single life you'd never trade.",
  },
  SOME: {
    label: "a few Single-at-Heart instincts",
    meaning: "You've got some single-at-heart strengths — independence, a taste for your own space — alongside a pull toward coupled life.",
    next: "Whatever comes next, those strengths are worth building on now.",
  },
  NOT: {
    label: "not Single at Heart — for now",
    meaning: "Your answers lean toward coupled life, and that's useful self-knowledge — not a verdict.",
    next: "While you're single, you can still make this chapter strong — financially and personally.",
  },
};
const tier = (x: TCtx) => SAH[x.c.sah_tier ?? ""] ?? SAH.MOSTLY;

export const TEMPLATES: Record<string, Tpl> = {
  /* ---------- SAH nurture ---------- */
  sah_nurture_1: (x) => ({
    subject: `What "${tier(x).label}" really means`,
    preheader: "Your Single at Heart result, decoded.",
    body: h(`${x.first}, here's what your result means`) +
      p(`You scored <strong>${esc(x.c.sah_score ?? "")}</strong> on the Single at Heart quiz — <strong>${esc(tier(x).label)}</strong>.`) +
      p(tier(x).meaning) + p(tier(x).next) +
      btn(x, LINKS.selfPartnered, "Explore the Self-Partnered System™"),
  }),
  sah_nurture_2: (x) => ({
    subject: "The cost nobody tells single people about",
    preheader: "It's called the Freedom Tax™ — and it compounds.",
    body: h("The Freedom Tax™") +
      p("Housing, insurance, taxes, travel — most systems are priced for two incomes. Solo earners pay more for the same life, and the gap compounds for decades.") +
      p(x.c.sah_tier === "TRUE" || x.c.sah_tier === "MOSTLY"
        ? "If single life is your long game, this is the single biggest lever on your future freedom."
        : "Whatever your path, knowing your number now protects this chapter.") +
      btn(x, LINKS.freedomTax, "Calculate my Freedom Tax™"),
  }),
  sah_nurture_3: (x) => x.c.glotype
    ? {
        subject: "Your next Power Move",
        preheader: "One small action, picked for you.",
        body: h(`${x.first}, ready for a Power Move?`) +
          p(`You know your GloType™ (${esc(x.c.glotype)}). Power Moves turn that self-knowledge into one concrete action across Mind, Body, Heart, Glow or Wallet.`) +
          btn(x, LINKS.powerMove, "Get my Power Move"),
      }
    : {
        subject: "You know your heart. Now find your Glow.",
        preheader: "GloType™ maps how you recharge, connect and grow.",
        body: h("Find your GloType™") +
          p("Single at Heart tells you <em>whether</em> single life fits. GloType™ shows <em>how</em> you thrive in it — across Mind, Body, Heart and Glow.") +
          btn(x, LINKS.glotype, "Discover my GloType™"),
      },
  sah_nurture_4: (x) => ({
    subject: "Your solo life, fully built",
    preheader: "Money, travel, people — all in one place.",
    body: h("Build the whole life") +
      p(`Everything on ${esc(BRAND.name)} is built for people living single on purpose:`) +
      `<ul style="margin:0 0 16px;padding-left:20px;">
        <li>${a(x, LINKS.unweddedWallet, "UnWedded Wallet™")} — money moves for solo earners</li>
        <li>${a(x, LINKS.soloTravel, "Solo Travel")} — go anywhere, on your terms</li>
        <li>${a(x, LINKS.community, "Community")} — your people, chosen</li>
      </ul>` +
      btn(x, LINKS.dashboard, "Open my dashboard"),
  }),

  /* ---------- Power Move ---------- */
  pm_1: (x) => ({
    subject: `Your ${x.c.power_move ?? "Power"} Move starts now`,
    preheader: "Small move. Real momentum.",
    body: h(`${x.first}, you picked ${esc(x.c.power_move ?? "your")} Power Move`) +
      p("The best moves are small enough to do this week. Do it, then come back for the next one — momentum compounds just like money.") +
      btn(x, LINKS.powerMove, "See my Power Move"),
  }),
  pm_2: (x) => x.c.sah_score == null
    ? {
        subject: "Are you Single at Heart?",
        preheader: "A 3-minute quiz based on Dr. Bella DePaulo's work.",
        body: h("Are you Single at Heart?") +
          p("Some people don't just tolerate single life — they thrive in it. Find out where you land.") +
          btn(x, LINKS.sahQuiz, "Take the quiz"),
      }
    : {
        subject: "Your next Power Move is ready",
        preheader: "Keep the streak going.",
        body: h("Next move") + p("You've done one. Here's the next.") + btn(x, LINKS.powerMove, "Get my next Power Move"),
      },

  /* ---------- GloType ---------- */
  glo_1: (x) => ({
    subject: `Living as a ${x.c.glotype ?? "GloType"}`,
    preheader: "How your element shapes your best single life.",
    body: h(`${x.first}, you're ${esc(x.c.glotype ?? "one of a kind")}`) +
      p("Your GloType™ element shows how you recharge, connect and grow across Mind, Body, Heart and Glow.") +
      (x.c.sah_score == null
        ? p("Next: see how deeply single life fits you.") + btn(x, LINKS.sahQuiz, "Am I Single at Heart?")
        : btn(x, LINKS.powerMove, "Turn it into a Power Move")),
  }),

  /* ---------- Freedom Tax ---------- */
  ft_1: (x) => ({
    subject: "About your Freedom Tax™ number",
    preheader: "What it means — and how to shrink it.",
    body: h("Your number is a starting point") +
      p("The Freedom Tax™ is the compounding premium solo earners pay in systems built for two incomes. The good news: much of it is controllable.") +
      btn(x, LINKS.unweddedWallet, "Start with UnWedded Wallet™"),
  }),
  ft_2: (x) => ({
    subject: "3 places solo earners overpay",
    preheader: "Housing, insurance, and taxes — start here.",
    body: h("Where the gap hides") +
      p("Housing, insurance and taxes are where the solo premium usually hides. One review a year can claw a lot of it back.") +
      btn(x, LINKS.unweddedWallet, "See the UnWedded Wallet™ guides"),
  }),

  /* ---------- Welcome ---------- */
  welcome_1: (x) => ({
    subject: "Welcome — being single is a Power Move",
    preheader: "Pick your door.",
    body: h(`Welcome${x.c.firstname ? ", " + esc(x.c.firstname) : ""}`) +
      p(`${esc(BRAND.name)} is for people building a full life on their own terms. Start wherever fits:`) +
      `<ul style="margin:0 0 16px;padding-left:20px;">
        <li>${a(x, LINKS.sahQuiz, "Are you Single at Heart?")} — the 3-minute quiz</li>
        <li>${a(x, LINKS.glotype, "Find your GloType™")}</li>
        <li>${a(x, LINKS.freedomTax, "Calculate your Freedom Tax™")}</li>
      </ul>`,
  }),
  welcome_2: (x) => ({
    subject: "Start here: are you Single at Heart?",
    preheader: "The quiz most people take first.",
    body: h("The best first step") +
      p("The Single at Heart quiz shows how naturally single life fits you — and everything we send after is tailored to your result.") +
      btn(x, LINKS.sahQuiz, "Take the quiz"),
  }),

  /* ---------- Form confirmations (instant) ---------- */
  memes_1: (x) => ({
    subject: "Your Single Memes are here",
    preheader: "We got you. Laugh first, then pass them on.",
    body: h("We got you.") +
      p("Here are the memes, as promised: funny, relatable, and made for people who love their single life.") +
      btn(x, "/single-memes/", "See the Single Memes") +
      p(`Need more? The ${a(x, "/valentines-day-memes/", "Valentine’s Day memes")} are for the day everyone else is booked.`) +
      p(`Curious how deeply single life suits you? Take the 2-minute ${a(x, LINKS.sahQuiz, "Single at Heart quiz")}.`),
  }),

  deals_1: (x) => ({
    subject: "You’re on the Singles Only deal list",
    preheader: "Deals picked for people who shop for one.",
    body: h("You’re in.") +
      p("You’ll be first to hear about exclusive Singles Only offers: deals picked for people who shop for one, travel solo and treat themselves on purpose.") +
      p("Singles Day is the one shopping holiday made for us. Start with this year’s picks:") +
      btn(x, "/singles-day-deals/", "See the Singles Day deals") +
      p(`Curious how deeply single life suits you? Take the 2-minute ${a(x, LINKS.sahQuiz, "Single at Heart quiz")}.`),
  }),

  /* ---------- Re-engagement (legacy, pre-HUB) ---------- */
  re_1: (x) => ({
    subject: "We built something for you",
    preheader: "A new home for people living single on purpose.",
    body: h(`${x.first} — it's been a while`) +
      p(`${esc(BRAND.name)} has grown into a full platform for single life: money, travel, self-discovery and community.`) +
      p("The best place to start is a 3-minute quiz: are you Single at Heart?") +
      btn(x, LINKS.sahQuiz, "Take the quiz"),
  }),
  re_2: (x) => ({
    subject: "The Freedom Tax™: what single life really costs",
    preheader: "Most solo earners never see this number.",
    body: h("What's your Freedom Tax™?") +
      p("Systems built for two incomes charge solo earners more for the same life — and it compounds. Find your number in a minute.") +
      btn(x, LINKS.freedomTax, "Calculate my Freedom Tax™"),
  }),
  re_3: (x) => ({
    subject: "Should we keep in touch?",
    preheader: "One click to stay — otherwise we'll stop emailing.",
    body: h("Stay or go — your call") +
      p("We only want to be in inboxes that want us. If you'd like to keep hearing from us, tap below. If not, you don't need to do anything — we'll stop emailing you soon.") +
      btn(x, LINKS.sahQuiz, "Yes, keep me in"),
  }),
};
