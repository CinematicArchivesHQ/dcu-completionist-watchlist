import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("exports Hall of Justice Archives", async()=>{const html=await readFile(new URL("../out/index.html",import.meta.url),"utf8");assert.match(html,/Hall of Justice Archives/);assert.match(html,/manifest\.webmanifest/);});
test("exports PWA files",async()=>{const [manifest,worker]=await Promise.all([readFile(new URL("../out/manifest.webmanifest",import.meta.url),"utf8"),readFile(new URL("../out/service-worker.js",import.meta.url),"utf8")]);assert.equal(JSON.parse(manifest).name,"Hall of Justice Archives");assert.match(worker,/hall-of-justice-archives-v1/);});
