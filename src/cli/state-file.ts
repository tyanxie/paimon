import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** 通过同目录临时文件原子替换 JSON，可按调用方要求限制文件权限 */
export async function writeJsonState(
  target: string,
  state: unknown,
  mode?: number,
): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode });
  if (mode !== undefined) await chmod(temporary, mode);
  await rename(temporary, target);
}
