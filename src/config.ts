import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  TRANSLATE_ROOT: process.env.TRANSLATE_ROOT || "src/configs/translations",
  SOURCE_LANG: process.env.SOURCE_LANG || "th",
  TARGET_LANGS: (process.env.TARGET_LANGS || "en")
    .split(",")
    .map((lang) => lang.trim()),
  MAX_BATCH_SIZE: parseInt(process.env.MAX_BATCH_SIZE || "100"),
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
};
