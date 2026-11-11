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

export const CAMPAIGNS: Record<string, (x: TCtx) => Rendered> = {
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
