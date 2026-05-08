"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
/** טוען `functions/.env` או `.env` בשורש הפרויקט (אמולטור / פיתוח בלבד). בפרודקשן משתמשים במשתני סביבה ב-GCP. */
const candidates = [
    node_path_1.default.join(process.cwd(), '.env'),
    node_path_1.default.join(process.cwd(), 'functions', '.env'),
];
for (const envPath of candidates) {
    if ((0, node_fs_1.existsSync)(envPath)) {
        dotenv_1.default.config({ path: envPath });
        break;
    }
}
