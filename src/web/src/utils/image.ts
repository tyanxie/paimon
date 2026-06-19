// 图片处理工具函数：压缩、转 base64、校验

/** 支持的图片 MIME 类型 */
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

/** 图片压缩配置 */
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;
const JPEG_QUALITY = 0.85;
/** 压缩后最大尺寸（字节），超过此值会进一步降低质量 */
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/** 附件图片数据（前端使用） */
export interface AttachedImage {
  /** 唯一标识 */
  id: string;
  /** base64 编码的图片数据（不含 data: 前缀） */
  data: string;
  /** MIME 类型 */
  mimeType: string;
  /** 用于预览的 data URL */
  previewUrl: string;
}

/** 生成唯一 ID */
function generateId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 从 File 对象读取并压缩图片，返回 AttachedImage。
 * 使用 Canvas API 进行 resize + 压缩。
 */
export async function processImageFile(file: File): Promise<AttachedImage> {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}`);
  }

  const bitmap = await createImageBitmap(file);
  const { width, height } = calculateResizedDimensions(
    bitmap.width,
    bitmap.height,
    MAX_WIDTH,
    MAX_HEIGHT,
  );

  // 使用 OffscreenCanvas 进行压缩（如果支持），否则 fallback 到普通 Canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // 优先输出 JPEG（体积更小），PNG/GIF 保持原格式
  let outputMime = file.type;
  let quality = JPEG_QUALITY;
  if (file.type !== "image/png" && file.type !== "image/gif") {
    outputMime = "image/jpeg";
  }

  let dataUrl = canvas.toDataURL(outputMime, quality);

  // 如果超过大小限制，逐步降低质量（仅 JPEG/WebP 有效）
  if (outputMime === "image/jpeg" || outputMime === "image/webp") {
    while (estimateBase64Bytes(dataUrl) > MAX_BYTES && quality > 0.3) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL(outputMime, quality);
    }
  }

  // 如果 PNG 太大，转为 JPEG
  if (outputMime === "image/png" && estimateBase64Bytes(dataUrl) > MAX_BYTES) {
    outputMime = "image/jpeg";
    quality = JPEG_QUALITY;
    dataUrl = canvas.toDataURL(outputMime, quality);
    while (estimateBase64Bytes(dataUrl) > MAX_BYTES && quality > 0.3) {
      quality -= 0.1;
      dataUrl = canvas.toDataURL(outputMime, quality);
    }
  }

  // 提取 base64 数据部分（去掉 "data:image/xxx;base64," 前缀）
  const base64Data = dataUrl.split(",")[1];

  return {
    id: generateId(),
    data: base64Data,
    mimeType: outputMime,
    previewUrl: dataUrl,
  };
}

/**
 * 从剪贴板事件中提取图片文件列表
 */
export function getImagesFromClipboard(clipboardData: DataTransfer): File[] {
  const files: File[] = [];
  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i];
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

/** 计算等比缩放后的尺寸 */
function calculateResizedDimensions(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (originalWidth <= maxWidth && originalHeight <= maxHeight) {
    return { width: originalWidth, height: originalHeight };
  }

  const ratio = Math.min(maxWidth / originalWidth, maxHeight / originalHeight);
  return {
    width: Math.round(originalWidth * ratio),
    height: Math.round(originalHeight * ratio),
  };
}

/** 估算 data URL 的实际字节数 */
function estimateBase64Bytes(dataUrl: string): number {
  const base64Part = dataUrl.split(",")[1];
  if (!base64Part) return 0;
  // base64: 每 4 字符 = 3 字节
  return Math.ceil((base64Part.length * 3) / 4);
}
