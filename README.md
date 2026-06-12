# Pixel Provenance

Pixel Provenance 是一个本地运行的图片来源、元数据与像素特征分析工具。它在浏览器中读取图片字节、结构化元数据和频域特征，用于辅助排查图片是否包含来源凭证、生成工具标记、编辑痕迹或异常像素统计信号。

项目不上传图片，不依赖后端，也没有构建步骤。所有分析默认在当前浏览器内完成。

## 能做什么

- 检查 C2PA / Content Credentials、JUMBF 结构和相关字节字符串。
- 解析 EXIF、XMP、IPTC、ICC 等结构化元数据，并展示关键字段。
- 识别 OpenAI、Gemini / SynthID、Midjourney、Stable Diffusion / ComfyUI / Flux、Adobe Firefly 等较明确的生成工具标记。
- 区分 AI 生成标记、普通来源凭证、修图软件痕迹和弱启发式异常，避免把所有命中都算作 AI 证据。
- 计算 SHA-256、文件大小、图片尺寸和基础属性。
- 在 Web Worker 中执行频域分析，输出 FFT、径向功率谱、相位、LSB、小波、DCT 等 65 个特征和启发式评分。
- 本地重编码图片并写入相机样式 EXIF，用于兼容性测试、元数据清理和鲁棒性观察。

## 不能证明什么

Pixel Provenance 给出的是线索，不是鉴定结论。

- 发现 C2PA/JUMBF 只能说明图片中存在来源凭证结构或相关字符串；当前实现不验证 C2PA 签名链。
- 发现 `DigitalSourceType = digitalCapture` 只能说明元数据声明为数字拍摄，不能单独证明图片一定来自真实相机。
- 相机型号、镜头、ISO、快门、GPS 等 EXIF 字段都可以被后期写入，不能单独作为真实性证明。
- 频域评分和字节分布评分是启发式规则，不是训练过的分类器；压缩、截图、缩放、滤镜和社交平台重编码都会改变结果。
- 未发现 AI 标记不代表图片一定不是 AI 生成，只代表当前规则没有命中可读线索。

## 证据分级

| 级别 | 例子 | 解读 |
| --- | --- | --- |
| 强线索 | C2PA `DigitalSourceType` 明确声明算法生成；EXIF/XMP 字段直接写明生成工具 | 可以作为高优先级线索，但仍应结合签名验证和上下文 |
| 中等线索 | 文件字节或元数据中出现明确厂商/工具标记 | 可能来自生成流程，也可能来自后期软件或导出链路 |
| 弱线索 | 字节分布异常、频域规则触发、LSB 偏置 | 只能用于提示进一步检查，不能单独判定来源 |
| 非 AI 线索 | Photoshop / Lightroom 等修图软件痕迹 | 表示图片经过处理，不等同于 AI 生成 |

## 本地运行

这是一个静态页面。由于 ES Modules 和 Web Worker 需要 HTTP 环境，请在项目目录启动本地静态服务器：

```bash
python -m http.server 8000
```

然后打开：

```text
http://localhost:8000
```

## 项目结构

- `index.html`：主界面。
- `src/main.js`：页面入口、上传流程、标签页和交互状态。
- `src/detect.js`、`src/markers.js`：来源凭证、生成工具标记和启发式检测。
- `src/metadata.js`、`src/panel-metadata.js`：元数据解析、JUMBF 嗅探和展示。
- `src/frequency/`：频域特征提取、启发式评分、Worker 和面板渲染。
- `src/convert.js`、`src/watermark.js`：本地重编码、相机样式 EXIF 写入和扰动测试。
- `src/i18n.js`：中英文界面文案和 SEO 文案。
- `docs/frequency_features.md`：频域特征说明。
- `docs/logic_review.md`：代码判断逻辑与依据评估。

## 设计原则

1. 本地优先：图片字节不离开浏览器。
2. 证据分层：强元数据、弱启发式、非 AI 编辑痕迹分开展示。
3. 保守判定：不把普通 C2PA 凭证、Google Pixel EXIF、Photoshop 痕迹或频域异常直接等同于 AI 生成。
4. 可复核：检测规则集中在 `src/markers.js` 和 `src/frequency/score.js`，便于审阅和调整。

## 许可

MIT License
