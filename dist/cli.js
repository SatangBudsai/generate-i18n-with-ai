#!/usr/bin/env node

// src/config.ts
import dotenv from "dotenv";
dotenv.config();
var CONFIG = {
  TRANSLATE_ROOT: process.env.TRANSLATE_ROOT || "src/configs/translations",
  SOURCE_LANG: process.env.SOURCE_LANG || "th",
  TARGET_LANGS: (process.env.TARGET_LANGS || "en").split(",").map((lang) => lang.trim()),
  MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE || "100"),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || ""
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
function findAllThJsonFolders(baseDir) {
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
function pathToIdentifier(fullPath) {
  const relativePath = fullPath.replace(TRANSLATE_ROOT + path.sep, "");
  return relativePath.replace(/\\/g, "_").replace(/\//g, "_");
}
function isPathSelected(fullPath) {
  if (args.length === 0)
    return true;
  const identifier = pathToIdentifier(fullPath);
  return args.some((arg) => {
    const argParts = arg.split("|");
    return argParts.some((part) => {
      if (part === identifier)
        return true;
      const lastPart = identifier.split("_").pop();
      if (lastPart === part)
        return true;
      if (identifier.includes(`_${part}_`) || identifier.endsWith(`_${part}`))
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
async function processTranslations() {
  console.log(
    `\u{1F50D} Starting translation script with TRANSLATE_ROOT: ${TRANSLATE_ROOT}`
  );
  if (!fs.existsSync(TRANSLATE_ROOT)) {
    console.error(`\u274C TRANSLATE_ROOT not found: ${TRANSLATE_ROOT}`);
    process.exit(1);
  }
  const folders = findAllThJsonFolders(TRANSLATE_ROOT);
  console.log(
    `\u{1F4C1} Found ${folders.length} folders with ${SOURCE_LANG.toUpperCase()}.json`
  );
  if (folders.length === 0) {
    console.log(`Folders searched in: ${TRANSLATE_ROOT}`);
    console.log(`Current working directory: ${process.cwd()}`);
    process.exit(1);
  }
  for (const folder of folders) {
    const identifier = pathToIdentifier(folder);
    if (!isPathSelected(folder)) {
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
              const translatedBatch = await batchTranslateWithClaude(
                batch,
                lang
              );
              Object.entries(translatedBatch).forEach(
                ([key, translatedText]) => {
                  existingTranslations[key] = translatedText;
                }
              );
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
          const finalJSON = unflatten(orderedFlatEntries);
          fs.writeFileSync(
            langPath,
            JSON.stringify(finalJSON, null, 2),
            "utf-8"
          );
        } catch (error) {
          console.error(`\u274C Error writing ${lang}.json:`, error);
        }
      }
    } catch (error) {
      console.error(`\u274C Error processing folder ${folder}:`, error);
    }
  }
  console.log("\n\u2705 Translation process completed!");
}
processTranslations().catch((error) => {
  console.error("\u274C Script failed with error:", error);
  process.exit(1);
});
