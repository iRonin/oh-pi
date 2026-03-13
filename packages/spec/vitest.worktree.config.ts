import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["packages/spec/tests/**/*.test.ts"],
	},
});
