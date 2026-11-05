import subModuleMap from '../../shared/sub-modules.json';

/**
 * 行测五大模块的二级分类（子模块）。
 * 与 scripts/classify-submodules.cjs 共用 shared/sub-modules.json，避免前后端口径漂移。
 */
export const SUB_MODULES: Record<string, readonly string[]> = subModuleMap;

export function getSubModules(module: string): readonly string[] {
  return SUB_MODULES[module] || [];
}
