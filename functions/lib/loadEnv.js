"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
/**
 * טוען משתני סביבה למחשב מקומי / אמולטור.
 * סדר: קובץ בסיס → `.env.local` (דורס) — סודות לא ב-`functions/.env` כדי שלא ייכנסו לפריסה כ-env רגיל ויתנגשו ב-Secret Manager.
 */
const candidates = [
    node_path_1.default.join(process.cwd(), '.env'),
    node_path_1.default.join(process.cwd(), 'functions', '.env'),
    node_path_1.default.join(process.cwd(), 'functions', '.env.local'),
    node_path_1.default.join(process.cwd(), '.env.local'),
];
for (const envPath of candidates) {
    if ((0, node_fs_1.existsSync)(envPath)) {
        dotenv_1.default.config({ path: envPath, override: true });
    }
}
