# Pixel Provenance

Pixel Provenance is a local browser tool for image provenance, metadata inspection, and pixel-level signal review. It reads image bytes, structured metadata, and frequency-domain features to help investigate provenance credentials, generator markers, editing traces, and anomalous pixel statistics.

Images are processed in the browser. There is no backend upload and no build step.

## What It Does

- Checks C2PA / Content Credentials, JUMBF structures, and related byte strings.
- Parses EXIF, XMP, IPTC, ICC, and related metadata fields.
- Looks for specific generator markers from OpenAI, Gemini / SynthID, Midjourney, Stable Diffusion / ComfyUI / Flux, Adobe Firefly, and similar tools.
- Separates AI markers, ordinary provenance credentials, editing traces, and weak heuristic anomalies.
- Shows SHA-256, dimensions, file size, MIME type, and basic image properties.
- Runs frequency analysis in a Web Worker and reports 65 FFT, radial spectrum, phase, LSB, wavelet, and DCT features.
- Re-encodes images locally and can write camera-style EXIF for compatibility testing, metadata cleanup, and robustness checks.

## What It Cannot Prove

Pixel Provenance provides signals, not a final forensic verdict.

- C2PA/JUMBF detection means the file appears to contain provenance structures or related strings; this app does not validate C2PA signatures.
- `DigitalSourceType = digitalCapture` is a metadata claim, not standalone proof that the image came from a real camera.
- Camera model, lens, ISO, shutter, GPS, and similar EXIF fields can be written after the fact.
- Frequency and byte-distribution scores are heuristics, not trained classifiers. Compression, screenshots, resizing, filters, and platform re-encoding can all change them.
- A clean result does not prove an image is non-AI; it only means the current rules did not find readable markers.

## Evidence Levels

| Level | Examples | Interpretation |
| --- | --- | --- |
| Strong signal | C2PA `DigitalSourceType` explicitly declares algorithmic generation; EXIF/XMP directly names a generator | High-priority signal, still best reviewed with signature validation and context |
| Medium signal | Specific vendor or tool markers in bytes or metadata | Useful clue, but may come from export or editing workflows |
| Weak signal | Byte-distribution anomaly, frequency-rule trigger, LSB bias | Triage clue only; not standalone proof |
| Non-AI signal | Photoshop / Lightroom traces | Indicates editing, not AI generation by itself |

## Run Locally

Start a static server from the project directory:

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

## Structure

- `index.html`: main UI.
- `src/main.js`: app entry point, upload flow, tabs, and UI state.
- `src/detect.js`, `src/markers.js`: provenance, marker, and heuristic detection.
- `src/metadata.js`, `src/panel-metadata.js`: metadata parsing, JUMBF sniffing, and rendering.
- `src/frequency/`: frequency features, scoring, Worker, and panel rendering.
- `src/convert.js`, `src/watermark.js`: local re-encoding, camera-style EXIF writing, and perturbation testing.
- `src/i18n.js`: Chinese and English UI / SEO strings.
- `docs/frequency_features.md`: frequency-feature notes.
- `docs/logic_review.md`: review of the code logic and judgment criteria.

## License

MIT License
