import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://localhost:9030/jobs", { waitUntil: "networkidle" });

const metrics = await page.evaluate(() => {
  const measure = (el, name) => {
    if (!el) return { name, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      name,
      rect: { h: r.height, w: r.width, top: r.top, bottom: r.bottom },
      css: { height: cs.height, minHeight: cs.minHeight, overflow: cs.overflow, overflowY: cs.overflowY },
    };
  };

  const pageContainer = document.querySelector(".page-container");
  return {
    viewport: { w: innerWidth, h: innerHeight },
    doc: {
      scrollH: document.documentElement.scrollHeight,
      scrollW: document.documentElement.scrollWidth,
      clientH: document.documentElement.clientHeight,
    },
    bodyOverflow: getComputedStyle(document.body).overflow,
    root: measure(document.getElementById("root"), "root"),
    shell: measure(document.querySelector("div.flex.h-dvh"), "shell"),
    aside: measure(document.querySelector("aside"), "aside"),
    main: measure(document.querySelector("main"), "main"),
    pageShell: measure(pageContainer?.parentElement ?? null, "pageShell"),
    pageContainer: measure(pageContainer, "pageContainer"),
  };
});

console.log(JSON.stringify(metrics, null, 2));
await browser.close();
