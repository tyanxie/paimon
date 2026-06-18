// 运行时环境检测工具

/** 当前是否运行在 bun --compile 编译的单文件二进制中 */
export const isCompiled = import.meta.path.startsWith("/$bunfs/");
