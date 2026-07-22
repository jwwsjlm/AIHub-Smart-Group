const fs = require("node:fs");
const path = require("node:path");

function extract(text, pattern) {
  return String(text || "").match(pattern)?.[1] || "";
}

function inspectRepositoryFiles({ userscript, readme }) {
  const errors = [];
  const metadataVersion = extract(userscript, /^\/\/ @version\s+(\S+)/m);
  const runtimeVersion = extract(userscript, /SCRIPT_VERSION\s*=\s*'([^']+)'/);
  const readmeVersion = extract(readme, /当前版本：`([^`]+)`/);

  if (!/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/.test(userscript)) {
    errors.push("缺少有效的 UserScript 元数据块");
  }
  if (!/^\/\/ @match\s+https:\/\/aihub\.top\/\*/m.test(userscript)) {
    errors.push("缺少 @match https://aihub.top/*");
  }
  if (!metadataVersion || !runtimeVersion || !readmeVersion) {
    errors.push("无法读取脚本元数据、运行时或 README 版本");
  } else if (
    new Set([metadataVersion, runtimeVersion, readmeVersion]).size !== 1
  ) {
    errors.push(
      `版本不一致：metadata=${metadataVersion}, runtime=${runtimeVersion}, README=${readmeVersion}`,
    );
  }
  return errors;
}

function main(root = path.resolve(__dirname, "..")) {
  const errors = inspectRepositoryFiles({
    userscript: fs.readFileSync(
      path.join(root, "aihub-smart-group.user.js"),
      "utf8",
    ),
    readme: fs.readFileSync(path.join(root, "README.md"), "utf8"),
  });
  if (errors.length) {
    for (const error of errors) process.stderr.write(`ERROR: ${error}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Repository checks passed.\n");
}

module.exports = { inspectRepositoryFiles, main };

if (require.main === module) main();
