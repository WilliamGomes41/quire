import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flourish = "M10 5 C 30 5, 45 15, 85 5 L 88 12 C 55 25, 35 15, 10 32 Z";
const fold = "M85 5 L 78 8";

describe("Q v2 chrome mark", () => {
  it("keeps the locked flourish and the custom Q vectors in the repo", () => {
    expect(existsSync("src/assets/quire-flourish.svg")).toBe(true);
    expect(existsSync("src/assets/quire-q.svg")).toBe(true);
    const flourishSvg = readFileSync("src/assets/quire-flourish.svg", "utf8");
    const qSvg = readFileSync("src/assets/quire-q.svg", "utf8");
    expect(flourishSvg).toMatch(/viewBox="0 0 100 40"/);
    expect(flourishSvg).toContain(flourish);
    expect(flourishSvg).toContain(fold);
    expect(flourishSvg).toMatch(/fill="#1C1814"/);
    expect(flourishSvg).toMatch(/stroke="#FAF7F1"/);
    expect(qSvg).toContain(flourish);
    expect(qSvg).toContain("M354 35Q406 35");
    expect(qSvg).toMatch(/fill="#1C1814"/);
    expect(flourishSvg).not.toMatch(/superdesign|SaaS|lockup/i);
    expect(qSvg).not.toMatch(/superdesign|SaaS|lockup/i);
  });

  it("draws Source Serif Quire with the folded-quire Q and a binding stitch under Qui", () => {
    const mark = readFileSync("src/mark.tsx", "utf8");
    const css = readFileSync("src/styles.css", "utf8");
    expect(mark).toMatch(/productName\.slice\(1\)/);
    expect(mark).toMatch(/role="img"/);
    expect(mark).toMatch(/aria-label=\{productName\}/);
    expect(mark).toContain(flourish);
    expect(mark).toContain(fold);
    expect(mark).toContain("M354 35Q406 35");
    expect(mark).toMatch(/className="quire-mark-q"/);
    expect(mark).toMatch(/className="quire-mark-stitch"/);
    expect(css).toMatch(/\.quire-mark \{[\s\S]*font-family:\s*var\(--font-serif\)/);
    expect(css).toMatch(/\.quire-mark \{[\s\S]*letter-spacing:\s*-0\.06em/);
    expect(css).toMatch(/\.quire-mark \{[\s\S]*font-weight:\s*600/);
    expect(css).toMatch(/\.quire-mark \{[\s\S]*color:\s*var\(--ink\)/);
    expect(css).toMatch(/\.quire-mark-q \{[\s\S]*height:\s*1\.371em/);
    expect(css).toMatch(/\.quire-mark-stitch \{[\s\S]*left:\s*8%/);
    expect(css).toMatch(/\.quire-mark-stitch \{[\s\S]*width:\s*1\.15em/);
    expect(css).toMatch(/\.quire-mark-stitch \{[\s\S]*background:\s*var\(--binding\)/);
    expect(css).toMatch(/\.quire-mark-fold \{[\s\S]*stroke:\s*var\(--paper\)/);
  });

  it("puts Q v2 on Desk and Read chrome, not on the sheet or Press title", () => {
    const keep = readFileSync("src/routes/index.tsx", "utf8");
    const read = readFileSync("src/routes/read.$id.tsx", "utf8");
    const login = readFileSync("src/routes/login.tsx", "utf8");
    const home = keep.slice(keep.indexOf("function Home"), keep.indexOf("function BoundCover"));
    const press = keep.slice(keep.indexOf('className="board press"'), keep.indexOf("function BoundCover"));
    const chrome = read.slice(read.indexOf("stage-chrome"), read.indexOf("stage-well"));

    expect(home).toMatch(/className="site-masthead"/);
    expect(home).toMatch(/<QuireMark/);
    expect(keep).toMatch(/from "\.\.\/mark"/);
    expect(press).toMatch(/<h2>\{pressLabel\}<\/h2>/);
    expect(press).not.toMatch(/QuireMark/);
    expect(chrome).toMatch(/<QuireMark/);
    expect(chrome).toMatch(/aria-label=\{productName\}/);
    expect(read).toMatch(/<p className="masthead">\{page\.cover\.masthead\}<\/p>/);
    expect(read).toMatch(/<span>\{productName\}<\/span>/);
    expect(read.match(/<QuireMark/g)?.length).toBe(2);
    expect(login).not.toMatch(/QuireMark/);
    expect(keep).not.toMatch(/superdesign|Q v2|wordmark lock/i);
    expect(read).not.toMatch(/superdesign|Q v2|wordmark lock/i);
  });

  it("does not change pass 2 tokens or add a third family", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const families = [...root.matchAll(/family=([^:&]+)/g)].map((match) => match[1]);
    expect(css).toMatch(/--paper: #faf7f1;/);
    expect(css).toMatch(/--ink: #1c1814;/);
    expect(css).toMatch(/--binding: #4a5c56;/);
    expect(families).toEqual(["Source+Sans+3", "Source+Serif+4"]);
    expect(css).not.toMatch(/#f3eee4|#3d4a3a|#ffffff|#161513/i);
    expect(css).not.toMatch(/Playfair|Fraunces|Newsreader|Inter["']/);
    expect(css).toMatch(/\.site-masthead \{[\s\S]*font-size:\s*2\.2rem/);
    expect(css).toMatch(/\.masthead \{[\s\S]*font-size:\s*clamp\(3\.25rem,\s*9vw,\s*5rem\)/);
  });
});
