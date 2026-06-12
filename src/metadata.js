// Structured metadata parsing via exifr, plus a minimal JUMBF sniffer for
// C2PA. exifr is loaded from jsDelivr via dynamic import — no build step,
// no node_modules, and the pure-function parts of this module stay
// import-graph-pure for offline smoke tests.

const EXIFR_URL = '../vendor/exifr-full.esm.mjs';
let _exifrPromise = null;
function loadExifr() {
    return _exifrPromise ||= import(/* @vite-ignore */ EXIFR_URL).then(m => m.default || m);
}

export async function parseMetadata(uint8) {
    try {
        const exifr = await loadExifr();
        const parsed = await exifr.parse(uint8, {
            tiff: true, exif: true, gps: true, ifd0: true, ifd1: false,
            xmp: true, iptc: true, icc: true, jfif: false,
            mergeOutput: true, reviveValues: true,
            translateKeys: true, translateValues: true,
        });
        return parsed || {};
    } catch (err) {
        return { _error: err?.message || String(err) };
    }
}

// JUMBF box structure (ISO 19566-5): 4B BE length + 4B type 'jumb' + UUID + payload.
// We don't parse full structure — we just sniff the 'jumb' magic, then look for
// C2PA labels and DigitalSourceType values in the surrounding ASCII window.
const JMAGIC = [0x6A, 0x75, 0x6D, 0x62]; // "jumb"
const C2PA_LABELS = ['c2pa', 'c2pa.claim', 'c2pa.assertions', 'c2pa.signature', 'c2pa.hash'];
const AI_SOURCE_TYPES = [
    'trainedAlgorithmicMedia',
    'compositeWithTrainedAlgorithmicMedia',
    'algorithmicMedia',
    'dataDrivenMedia',
];
const NON_AI_SOURCE_TYPES = ['digitalCapture', 'digitalCreation', 'composite'];

function readUint32BE(uint8, offset) {
    return ((uint8[offset] << 24) | (uint8[offset + 1] << 16) | (uint8[offset + 2] << 8) | uint8[offset + 3]) >>> 0;
}

function isPlausibleBoxTypeAt(uint8, typeOffset) {
    if (typeOffset < 4) return false;
    const boxStart = typeOffset - 4;
    const size = readUint32BE(uint8, boxStart);
    if (size === 1) {
        // 64-bit largesize: accept only if the high word is zero and the box
        // still fits in the current file. Browser Number precision is enough
        // for the local images handled here, but we keep this conservative.
        if (typeOffset + 12 > uint8.length) return false;
        const hi = readUint32BE(uint8, typeOffset + 4);
        const lo = readUint32BE(uint8, typeOffset + 8);
        return hi === 0 && lo >= 16 && boxStart + lo <= uint8.length;
    }
    if (size === 0) return false; // too loose for embedded image metadata sniffing
    return size >= 8 && boxStart + size <= uint8.length;
}

export function sniffJumbf(uint8) {
    const out = { present: false, digitalSourceType: null, labels: [], indices: [] };
    for (let i = 4; i < uint8.length - 4; i++) {
        if (uint8[i] === JMAGIC[0] && uint8[i+1] === JMAGIC[1]
         && uint8[i+2] === JMAGIC[2] && uint8[i+3] === JMAGIC[3]
         && isPlausibleBoxTypeAt(uint8, i)) {
            out.present = true;
            out.indices.push(i);
            if (out.indices.length >= 16) break;
        }
    }
    if (!out.present) return out;

    const s = Math.max(0, out.indices[0] - 32);
    const e = Math.min(uint8.length, out.indices[out.indices.length - 1] + 65536);
    let txt = '';
    for (let i = s; i < e; i += 65536) {
        txt += String.fromCharCode.apply(null, uint8.subarray(i, Math.min(e, i + 65536)));
    }
    for (const lbl of C2PA_LABELS) if (txt.indexOf(lbl) !== -1) out.labels.push(lbl);
    for (const v of AI_SOURCE_TYPES) if (txt.indexOf(v) !== -1) { out.digitalSourceType = v; break; }
    if (!out.digitalSourceType) {
        for (const v of NON_AI_SOURCE_TYPES) if (txt.indexOf(v) !== -1) { out.digitalSourceType = v; break; }
    }
    return out;
}

export function getGenerationHints(meta) {
    const fields = [];
    const add = (label, val) => {
        if (val == null || val === '') return;
        let s = typeof val === 'object' ? JSON.stringify(val) : String(val);
        if (s.length > 200) s = s.slice(0, 200) + '…';
        fields.push({ label, value: s });
    };
    const keys = ['Software', 'XMPToolkit', 'CreatorTool', 'Creator', 'Make', 'Model',
        'Credit', 'Source', 'Caption', 'Description', 'UserComment', 'ImageDescription',
        'DigitalSourceType', 'digitalSourceType', 'Lens', 'LensModel', 'DateTimeOriginal'];
    for (const k of keys) add(k, meta[k]);
    return fields;
}
