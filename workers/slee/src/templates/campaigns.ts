import type { TCtx, Rendered } from "./index";
import { esc } from "./layout";
import { quoteFor } from "./quotes";

/* Editorial-minimal building blocks (campaign layout) */
const PURPLE = "#6427b0";
const label = (t: string) => `<p style="margin:0 0 14px;font:700 11px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.24em;text-transform:uppercase;color:${PURPLE};">${t}</p>`;
const headline = (t: string) => `<h1 style="margin:0 0 18px;font:800 34px/1.12 Helvetica,Arial,sans-serif;letter-spacing:-.02em;color:#0A0A0A;">${t}</h1>`;
const h2 = (t: string) => `<h2 style="margin:0 0 14px;font:800 26px/1.15 Helvetica,Arial,sans-serif;letter-spacing:-.01em;color:#0A0A0A;">${t}</h2>`;
const para = (t: string) => `<p style="margin:0 0 18px;font:16px/1.65 Helvetica,Arial,sans-serif;color:#2A2A2A;">${t}</p>`;
const blackBtn = (href: string, t: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 8px;"><tr><td style="background:#0A0A0A;text-align:center;">
   <a href="${href}" style="display:block;padding:17px 20px;font:700 13px/1 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${t}</a></td></tr></table>`;
const rule = `<div style="height:1px;background:#EAEAEA;margin:44px 0;"></div>`;
const bigNumber = (t: string) => `<p style="margin:6px 0 4px;font:800 52px/1 Helvetica,Arial,sans-serif;letter-spacing:-.03em;color:${PURPLE};">${t}</p>`;
const quoteLine = (t: string) => `<p style="margin:30px 0 0;text-align:center;font:italic 17px/1.5 Georgia,'Times New Roman',serif;color:#0A0A0A;">“${esc(t)}”</p>`;

/**
 * Gift-Yourself Day slots (Singles Day 11.11). Edit names/lines here.
 * Links go to OUR deals page (affiliate links + disclosure live there) — never Amazon links in email.
 */
export const GIFT_SLOTS = [
  { n: "01", name: "The Main Character candle", line: "Light it for no reason at all." },
  { n: "02", name: "The cozy cardigan", line: "Made for nights in, party of one." },
  { n: "03", name: "The solo travel backpack", line: "Packed for one. Ready for anywhere." },
];
const slot = (x: TCtx, s: { n: string; name: string; line: string }) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border-top:1px solid #0A0A0A;"><tr>
   <td style="padding:16px 0 14px;width:52px;vertical-align:top;font:700 12px/1.6 Helvetica,Arial,sans-serif;letter-spacing:.18em;color:${PURPLE};">${s.n}</td>
   <td style="padding:14px 0;vertical-align:top;"><p style="margin:0;font:700 17px/1.35 Helvetica,Arial,sans-serif;color:#0A0A0A;">${esc(s.name)}</p>
     <p style="margin:4px 0 0;font:15px/1.5 Helvetica,Arial,sans-serif;color:#5A5A5A;">${esc(s.line)}</p></td>
   <td style="padding:16px 0 14px;width:70px;text-align:right;vertical-align:top;"><a href="${x.url("/singles-day-deals/")}" style="font:700 11px/1.6 Helvetica,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#0A0A0A;">Shop →</a></td>
  </tr></table>`;

const money = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? "$" + Math.round(n).toLocaleString("en-US") : null;
};

const dealCard = (x: TCtx, tag: string, brand: string, offer: string, detail: string, href: string, cta: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-top:1px solid #0A0A0A;"><tr><td style="padding:16px 0 14px;">
   <p style="margin:0 0 6px;font:700 11px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:${PURPLE};">${tag}</p>
   <p style="margin:0;font:800 20px/1.25 Helvetica,Arial,sans-serif;color:#0A0A0A;">${esc(brand)}: ${esc(offer)}</p>
   <p style="margin:6px 0 10px;font:15px/1.55 Helvetica,Arial,sans-serif;color:#5A5A5A;">${esc(detail)}</p>
   <a href="${x.url(href)}" style="font:700 11px/1.6 Helvetica,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#0A0A0A;">${esc(cta)} →</a>
  </td></tr></table>`;

const dealCardImg = (x: TCtx, tag: string, title: string, detail: string, img: string, alt: string, href: string, cta: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border-top:1px solid #0A0A0A;"><tr>
   <td style="padding:16px 16px 14px 0;width:132px;vertical-align:top;"><a href="${x.url(href)}"><img src="${img}" width="132" alt="${esc(alt)}" style="display:block;width:132px;height:auto;border:0;"></a></td>
   <td style="padding:16px 0 14px;vertical-align:top;">
   <p style="margin:0 0 6px;font:700 11px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.22em;text-transform:uppercase;color:${PURPLE};">${tag}</p>
   <p style="margin:0;font:800 20px/1.25 Helvetica,Arial,sans-serif;color:#0A0A0A;">${esc(title)}</p>
   <p style="margin:6px 0 10px;font:15px/1.55 Helvetica,Arial,sans-serif;color:#5A5A5A;">${esc(detail)}</p>
   <a href="${x.url(href)}" style="font:700 11px/1.6 Helvetica,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#0A0A0A;">${esc(cta)} →</a>
  </td></tr></table>`;

const AMAZON_RED_LIGHT = "https://www.amazon.com/Puroth-Therapy-Infrared-Adjustable-Shoulders/dp/B0HBC7B6LY?crid=CS2FPU4X3FG8&dib=eyJ2IjoiMSJ9.MJRRR1opAlz-tvGzYAnmSV5GAOlWX2Tmv5SH9bXA53KlEAebWerrzh1IYS5Gz-2xaxTL9sKztFTk-gMsALrKjDjQUeBfwaTEzZMKoSf1T-uJiCMHAEUxg93nkK9OJj8bQMWZ55MkWuUtFgnVVSVvjofsNgKRzNCcDByAsJhK5uJ8xmi3dDXMfz1wobPn0fTJuU-hOeKNSS14NjLZA0ZNJoqSK5v6_CIIfL9yRjGaPjAmq8qhWZMSrCvE2cIyaj_aOttV2Bn_JvDcuEYJwd_T3YDMk6qzkI_BbjDV0dk-tvQ.gOy_R1DX-ctefDBFAjesF-HdUohrMFXcpLRoXHER05s&dib_tag=se&keywords=red%2Blight%2Btherapy&qid=1794409761&sprefix=red%2Blight%2Btherap%2Caps%2C200&sr=8-5-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9hdGY&th=1&linkCode=ll2&tag=lifelegallysi-20&linkId=ea1165c0f74bdb0727d3c6c3213df8a9&language=en_US&gaOptInStatus=true&ref_=as_li_ss_tl";

export const CAMPAIGNS: Record<string, (x: TCtx) => Rendered> = {
  /** Nov 11, 2026 — Singles Day / Gift-Yourself Day deals (general audience, no personal data needed) */
  camp_singles_day_2026: (x) => ({
    layout: "campaign",
    subject: "11:11 Single Life Perks. 30% off Alo and more…",
    preheader: "Happy Self-Gift Day. You deserve a self-gift every single day. Today comes with perks.",
    body:
      `<p style="margin:0 0 22px;text-align:center;font:700 15px/1.5 Helvetica,Arial,sans-serif;color:#0A0A0A;">30% off Alo Yoga, Origins, and more · <a href="${x.url("/singles-day-deals/")}" style="color:${PURPLE};">Get them all →</a></p>` +
      `<a href="${x.url("/singles-day-deals/")}" style="text-decoration:none;"><img src="https://legallysingle.com/wp-content/uploads/2026/11/happy-singles-day-self-gift-email-hero-2026.jpg" width="544" alt="Happy Singles Day, now Self-Gift Day. You deserve a self-gift every single day. But today comes with perks." style="display:block;width:100%;max-width:544px;height:auto;border:0;margin:0 0 30px;"></a>` +
      label("11.11 · Today’s perks") +
      dealCardImg(x, "Glow · Self-gift pick", "Red light therapy, at home", "An infrared therapy wrap for shoulders and back. A little daily ritual, just for you.",
        "https://m.media-amazon.com/images/I/71eo6Z3b8iL._AC_SL1500_.jpg", "Puroth red light therapy wrap for shoulders", AMAZON_RED_LIGHT, "Shop on Amazon") +
      `<p style="margin:0 0 24px;font:12px/1.5 Helvetica,Arial,sans-serif;color:#8A8A8A;">As an Amazon Associate, we earn from qualifying purchases.</p>` +
      blackBtn(x.url("/singles-day-deals/"), "Get them all") +
      para(`<strong>Thinking about solo travel?</strong> Check out the deals: <a href="${x.url("/solo-travel/deals/")}" style="color:${PURPLE};">Solo Travel Deals</a>`) +
      `<p style="margin:18px 0 0;font:12px/1.6 Helvetica,Arial,sans-serif;color:#8A8A8A;">Offers checked on each brand’s website. Brands can change or end offers at any time, so confirm the final price at checkout. Some links on our website are affiliate links, which means we may earn a commission at no extra cost to you.</p>` +
      quoteLine(quoteFor(x.c.id)),
  }),

  /** Nov 11, 2026 — Freedom Tax™ 2026 recheck + Gift-Yourself Day (Singles Day) */
  camp_ftax_giftyourself_2026: (x) => {
    const num = money(x.attrs.str_freedom_tax);
    return {
      layout: "campaign",
      subject: num ? `Your Freedom Tax™ was ${num}. Has it changed?` : "Have you checked your 2026 Freedom Tax™ yet?",
      preheader: "The 2026 calculator is live. Two minutes. Free. Plus: it’s Gift-Yourself Day.",
      body:
        label("The Freedom Tax™ · 2026 update") +
        (num
          ? headline("Your number was") + bigNumber(num) + para("That’s what you calculated earlier this year: the yearly price of living single in a world built for two incomes.")
          : headline("What does single life really cost you?")) +
        para("The Freedom Tax™ Calculator is updated for 2026. Run it again and see where you stand now. It takes two minutes, and it’s free.") +
        blackBtn(x.url("/freedom-tax-calculator/"), "Check my 2026 Freedom Tax") +
        rule +
        label("11.11 · Gift-Yourself Day") +
        h2("Today, the only gift list is yours.") +
        para("Singles Day is the one holiday made for people who shop for one. Three picks to start with:") +
        GIFT_SLOTS.map((s) => slot(x, s)).join("") +
        blackBtn(x.url("/singles-day-deals/"), "Shop all Gift-Yourself picks") +
        quoteLine(quoteFor(x.c.id)),
    };
  },
};
