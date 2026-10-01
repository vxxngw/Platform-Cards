// node scripts/split-metadata.js ~/Downloads/set-1-metadata.json [outDir=metadata]
// Splits the file downloaded by the Admin page into <outDir>/<cardId>.json, ready to pin to IPFS (Pinata).
// Put the card images in <outDir>/images/<cardId>.png and replace <IMAGES_CID> after pinning the images folder.
const fs = require("fs");
const path = require("path");
const [src, out = "metadata"] = process.argv.slice(2);
if (!src) { console.error("usage: node scripts/split-metadata.js <set-N-metadata.json> [outDir]"); process.exit(1); }
const files = JSON.parse(fs.readFileSync(src, "utf8"));
fs.mkdirSync(out, { recursive: true });
for (const [name, json] of Object.entries(files)) fs.writeFileSync(path.join(out, name), JSON.stringify(json, null, 2));
console.log(`wrote ${Object.keys(files).length} files to ${out}/ — pin the folder, then collection.setBaseURI("ipfs://<CID>/")`);
