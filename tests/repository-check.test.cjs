const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { inspectRepositoryFiles } = require("../scripts/check-repository.cjs");

const validUserscript = `// ==UserScript==
// @version      1.2.3
// @match        https://aihub.top/*
// @grant        GM_getValue
// ==/UserScript==
const SCRIPT_VERSION = '1.2.3';
`;

test("accepts consistent userscript and README versions", () => {
  assert.deepEqual(
    inspectRepositoryFiles({
      userscript: validUserscript,
      readme: "当前版本：`1.2.3`",
    }),
    [],
  );
});

test("reports inconsistent release versions", () => {
  const errors = inspectRepositoryFiles({
    userscript: validUserscript.replace(
      "SCRIPT_VERSION = '1.2.3'",
      "SCRIPT_VERSION = '1.2.4'",
    ),
    readme: "当前版本：`1.2.2`",
  });

  assert.equal(
    errors.some((error) => error.includes("版本不一致")),
    true,
  );
});

test("requires the AIHub match rule and userscript metadata block", () => {
  const errors = inspectRepositoryFiles({
    userscript: "const SCRIPT_VERSION = '1.2.3';",
    readme: "当前版本：`1.2.3`",
  });

  assert.equal(
    errors.some((error) => error.includes("UserScript 元数据块")),
    true,
  );
  assert.equal(
    errors.some((error) => error.includes("https://aihub.top/*")),
    true,
  );
});

test("keeps PR checks read-only and report workflow isolated from pull request code", () => {
  const root = path.resolve(__dirname, "..");
  const check = fs.readFileSync(
    path.join(root, ".github/workflows/pr-check.yml"),
    "utf8",
  );
  const report = fs.readFileSync(
    path.join(root, ".github/workflows/pr-report.yml"),
    "utf8",
  );

  assert.match(check, /permissions:\s*\n\s+contents: read/);
  assert.match(check, /persist-credentials:\s*false/);
  assert.doesNotMatch(check, /pull-requests:\s*write/);
  assert.match(report, /workflow_run:/);
  assert.match(report, /outdated pull request revision/);
  assert.match(report, /pr\.mergeable === null/);
  assert.doesNotMatch(report, /actions\/checkout/);
  assert.doesNotMatch(report, /\brun:/);
});
