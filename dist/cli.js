#!/usr/bin/env node

// src/config.ts
import dotenv from "dotenv";
dotenv.config();
var CONFIG = {
  // ค่า API KEY ของ Anthropic
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
  // โฟลเดอร์หลักที่เก็บไฟล์แปล
  TRANSLATE_ROOT: process.env.TRANSLATE_ROOT || "src/configs/translations",
  // ภาษาต้นฉบับ
  SOURCE_LANG: process.env.SOURCE_LANG || "th",
  // ภาษาเป้าหมายที่ต้องการแปล
  TARGET_LANGS: process.env.TARGET_LANGS ? process.env.TARGET_LANGS.split(",") : ["en"],
  // จำนวน key สูงสุดที่จะส่งไปแปลพร้อมกัน
  MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE || "20"),
  // รูปแบบของโครงสร้างโฟลเดอร์:
  // - "language-first" - โฟลเดอร์แยกตามภาษา (/th/common.json, /en/common.json) สามารถมีโฟลเดอร์ย่อยได้
  // - "nested" - โฟลเดอร์แบบเดิมที่มีไฟล์ภาษาอยู่ในโฟลเดอร์เดียวกัน (th.json, en.json)
  FOLDER_STRUCTURE: process.env.FOLDER_STRUCTURE || "language-first"
};

// src/cli.ts
import { Anthropic } from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
var TRANSLATE_ROOT = CONFIG.TRANSLATE_ROOT || "src/configs/translations";
var SOURCE_LANG = CONFIG.SOURCE_LANG;
var TARGET_LANGS = CONFIG.TARGET_LANGS || ["en"];
var MAX_BATCH_SIZE = CONFIG.MAX_BATCH_SIZE;
var apiKey = CONFIG.ANTHROPIC_API_KEY;
var FOLDER_STRUCTURE = CONFIG.FOLDER_STRUCTURE || "language-first";
var args = process.argv.slice(2);
var FORCE_WRITE = args.includes("--force");
if (!apiKey)
  throw new Error("\u274C Missing ANTHROPIC_API_KEY in environment");
var anthropic = new Anthropic({ apiKey });
function flatten(obj, prefix = "") {
  let result = [];
  Object.entries(obj).forEach(([key, value]) => {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      result = result.concat(flatten(value, newKey));
    } else if (value !== void 0) {
      result.push([newKey, String(value)]);
    }
  });
  return result;
}
function unflatten(flat) {
  const result = {};
  for (const [key, value] of flat) {
    const parts = key.split(".");
    parts.reduce((acc, part, idx) => {
      if (idx === parts.length - 1) {
        acc[part] = value;
      } else {
        acc[part] = acc[part] || {};
      }
      return acc[part];
    }, result);
  }
  return result;
}
async function batchTranslateWithClaude(keysAndTexts, targetLang) {
  const textsToTranslate = keysAndTexts.map(([key, text]) => `${key}: "${text}"`).join("\n");
  const prompt = `\u0E41\u0E1B\u0E25\u0E20\u0E32\u0E29\u0E32\u0E08\u0E32\u0E01\u0E44\u0E1F\u0E25\u0E4C TH \u0E40\u0E1B\u0E47\u0E19 ${targetLang} \u0E43\u0E2B\u0E49\u0E41\u0E1B\u0E25\u0E15\u0E23\u0E07\u0E46 \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E35\u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E2B\u0E23\u0E37\u0E2D\u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E41\u0E1B\u0E23 \u0E43\u0E2B\u0E49\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E04\u0E33\u0E41\u0E1B\u0E23\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E21\u0E32\u0E30\u0E2A\u0E21\u0E17\u0E35\u0E48\u0E2A\u0E38\u0E14 \u0E2A\u0E33\u0E2B\u0E23\u0E31\u0E1A\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E15\u0E48\u0E2D\u0E44\u0E1B\u0E19\u0E35\u0E49:

${textsToTranslate}

\u0E23\u0E39\u0E1B\u0E41\u0E1A\u0E1A\u0E1C\u0E25\u0E25\u0E31\u0E1E\u0E18\u0E4C\u0E43\u0E2B\u0E49\u0E40\u0E1B\u0E47\u0E19\u0E41\u0E1A\u0E1A key: "\u0E04\u0E33\u0E41\u0E1B\u0E25" \u0E40\u0E2B\u0E21\u0E37\u0E2D\u0E19\u0E02\u0E49\u0E2D\u0E04\u0E27\u0E32\u0E21\u0E02\u0E49\u0E32\u0E07\u0E15\u0E49\u0E19`;
  console.log(`\u{1F4E6} Key Different:`);
  console.table(keysAndTexts.map(([key, text]) => ({ Key: key, Text: text })));
  const response = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 4e3,
    temperature: 0.2,
    messages: [{ role: "user", content: prompt }]
  });
  const content = response.content[0];
  if (!("text" in content)) {
    throw new Error("Unexpected response format from Claude");
  }
  const translatedText = content.text.trim();
  const results = {};
  const lines = translatedText.split("\n").filter((line) => line.trim() !== "");
  for (const line of lines) {
    const match = line.match(/^(.+?):\s*"(.+)"$/);
    if (match && match.length >= 3) {
      const key = match[1].trim();
      const translation = match[2].trim();
      results[key] = translation;
    }
  }
  console.log(`\u{1F4E6} Key Generate:`);
  console.table(
    Object.entries(results).map(([key, text]) => ({
      Key: key,
      Translation: text
    }))
  );
  for (const [key, text] of keysAndTexts) {
    if (!(key in results)) {
      console.warn(`\u26A0\uFE0F Missing translation for key: ${key}, using source text`);
      results[key] = text;
    }
  }
  return results;
}
function findAllNestedThJsonFolders(baseDir) {
  const results = [];
  function recurse(currentPath) {
    try {
      const items = fs.readdirSync(currentPath, { withFileTypes: true });
      const hasSourceLang = items.some(
        (i) => i.isFile() && i.name === `${SOURCE_LANG}.json`
      );
      if (hasSourceLang) {
        results.push(currentPath);
      }
      items.filter((i) => i.isDirectory()).forEach((dir) => recurse(path.join(currentPath, dir.name)));
    } catch (error) {
      console.error(`Error accessing directory ${currentPath}:`, error);
    }
  }
  recurse(baseDir);
  return results;
}
function findAllLanguageFirstJsonFiles(baseDir) {
  const results = [];
  try {
    let scanDirectory = function(currentDir, relativePath = "") {
      const items = fs.readdirSync(currentDir, { withFileTypes: true });
      items.filter((item) => item.isFile() && item.name.endsWith(".json")).forEach((file) => {
        const fileName = file.name;
        const relativeFilePath = relativePath ? path.join(relativePath, fileName) : fileName;
        const fileIdentifier = relativeFilePath.replace(/\.json$/, "").replace(/[\\/]/g, "/");
        const sourcePath = path.join(currentDir, fileName);
        const targetPaths = {};
        for (const lang of TARGET_LANGS) {
          const targetLangDir = path.join(baseDir, lang);
          const targetDir = relativePath ? path.join(targetLangDir, relativePath) : targetLangDir;
          if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
          }
          targetPaths[lang] = path.join(targetDir, fileName);
        }
        results.push({
          sourcePath,
          targetPaths,
          fileIdentifier
        });
      });
      items.filter((item) => item.isDirectory()).forEach((dir) => {
        const newRelativePath = relativePath ? path.join(relativePath, dir.name) : dir.name;
        scanDirectory(path.join(currentDir, dir.name), newRelativePath);
      });
    };
    const sourceLangDir = path.join(baseDir, SOURCE_LANG);
    if (!fs.existsSync(sourceLangDir) || !fs.statSync(sourceLangDir).isDirectory()) {
      console.error(`\u274C Source language directory not found: ${sourceLangDir}`);
      return results;
    }
    scanDirectory(sourceLangDir);
  } catch (error) {
    console.error(`\u274C Error finding language-first JSON files:`, error);
  }
  return results;
}
function pathToIdentifier(fullPath) {
  const relativePath = fullPath.replace(TRANSLATE_ROOT + path.sep, "");
  return relativePath.replace(/\\/g, "/").replace(/\//g, "/");
}
function isPathSelected(identifier) {
  if (args.length === 0)
    return true;
  return args.some((arg) => {
    const argParts = arg.split("|");
    return argParts.some((part) => {
      if (part === identifier)
        return true;
      const parts = identifier.split("/");
      if (parts.includes(part))
        return true;
      if (identifier.includes(`/${part}/`) || identifier.endsWith(`/${part}`))
        return true;
      return false;
    });
  });
}
function chunkIntoBatches(arr, size) {
  return Array.from(
    { length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, i * size + size)
  );
}
async function processNestedStructure() {
  console.log(`\u{1F50D} Processing with nested structure`);
  const folders = findAllNestedThJsonFolders(TRANSLATE_ROOT);
  console.log(
    `\u{1F4C1} Found ${folders.length} folders with ${SOURCE_LANG.toUpperCase()}.json`
  );
  if (folders.length === 0) {
    console.log(`Folders searched in: ${TRANSLATE_ROOT}`);
    console.log(`Current working directory: ${process.cwd()}`);
    return;
  }
  for (const folder of folders) {
    const identifier = pathToIdentifier(folder);
    if (!isPathSelected(identifier)) {
      console.log(`\u23ED\uFE0F Skipping ${identifier} - not selected`);
      continue;
    }
    console.log(`==========================================================`);
    const sourcePath = path.join(folder, `${SOURCE_LANG}.json`);
    console.log(`\u{1F53D} Processing: ${identifier}`);
    try {
      const sourceJSON = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
      const flatSource = flatten(sourceJSON);
      const sourceKeys = flatSource.map(([key]) => key);
      console.log(
        `${SOURCE_LANG.toUpperCase()} source: ${sourceKeys.length} keys`
      );
      for (const lang of TARGET_LANGS) {
        const langPath = path.join(folder, `${lang}.json`);
        let existingFlatEntries = [];
        let keysToTranslate = [];
        let keysToDelete = [];
        if (fs.existsSync(langPath)) {
          try {
            const existingJSON = JSON.parse(fs.readFileSync(langPath, "utf-8"));
            existingFlatEntries = flatten(existingJSON);
            const existingKeys = existingFlatEntries.map(([key]) => key);
            keysToTranslate = sourceKeys.filter(
              (key) => !existingKeys.includes(key)
            );
            keysToDelete = existingKeys.filter(
              (key) => !sourceKeys.includes(key)
            );
            console.log(
              `\u{1F310} ${lang.toUpperCase()}: Found ${existingKeys.length} keys, ${keysToTranslate.length} new keys to translate, ${keysToDelete.length} keys to remove`
            );
          } catch (error) {
            console.error(`\u274C Error reading ${lang}.json:`, error);
            keysToTranslate = sourceKeys;
            existingFlatEntries = [];
          }
        } else {
          keysToTranslate = sourceKeys;
          console.log(
            `\u{1F310} ${lang.toUpperCase()}: No existing file, will translate all ${sourceKeys.length} keys`
          );
        }
        if (keysToTranslate.length === 0 && keysToDelete.length === 0 && !FORCE_WRITE) {
          console.log(`\u2796 No changes needed for ${lang}`);
          continue;
        }
        const existingTranslations = Object.fromEntries(existingFlatEntries);
        keysToDelete.forEach((key) => {
          delete existingTranslations[key];
        });
        await processTranslation(
          flatSource,
          keysToTranslate,
          existingTranslations,
          lang,
          langPath
        );
      }
    } catch (error) {
      console.error(`\u274C Error processing folder ${folder}:`, error);
    }
  }
}
async function processLanguageFirstStructure() {
  console.log(`\u{1F50D} Processing with language-first structure`);
  const files = findAllLanguageFirstJsonFiles(TRANSLATE_ROOT);
  console.log(
    `\u{1F4C1} Found ${files.length} JSON files in ${SOURCE_LANG} directory (including subdirectories)`
  );
  const filesByFolder = {};
  files.forEach((file) => {
    const dirname = path.dirname(file.sourcePath);
    const relativeDirname = dirname.replace(path.join(TRANSLATE_ROOT, SOURCE_LANG), "").replace(/^[\/\\]/, "") || "(root)";
    filesByFolder[relativeDirname] = (filesByFolder[relativeDirname] || 0) + 1;
  });
  if (Object.keys(filesByFolder).length > 0) {
    console.log("\u{1F4C2} Files found in directories:");
    Object.entries(filesByFolder).forEach(([dir, count]) => {
      console.log(`   - ${dir}: ${count} file(s)`);
    });
  }
  if (files.length === 0) {
    console.log(`Files searched in: ${path.join(TRANSLATE_ROOT, SOURCE_LANG)}`);
    console.log(`Current working directory: ${process.cwd()}`);
    return;
  }
  for (const file of files) {
    const { sourcePath, targetPaths, fileIdentifier } = file;
    const relativeSourcePath = sourcePath.replace(path.join(TRANSLATE_ROOT, SOURCE_LANG), "").replace(/^[\/\\]/, "");
    if (!isPathSelected(fileIdentifier)) {
      console.log(
        `\u23ED\uFE0F Skipping ${relativeSourcePath} (ID: ${fileIdentifier}) - not selected`
      );
      continue;
    }
    console.log(`==========================================================`);
    console.log(`\u{1F53D} Processing: ${relativeSourcePath} (ID: ${fileIdentifier})`);
    try {
      const sourceJSON = JSON.parse(fs.readFileSync(sourcePath, "utf-8"));
      const flatSource = flatten(sourceJSON);
      const sourceKeys = flatSource.map(([key]) => key);
      console.log(
        `${SOURCE_LANG.toUpperCase()} source: ${sourceKeys.length} keys`
      );
      for (const lang of TARGET_LANGS) {
        const langPath = targetPaths[lang];
        const relativeLangPath = langPath.replace(path.join(TRANSLATE_ROOT, lang), "").replace(/^[\/\\]/, "");
        let existingFlatEntries = [];
        let keysToTranslate = [];
        let keysToDelete = [];
        if (fs.existsSync(langPath)) {
          try {
            const existingJSON = JSON.parse(fs.readFileSync(langPath, "utf-8"));
            existingFlatEntries = flatten(existingJSON);
            const existingKeys = existingFlatEntries.map(([key]) => key);
            keysToTranslate = sourceKeys.filter(
              (key) => !existingKeys.includes(key)
            );
            keysToDelete = existingKeys.filter(
              (key) => !sourceKeys.includes(key)
            );
            console.log(
              `\u{1F310} ${lang.toUpperCase()}: ${relativeLangPath} - Found ${existingKeys.length} keys, ${keysToTranslate.length} new keys to translate, ${keysToDelete.length} keys to remove`
            );
          } catch (error) {
            console.error(`\u274C Error reading ${relativeLangPath}:`, error);
            keysToTranslate = sourceKeys;
            existingFlatEntries = [];
          }
        } else {
          keysToTranslate = sourceKeys;
          console.log(
            `\u{1F310} ${lang.toUpperCase()}: ${relativeLangPath} - No existing file, will translate all ${sourceKeys.length} keys`
          );
        }
        if (keysToTranslate.length === 0 && keysToDelete.length === 0 && !FORCE_WRITE) {
          console.log(`\u2796 No changes needed for ${lang}/${relativeLangPath}`);
          continue;
        }
        const existingTranslations = Object.fromEntries(existingFlatEntries);
        keysToDelete.forEach((key) => {
          delete existingTranslations[key];
        });
        await processTranslation(
          flatSource,
          keysToTranslate,
          existingTranslations,
          lang,
          langPath
        );
      }
    } catch (error) {
      console.error(`\u274C Error processing file ${relativeSourcePath}:`, error);
    }
  }
}
async function processTranslation(flatSource, keysToTranslate, existingTranslations, lang, outputPath) {
  const keysToTranslateWithText = [];
  for (const key of keysToTranslate) {
    const thText = flatSource.find(([k]) => k === key)?.[1] || "";
    keysToTranslateWithText.push([key, thText]);
  }
  if (keysToTranslateWithText.length > 0) {
    const keyBatches = chunkIntoBatches(
      keysToTranslateWithText,
      MAX_BATCH_SIZE
    );
    for (let i = 0; i < keyBatches.length; i++) {
      const batch = keyBatches[i];
      try {
        const translatedBatch = await batchTranslateWithClaude(batch, lang);
        Object.entries(translatedBatch).forEach(([key, translatedText]) => {
          existingTranslations[key] = translatedText;
        });
      } catch (error) {
        console.error(`\u274C Error translating batch ${i + 1}:`, error);
        console.log(
          `\u26A0\uFE0F Falling back to individual key translation for batch ${i + 1}`
        );
        for (const [key, thText] of batch) {
          try {
            console.log(
              `  \u{1F524} Individually translating: ${key.substring(0, 30)}${key.length > 30 ? "..." : ""}`
            );
            const prompt = `\u0E41\u0E1B\u0E25\u0E20\u0E32\u0E29\u0E32\u0E08\u0E32\u0E01\u0E44\u0E1F\u0E25\u0E4C TH \u0E40\u0E1B\u0E47\u0E19 ${lang} \u0E43\u0E2B\u0E49\u0E41\u0E1B\u0E25\u0E15\u0E23\u0E07\u0E46 \u0E44\u0E21\u0E48\u0E15\u0E49\u0E2D\u0E07\u0E21\u0E35\u0E2D\u0E18\u0E34\u0E1A\u0E32\u0E22\u0E2B\u0E23\u0E37\u0E2D\u0E15\u0E31\u0E27\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E41\u0E1B\u0E23 \u0E43\u0E2B\u0E49\u0E40\u0E25\u0E37\u0E2D\u0E01\u0E04\u0E33\u0E41\u0E1B\u0E23\u0E17\u0E35\u0E48\u0E40\u0E2B\u0E21\u0E32\u0E30\u0E2A\u0E21\u0E17\u0E35\u0E48\u0E2A\u0E38\u0E14:

"${thText}"`;
            const response = await anthropic.messages.create({
              model: "claude-3-haiku-20240307",
              max_tokens: 1e3,
              temperature: 0.2,
              messages: [{ role: "user", content: prompt }]
            });
            const content = response.content[0];
            if ("text" in content) {
              existingTranslations[key] = content.text.trim().replace(/^"|"$/g, "");
            } else {
              existingTranslations[key] = thText;
            }
          } catch (innerError) {
            console.error(`\u274C Error translating key ${key}:`, innerError);
            existingTranslations[key] = thText;
          }
        }
      }
    }
  }
  const orderedFlatEntries = [];
  for (const [key] of flatSource) {
    if (key in existingTranslations) {
      orderedFlatEntries.push([key, existingTranslations[key]]);
    }
  }
  try {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const finalJSON = unflatten(orderedFlatEntries);
    fs.writeFileSync(outputPath, JSON.stringify(finalJSON, null, 2), "utf-8");
    console.log(`\u2705 Written ${path.basename(outputPath)}`);
  } catch (error) {
    console.error(`\u274C Error writing file ${outputPath}:`, error);
  }
}
async function processTranslations() {
  console.log(
    `\u{1F50D} Starting translation script with TRANSLATE_ROOT: ${TRANSLATE_ROOT}`
  );
  if (!fs.existsSync(TRANSLATE_ROOT)) {
    console.error(`\u274C TRANSLATE_ROOT not found: ${TRANSLATE_ROOT}`);
    process.exit(1);
  }
  if (FOLDER_STRUCTURE === "language-first") {
    await processLanguageFirstStructure();
  } else {
    await processNestedStructure();
  }
  console.log("\n\u2705 Translation process completed!");
}
processTranslations().catch((error) => {
  console.error("\u274C Script failed with error:", error);
  process.exit(1);
});
