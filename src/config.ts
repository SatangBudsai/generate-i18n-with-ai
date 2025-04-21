// config.ts
import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  // ค่า API KEY ของ Anthropic
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",

  // โฟลเดอร์หลักที่เก็บไฟล์แปล
  TRANSLATE_ROOT: process.env.TRANSLATE_ROOT || "src/configs/translations",

  // ภาษาต้นฉบับ
  SOURCE_LANG: process.env.SOURCE_LANG || "th",

  // ภาษาเป้าหมายที่ต้องการแปล
  TARGET_LANGS: process.env.TARGET_LANGS
    ? process.env.TARGET_LANGS.split(",")
    : ["en"],

  // จำนวน key สูงสุดที่จะส่งไปแปลพร้อมกัน
  MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE || "20"),

  // รูปแบบของโครงสร้างโฟลเดอร์:
  // - "language-first" - โฟลเดอร์แยกตามภาษา (/th/common.json, /en/common.json) สามารถมีโฟลเดอร์ย่อยได้
  // - "nested" - โฟลเดอร์แบบเดิมที่มีไฟล์ภาษาอยู่ในโฟลเดอร์เดียวกัน (th.json, en.json)
  FOLDER_STRUCTURE: process.env.FOLDER_STRUCTURE || "language-first",
};
