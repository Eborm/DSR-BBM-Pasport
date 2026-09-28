/**
 * Maakt het toetsingsrapport volledig uit code: draait de testsuite met
 * dekkingsmeting, koppelt elke test via zijn suitetitel aan een requirement en
 * schrijft één zelfstandig HTML-bestand. Handmatige wijzigingen in het rapport
 * gaan bij de volgende run verloren; pas de tests of requirements.ts aan.
 *
 *   npm run rapport
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  NIVEAUS,
  REQUIREMENTS,
  suiteTitle,
  type Niveau,
  type Requirement,
} from "../test/helpers/requirements.js";

const ROOT = process.cwd();
const UITVOER_MAP = path.join(ROOT, "rapport");
const RESULTATEN = path.join(UITVOER_MAP, ".resultaten", "tests.json");
const LCOV = path.join(ROOT, "coverage", "lcov.info");
const RAPPORT = path.join(UITVOER_MAP, "toetsingsrapport.html");

// ------------------------------------------------------------------ Invoer

interface MochaTest {
  title: string;
  fullTitle: string;
  file?: string;
  err: { message?: string };
}

interface MochaResultaten {
  tests: MochaTest[];
  passes: MochaTest[];
  failures: MochaTest[];
  pending: MochaTest[];
}

type TestStatus = "geslaagd" | "mislukt" | "open";

interface Testuitkomst {
  /** Suitetitel van het requirement, of undefined als de test bij geen requirement hoort. */
  suite?: string;
  titel: string;
  groep: string;
  bestand: string;
  status: TestStatus;
  melding?: string;
}

interface Dekking {
  bestand: string;
  geraakt: number;
  totaal: number;
}

function draaiTests(): MochaResultaten {
  rmSync(RESULTATEN, { force: true });
  spawnSync("npx hardhat test mocha --coverage", {
    shell: true,
    stdio: "inherit",
    env: { ...process.env, BBM_RAPPORT_UITVOER: RESULTATEN },
  });
  if (!existsSync(RESULTATEN)) {
    throw new Error(`Geen testresultaten gevonden in ${RESULTATEN}; zie de uitvoer hierboven.`);
  }
  return JSON.parse(readFileSync(RESULTATEN, "utf8")) as MochaResultaten;
}

function leesDekking(): Dekking[] {
  if (!existsSync(LCOV)) return [];
  return readFileSync(LCOV, "utf8")
    .split("end_of_record")
    .map((record) => {
      const veld = (naam: string) => record.match(new RegExp(`^${naam}:(.*)$`, "m"))?.[1]?.trim();
      return { bestand: veld("SF") ?? "", geraakt: Number(veld("LH") ?? 0), totaal: Number(veld("LF") ?? 0) };
    })
    .filter((dekking) => dekking.bestand !== "")
    .map((dekking) => ({ ...dekking, bestand: dekking.bestand.replaceAll("\\", "/") }));
}

function codeversie() {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    // Het rapport zelf telt niet mee: dat verandert bij elke run.
    const gewijzigd =
      execSync('git status --porcelain -- . ":(exclude)rapport"', { encoding: "utf8" }).trim() !== "";
    return { commit, gewijzigd };
  } catch {
    return { commit: "onbekend", gewijzigd: true };
  }
}

// --------------------------------------------------------------- Verwerking

/** Zet de Mocha-uitvoer om in uitkomsten per test, in de volgorde waarin ze draaiden. */
function uitkomsten(resultaten: MochaResultaten): Testuitkomst[] {
  const sleutel = (test: MochaTest) => `${test.file}\u0000${test.fullTitle}`;
  const status = new Map<string, TestStatus>();
  for (const test of resultaten.passes) status.set(sleutel(test), "geslaagd");
  for (const test of resultaten.pending) status.set(sleutel(test), "open");
  for (const test of resultaten.failures) status.set(sleutel(test), "mislukt");

  // Een mislukte hook (bijvoorbeeld de fixture) staat alleen in `failures`.
  const alle = [...resultaten.tests];
  for (const test of resultaten.failures) {
    if (!alle.some((bekend) => sleutel(bekend) === sleutel(test))) alle.push(test);
  }

  return alle.map((test) => {
    const suite = REQUIREMENTS.map((r) => suiteTitle(r.id)).find((titel) => test.fullTitle.startsWith(`${titel} `));
    const binnenSuite = suite ? test.fullTitle.slice(suite.length + 1) : test.fullTitle;
    return {
      titel: test.title,
      groep: binnenSuite.slice(0, binnenSuite.length - test.title.length).trim(),
      bestand: test.file ? path.relative(ROOT, test.file).replaceAll("\\", "/") : "",
      status: status.get(sleutel(test)) ?? "mislukt",
      melding: test.err?.message,
      suite,
    };
  });
}

type RequirementStatus = "geslaagd" | "gedeeltelijk" | "open" | "mislukt" | "geen tests";

interface Toetsing {
  requirement: Requirement;
  tests: Testuitkomst[];
  status: RequirementStatus;
  aantal: Record<TestStatus, number>;
}

function tel(tests: Testuitkomst[]): Record<TestStatus, number> {
  return {
    geslaagd: tests.filter((t) => t.status === "geslaagd").length,
    mislukt: tests.filter((t) => t.status === "mislukt").length,
    open: tests.filter((t) => t.status === "open").length,
  };
}

function toets(requirement: Requirement, alle: Testuitkomst[]): Toetsing {
  const tests = alle.filter((t) => t.suite === suiteTitle(requirement.id));
  const aantal = tel(tests);
  const status: RequirementStatus =
    aantal.mislukt > 0
      ? "mislukt"
      : tests.length === 0
        ? "geen tests"
        : aantal.geslaagd === 0
          ? "open"
          : aantal.open > 0
            ? "gedeeltelijk"
            : "geslaagd";
  return { requirement, tests, status, aantal };
}

// ------------------------------------------------------------------- Weergave

const html = (tekst: string) =>
  tekst.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const STATUS: Record<RequirementStatus, { icoon: string; tekst: string; kleur: string }> = {
  geslaagd: { icoon: "✔", tekst: "Alle tests geslaagd", kleur: "ok" },
  gedeeltelijk: { icoon: "◐", tekst: "Gedeeltelijk getoetst", kleur: "neutraal" },
  open: { icoon: "○", tekst: "Nog niet getoetst", kleur: "neutraal" },
  mislukt: { icoon: "✖", tekst: "Tests mislukt", kleur: "fout" },
  "geen tests": { icoon: "–", tekst: "Geen tests", kleur: "neutraal" },
};

const TEST: Record<TestStatus, { icoon: string; tekst: string; kleur: string }> = {
  geslaagd: { icoon: "✔", tekst: "geslaagd", kleur: "ok" },
  mislukt: { icoon: "✖", tekst: "mislukt", kleur: "fout" },
  open: { icoon: "○", tekst: "nog niet gebouwd", kleur: "neutraal" },
};

const niveauLabel = (niveau: Niveau) => niveau.charAt(0).toUpperCase() + niveau.slice(1);

function statuslabel(status: RequirementStatus) {
  const s = STATUS[status];
  return `<span class="status ${s.kleur}"><span aria-hidden="true">${s.icoon}</span> ${s.tekst}</span>`;
}

function aantallen(aantal: Record<TestStatus, number>) {
  return (["geslaagd", "mislukt", "open"] as const)
    .filter((status) => aantal[status] > 0)
    .map((status) => `${aantal[status]} ${TEST[status].tekst}`)
    .join(" · ");
}

function testlijst(tests: Testuitkomst[]) {
  const groepen = [...new Set(tests.map((t) => t.groep))];
  return groepen
    .map((groep) => {
      const items = tests
        .filter((t) => t.groep === groep)
        .map((t) => {
          const s = TEST[t.status];
          const melding = t.status === "mislukt" && t.melding ? `<pre class="melding">${html(t.melding)}</pre>` : "";
          // Open tests krijgen de statustekst zichtbaar achter de titel; de rest alleen voor schermlezers.
          const zichtbaar = t.status === "open" ? ` <em class="stil">(${s.tekst})</em>` : "";
          const voorlezen = t.status === "open" ? "" : `<span class="sr">${s.tekst}:</span>`;
          return `<li class="test"><span class="status ${s.kleur}" title="${s.tekst}"><span aria-hidden="true">${s.icoon}</span>${voorlezen}</span> <span>${html(t.titel)}${zichtbaar}</span>${melding}</li>`;
        })
        .join("\n");
      return `${groep ? `<h4>${html(groep)}</h4>` : ""}<ul class="tests">${items}</ul>`;
    })
    .join("\n");
}

function render(toetsingen: Toetsing[], overig: Testuitkomst[], dekking: Dekking[], versie: ReturnType<typeof codeversie>) {
  const alleTests = [...toetsingen.flatMap((t) => t.tests), ...overig];
  const totaal = tel(alleTests);
  const volledig = toetsingen.filter((t) => t.status === "geslaagd").length;
  const contractDekking = dekking.filter((d) => d.bestand.startsWith("contracts/"));
  const geraakt = contractDekking.reduce((som, d) => som + d.geraakt, 0);
  const regels = contractDekking.reduce((som, d) => som + d.totaal, 0);
  const dekkingPct = regels > 0 ? ((geraakt / regels) * 100).toFixed(1).replace(".", ",") : "–";
  const datum = new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date());

  const samenvatting = toetsingen
    .map(
      (t) => `<tr>
        <td><a href="#${t.requirement.id}">${t.requirement.id}</a></td>
        <td>${html(t.requirement.titel)}</td>
        <td>${niveauLabel(t.requirement.niveau)}</td>
        <td>${statuslabel(t.status)}</td>
        <td class="stil">${aantallen(t.aantal) || "–"}</td>
      </tr>`,
    )
    .join("\n");

  const secties = toetsingen
    .map(
      (t) => `<section class="requirement" id="${t.requirement.id}">
      <h3>${t.requirement.id} · ${html(t.requirement.titel)}</h3>
      <p class="labels"><span class="niveau">${niveauLabel(t.requirement.niveau)}</span> ${statuslabel(t.status)}</p>
      <dl>
        <dt>Requirement</dt><dd>${html(t.requirement.omschrijving)}</dd>
        <dt>Toetscriterium</dt><dd>${html(t.requirement.criterium)}</dd>
        ${t.requirement.beperking ? `<dt>Beperking</dt><dd>${html(t.requirement.beperking)}</dd>` : ""}
        <dt>Testbestand</dt><dd><code>${[...new Set(t.tests.map((x) => x.bestand))].map(html).join(", ") || "–"}</code></dd>
      </dl>
      ${testlijst(t.tests)}
    </section>`,
    )
    .join("\n");

  const overigSectie =
    overig.length > 0
      ? `<section><h2>Tests zonder requirement</h2><p>Deze tests horen bij geen van de acht requirements.</p>${testlijst(overig)}</section>`
      : "";

  const dekkingRijen = contractDekking
    .map(
      (d) =>
        `<tr><td><code>${html(d.bestand)}</code></td><td class="getal">${d.geraakt} / ${d.totaal}</td><td class="getal">${((d.geraakt / d.totaal) * 100).toFixed(1).replace(".", ",")}%</td></tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Toetsingsrapport BBM-paspoort</title>
<style>
  :root {
    --tekst: #1d2521; --stil: #4f5b55; --lijn: #d5dcd8; --vlak: #f4f7f5; --grond: #ffffff;
    --accent: #1f5f8b; --ok: #1e6b3a; --ok-vlak: #e6f2ea; --fout: #a32121; --fout-vlak: #fbeaea;
    --neutraal: #545b58; --neutraal-vlak: #eceeed;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--grond); color: var(--tekst);
    font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 60rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .25rem; }
  h2 { font-size: 1.3rem; margin: 2.75rem 0 .75rem; padding-bottom: .35rem; border-bottom: 2px solid var(--tekst); }
  h3 { font-size: 1.1rem; margin: 0 0 .4rem; }
  h4 { font-size: .8rem; text-transform: uppercase; letter-spacing: .06em; color: var(--stil); margin: 1rem 0 .25rem; }
  a { color: var(--accent); }
  code, pre { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: .88em; }
  .ondertitel { color: var(--stil); margin: 0 0 1.5rem; }
  .meta { display: grid; grid-template-columns: max-content 1fr; gap: .2rem 1rem; margin: 0; padding: 1rem 1.25rem;
    background: var(--vlak); border-radius: 6px; }
  .meta dt { color: var(--stil); } .meta dd { margin: 0; }
  .waarschuwing { color: var(--fout); }
  .kerncijfers { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .75rem; margin: 1.25rem 0; }
  .kerncijfer { border: 1px solid var(--lijn); border-radius: 6px; padding: .75rem 1rem; }
  .kerncijfer strong { display: block; font-size: 1.6rem; font-variant-numeric: tabular-nums; }
  .kerncijfer span { color: var(--stil); font-size: .88rem; }
  .tabel { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: .93rem; }
  th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid var(--lijn); vertical-align: top; }
  th { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: var(--stil); font-weight: 600; }
  .getal { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .stil { color: var(--stil); }
  .status { display: inline-flex; gap: .3rem; align-items: baseline; font-weight: 600; white-space: nowrap; }
  .status.ok { color: var(--ok); } .status.fout { color: var(--fout); } .status.neutraal { color: var(--neutraal); }
  .labels { display: flex; flex-wrap: wrap; gap: .75rem; align-items: baseline; margin: 0 0 .75rem; }
  .niveau { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; border: 1px solid var(--lijn);
    border-radius: 3px; padding: .05rem .45rem; }
  .requirement { border: 1px solid var(--lijn); border-radius: 6px; padding: 1.25rem 1.25rem .75rem; margin: 0 0 1rem;
    break-inside: avoid; }
  .requirement dl { display: grid; grid-template-columns: 9rem 1fr; gap: .3rem 1rem; margin: 0 0 .5rem; }
  .requirement dt { color: var(--stil); } .requirement dd { margin: 0; }
  ul.tests { list-style: none; margin: 0 0 .5rem; padding: 0; }
  li.test { display: grid; grid-template-columns: 1.4rem 1fr; padding: .2rem 0; }
  .melding { grid-column: 2; margin: .35rem 0 .25rem; padding: .6rem .75rem; background: var(--fout-vlak);
    color: var(--fout); border-radius: 4px; white-space: pre-wrap; overflow-x: auto; }
  .niveaus dt { font-weight: 600; } .niveaus dd { margin: 0 0 .5rem; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  footer { margin-top: 3rem; color: var(--stil); font-size: .88rem; }
  @media (max-width: 36rem) { .requirement dl, .meta { grid-template-columns: 1fr; } .requirement dt { margin-top: .4rem; } }
  @media print { main { padding: 0; } a { color: inherit; text-decoration: none; } h2 { break-after: avoid; } }
</style>
</head>
<body>
<main>
  <h1>Toetsingsrapport BBM-paspoort</h1>
  <p class="ondertitel">Proof of Concept · CEL4LIFE · Zuyd Hogeschool</p>

  <dl class="meta">
    <dt>Gegenereerd</dt><dd>${datum}</dd>
    <dt>Codeversie</dt><dd><code>${html(versie.commit)}</code>${versie.gewijzigd ? ` <span class="waarschuwing">met wijzigingen die nog niet zijn vastgelegd in git</span>` : ""}</dd>
    <dt>Reproduceren</dt><dd><code>npm install</code> en daarna <code>npm run rapport</code></dd>
  </dl>

  <h2>Samenvatting</h2>
  <div class="kerncijfers">
    <div class="kerncijfer"><strong>${volledig} van ${toetsingen.length}</strong><span>requirements met alle tests geslaagd</span></div>
    <div class="kerncijfer"><strong>${totaal.geslaagd}</strong><span>tests geslaagd</span></div>
    <div class="kerncijfer"><strong>${totaal.mislukt}</strong><span>tests mislukt</span></div>
    <div class="kerncijfer"><strong>${totaal.open}</strong><span>tests nog niet gebouwd</span></div>
    <div class="kerncijfer"><strong>${dekkingPct}%</strong><span>van de contractcode door tests uitgevoerd</span></div>
  </div>
  <div class="tabel"><table>
    <thead><tr><th>Req.</th><th>Requirement</th><th>Niveau</th><th>Status</th><th>Tests</th></tr></thead>
    <tbody>${samenvatting}</tbody>
  </table></div>

  <h2>Toetsingsniveaus</h2>
  <p>Niet elk requirement is even hard te toetsen. Per requirement staat vooraf vast op welk niveau het wordt getoetst.</p>
  <dl class="niveaus">
    ${(Object.keys(NIVEAUS) as Niveau[]).map((n) => `<dt>${niveauLabel(n)}</dt><dd>${html(NIVEAUS[n])}</dd>`).join("\n")}
  </dl>

  <h2>Per requirement</h2>
  ${secties}
  ${overigSectie}

  <h2>Contractdekking</h2>
  <p>Aandeel van de regels in het smart contract dat minstens één keer door een test is uitgevoerd. Volledige dekking
  betekent dat elke regel is uitgevoerd, niet dat elk denkbaar geval is getest.</p>
  <div class="tabel"><table>
    <thead><tr><th>Bestand</th><th class="getal">Regels</th><th class="getal">Dekking</th></tr></thead>
    <tbody>${dekkingRijen || `<tr><td colspan="3" class="stil">Geen dekkingsgegevens gevonden.</td></tr>`}</tbody>
  </table></div>

  <footer>
    Dit rapport is automatisch gegenereerd uit de testsuite (<code>test/</code>) en de requirements
    (<code>test/helpers/requirements.ts</code>). Wijzigingen in dit bestand gaan bij de volgende run verloren.
  </footer>
</main>
</body>
</html>
`;
}

// ------------------------------------------------------------------- Uitvoer

const resultaten = draaiTests();
const alle = uitkomsten(resultaten);
const toetsingen = REQUIREMENTS.map((requirement) => toets(requirement, alle));
const overig = alle.filter((t) => t.suite === undefined);

mkdirSync(UITVOER_MAP, { recursive: true });
writeFileSync(RAPPORT, render(toetsingen, overig, leesDekking(), codeversie()));

console.log(`\nToetsingsrapport geschreven naar ${path.relative(ROOT, RAPPORT)}`);
for (const t of toetsingen) {
  console.log(`  ${STATUS[t.status].icoon} ${t.requirement.id}  ${STATUS[t.status].tekst.padEnd(22)} ${aantallen(t.aantal)}`);
}

if (resultaten.failures.length > 0) process.exitCode = 1;
