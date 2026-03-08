/**
 * Resource path resolver — locates resource files from sibling workspace packages.
 *
 * Uses createRequire to resolve installed package paths, which works both
 * in development (workspace:* links) and after publishing (real npm installs).
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Resolve a subpath within an installed npm package.
 * @param pkg - Package name (e.g. "@ifiokjr/oh-pi-themes")
 * @param subpath - Relative path within the package (e.g. "themes")
 * @returns Absolute path to the resolved directory/file
 */
function resolvePackagePath(pkg: string, subpath: string): string {
	const pkgJson = require.resolve(`${pkg}/package.json`);
	return join(dirname(pkgJson), subpath);
}

/** Resource path mapping — resolves paths into installed workspace packages. */
export const resources = {
	agent: (name: string) => join(resolvePackagePath("@ifiokjr/oh-pi-agents", "agents"), `${name}.md`),
	extension: (name: string) => join(resolvePackagePath("@ifiokjr/oh-pi-extensions", "extensions"), name),
	extensionFile: (name: string) => join(resolvePackagePath("@ifiokjr/oh-pi-extensions", "extensions"), `${name}.ts`),
	antColonyDir: () => resolvePackagePath("@ifiokjr/oh-pi-ant-colony", "extensions/ant-colony"),
	prompt: (name: string) => join(resolvePackagePath("@ifiokjr/oh-pi-prompts", "prompts"), `${name}.md`),
	skill: (name: string) => join(resolvePackagePath("@ifiokjr/oh-pi-skills", "skills"), name),
	skillsDir: () => resolvePackagePath("@ifiokjr/oh-pi-skills", "skills"),
	theme: (name: string) => join(resolvePackagePath("@ifiokjr/oh-pi-themes", "themes"), `${name}.json`),
};
