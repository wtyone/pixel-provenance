// Provenance detection: JUMBF + structured metadata + byte-level keyword search.
// Returns a list of detection cards plus a merged metadata snapshot.

import { bytesToString } from './utils.js';
import { parseMetadata, sniffJumbf, getGenerationHints } from './metadata.js';
import { detectWatermarkFFT } from './watermark-detect.js';
import { MARKERS } from './markers.js';

function findWithContext(str, keywords) {
    const results = [];
    const seen = new Set();
    const haystack = str.toLowerCase();
    for (const kw of keywords) {
        const lk = kw.toLowerCase();
        if (seen.has(lk)) continue;
        const idx = haystack.indexOf(lk);
        if (idx !== -1) {
            seen.add(lk);
            const start = Math.max(0, idx - 30);
            const end = Math.min(str.length, idx + kw.length + 30);
            const context = str.substring(start, end).replace(/[\x00-\x08\x0e-\x1f]/g, '.');
            results.push({ keyword: kw, context });
        }
    }
    return results;
}

function detailOf(found) {
    return found.map(f => `[${f.keyword}] …${f.context}…`).join('\n');
}

function card(title, hit, badgeText, desc, detail, confidence) {
    return {
        title, hit,
        badgeText,
        badgeClass: hit ? 'badge-hit' : 'badge-clean',
        desc,
        detail: detail || null,
        confidence: confidence || null,
    };
}

function readableMetaKeys(meta) {
    return Object.keys(meta || {}).filter(k => !k.startsWith('_') && meta[k] != null && meta[k] !== '');
}

function metadataSearchText(meta) {
    const parts = [];
    let size = 0;
    for (const k of readableMetaKeys(meta)) {
        let value;
        try {
            value = typeof meta[k] === 'object' ? JSON.stringify(meta[k]) : String(meta[k]);
        } catch {
            continue;
        }
        if (!value) continue;
        const chunk = `${k}: ${value.slice(0, 2000)}`;
        parts.push(chunk);
        size += chunk.length;
        if (size > 50000) break;
    }
    return parts.join('\n');
}

export async function runAllDetections(uint8, opts = {}) {
    const str = bytesToString(uint8);
    const [meta, jumbf] = await Promise.all([
        opts.meta ? Promise.resolve(opts.meta) : parseMetadata(uint8),
        opts.jumbf ? Promise.resolve(opts.jumbf) : Promise.resolve(sniffJumbf(uint8)),
    ]);
    const detections = [];

    // --- 1. C2PA (structured: JUMBF box + DigitalSourceType) ---
    {
        const m = MARKERS.find(x => x.id === 'c2pa');
        const found = findWithContext(str, m.keywords);
        const hit = jumbf.present || found.length > 0;
        const aiType = jumbf.digitalSourceType && ['trainedAlgorithmicMedia',
            'compositeWithTrainedAlgorithmicMedia', 'algorithmicMedia', 'dataDrivenMedia']
            .includes(jumbf.digitalSourceType);
        let badgeText, desc, confidence;
        if (aiType) {
            badgeText = `C2PA 声明为 AI 生成 (${jumbf.digitalSourceType})`;
            desc = '图片嵌入了 C2PA 来源凭证,并明确声明为算法生成内容。';
            confidence = 'strong';
        } else if (jumbf.present) {
            badgeText = `C2PA 存在 (${jumbf.digitalSourceType || '来源未声明'})`;
            desc = '图片嵌入了 C2PA 来源凭证。' + (jumbf.labels.length ? ` Labels: ${jumbf.labels.join(', ')}` : '');
            confidence = 'strong';
        } else if (found.length > 0) {
            badgeText = '字节中含 C2PA 字符串';
            desc = '文件字节中出现 C2PA 相关字符串,但未发现完整 JUMBF 结构。';
            confidence = 'weak';
        } else {
            badgeText = '未发现';
            desc = m.missDesc;
        }
        const details = [];
        if (jumbf.present) details.push(`JUMBF boxes: ${jumbf.indices.length}  |  labels: ${jumbf.labels.join(', ') || '-'}  |  DigitalSourceType: ${jumbf.digitalSourceType || '-'}`);
        if (found.length) details.push(detailOf(found));
        detections.push({
            ...card(m.title, hit, badgeText, desc, details.join('\n\n') || null, confidence),
            category: aiType ? 'ai' : 'provenance',
        });
    }

    // --- 2. Structured metadata (EXIF/XMP/IPTC/ICC via exifr) ---
    {
        const hints = getGenerationHints(meta);
        const aiStrings = /Gemini|Imagen|SynthID|Midjourney|Stable\s*Diffusion|ComfyUI|DALL|OpenAI|Firefly|Adobe Firefly|trainedAlgorithmicMedia/i;
        const allMetaText = metadataSearchText(meta);
        const hit = hints.some(h => aiStrings.test(String(h.value))) || aiStrings.test(allMetaText);
        const hasAny = readableMetaKeys(meta).length > 0;
        const metaLine = hints.map(h => `${h.label}: ${h.value}`).join('\n');
        detections.push({
            ...card(
            '结构化元数据 (EXIF / XMP / IPTC)',
            hit,
            hit ? '元数据命中 AI 生成工具' : hasAny ? '存在元数据,但未命中 AI' : '无可读元数据',
            hit ? '图片元数据字段直接记录了 AI 生成工具或标记。'
                : hasAny ? '提取到的元数据字段未匹配 AI 生成标记。'
                : '图片几乎不含元数据(可能被剥离)。',
            metaLine || null,
            hit ? 'strong' : null,
            ),
            category: hit ? 'ai' : 'metadata',
        });
    }

    // --- 3-7. Keyword-based per-vendor markers ---
    for (const m of MARKERS) {
        if (m.id === 'c2pa') continue; // handled above
        const found = findWithContext(str, m.keywords);
        const threshold = m.hitThreshold || 1;
        const hit = found.length >= threshold;
        const isEdit = m.category === 'edit';
        detections.push({
            ...card(
                m.title, hit,
                hit ? (isEdit ? '发现修图痕迹' : '发现标记') : '未发现',
                hit ? m.hitDesc(found) : m.missDesc,
                found.length ? detailOf(found) : null,
                hit ? (isEdit ? 'info' : 'medium') : null,
            ),
            category: m.category || 'ai',
        });
    }

    // --- 8. Byte-level distribution heuristic ---
    // This is intentionally weak: it scans compressed file bytes, not decoded
    // pixels. JPEG re-encoding, metadata injection, screenshots, and ordinary
    // post-processing can all move these metrics.
    {
        const wm = detectWatermarkFFT(uint8);
        detections.push({
            ...card(
                'File-byte distribution heuristic',
                wm.suspicious,
                wm.suspicious ? `Weak signal (${wm.score}%)` : 'No obvious anomaly',
                wm.suspicious
                    ? 'Compressed file bytes differ from the common-image baseline. This may come from JPEG re-encoding, metadata writing, editing, screenshots, or an invisible watermark. It is not standalone proof of a watermark.'
                    : 'Compressed file bytes did not reach the anomaly threshold.',
                `Score: ${wm.score}%
High-frequency ratio: ${wm.highFreqRatio.toFixed(4)}
Mid-frequency peaks: ${wm.midFreqPeaks}
LSB bias: ${wm.lsbBias.toFixed(4)}`,
                wm.suspicious ? 'weak' : null,
            ),
            category: 'heuristic',
        });
    }

    return { detections, meta, jumbf };
}
