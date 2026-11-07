import { readFileSync } from "fs";
import { join } from "path";
import { tokens } from "./tokens";

// Guards the brand: every colour token must equal the web's live globals.css value, in both themes.
const css = readFileSync(join(__dirname, "../../../apps/web/src/app/globals.css"), "utf8");
const web = new Map<string, [string, string]>();
for (const m of css.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-f]{3,8}),\s*(#[0-9a-f]{3,8})\)/gi)) web.set(m[1], [m[2].toLowerCase(), m[3].toLowerCase()]);

const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

describe("tokens match globals.css", () => {
  it("parsed the web tokens", () => expect(web.size).toBeGreaterThan(25));

  for (const [name, [light, dark]] of web) {
    it(`--${name}`, () => {
      if (name.startsWith("src-")) {
        const key = name.slice(4) as keyof typeof tokens.light.src;
        expect([tokens.light.src[key], tokens.dark.src[key]]).toEqual([light, dark]);
      } else {
        const key = camel(name) as keyof typeof tokens.light;
        expect([tokens.light[key], tokens.dark[key]]).toEqual([light, dark]);
      }
    });
  }
});
