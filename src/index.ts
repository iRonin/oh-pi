import chalk from "chalk";
import { selectLanguage, getLocale } from "./i18n.js";
import { t } from "./i18n.js";
import { welcome } from "./tui/welcome.js";
import { selectMode } from "./tui/mode-select.js";
import { setupProviders, type ProviderSetupResult } from "./tui/provider-setup.js";
import { selectPreset } from "./tui/preset-select.js";
import { selectTheme } from "./tui/theme-select.js";
import { selectKeybindings } from "./tui/keybinding-select.js";
import { selectExtensions } from "./tui/extension-select.js";
import { selectAgents } from "./tui/agents-select.js";
import { runHorizontalTabs } from "./tui/horizontal-tabs.js";
import { confirmApply } from "./tui/confirm-apply.js";
import { detectEnv, type EnvInfo } from "./utils/detect.js";
import type { OhPConfig } from "./types.js";
import { EXTENSIONS } from "./registry.js";
type TabbedBaseConfig = Pick<OhPConfig, "theme" | "keybindings" | "extensions" | "prompts" | "agents" | "thinking">;

/**
 * 主入口函数。检测环境、选择语言、展示欢迎界面，根据用户选择的模式执行对应配置流程，最终确认并应用配置。
 */
export async function run() {
  const env = await detectEnv();
  await selectLanguage();
  welcome(env);

  const mode = await selectMode(env);
  let config: OhPConfig;

  if (mode === "quick") {
    config = await quickFlow(env);
  } else if (mode === "preset") {
    config = await presetFlow(env);
  } else {
    config = await customFlow(env);
  }

  config.locale = getLocale();
  await confirmApply(config, env);
}

/**
 * 快速配置流程。仅需设置提供商和主题，其余选项使用推荐默认值。
 * @param env - 当前检测到的环境信息
 * @returns 生成的配置对象
 */
async function quickFlow(env: EnvInfo): Promise<OhPConfig> {
  const providerSetup = await setupProviders(env);
  return {
    ...providerSetup,
    theme: "dark",
    keybindings: "default",
    extensions: ["safe-guard", "git-guard", "auto-session-name", "custom-footer", "compact-header", "auto-update"],
    prompts: ["review", "fix", "explain", "commit", "test"],
    agents: "general-developer",
    thinking: "medium",
  };
}

/**
 * 预设配置流程。用户选择一个预设方案，再配置提供商，合并生成最终配置。
 * @param env - 当前检测到的环境信息
 * @returns 生成的配置对象
 */
async function presetFlow(env: EnvInfo): Promise<OhPConfig> {
  const preset = await selectPreset();
  return runTabbedFlow(env, preset);
}

/**
 * 自定义配置流程。用户逐项选择主题、快捷键、扩展、代理等，并可配置高级选项（如自动压缩阈值）。
 * @param env - 当前检测到的环境信息
 * @returns 生成的配置对象
 */
async function customFlow(env: EnvInfo): Promise<OhPConfig> {
  const defaultExtensions = EXTENSIONS.filter(e => e.default).map(e => e.name);
  return runTabbedFlow(env, {
    theme: "dark",
    keybindings: "default",
    extensions: defaultExtensions,
    prompts: ["review", "fix", "explain", "commit", "test", "refactor", "optimize", "security", "document", "pr"],
    agents: "general-developer",
    thinking: "medium",
  });
}

async function runTabbedFlow(env: EnvInfo, initial: TabbedBaseConfig): Promise<OhPConfig> {
  const defaultExtensions = EXTENSIONS.filter(e => e.default).map(e => e.name);
  let providerSetup: ProviderSetupResult | null = null;
  let theme = initial.theme;
  let keybindings = initial.keybindings;
  let extensions = initial.extensions.length > 0 ? [...initial.extensions] : defaultExtensions;
  let agents = initial.agents;
  await runHorizontalTabs({
    title: t("custom.tabHeader"),
    canFinish: () => !!providerSetup,
    finishBlockedMessage: () => t("custom.needProviders"),
    tabs: [
      {
        label: t("custom.tabProviders"),
        summary: () => summarizeProviders(providerSetup),
        details: () => providerDetails(providerSetup),
        edit: async () => {
          providerSetup = await setupProviders(env);
        },
      },
      {
        label: t("custom.tabAppearance"),
        summary: () => `${t("confirm.theme")} ${theme} · ${t("confirm.keybindings")} ${keybindings}`,
        details: () => [
          `${chalk.dim(t("confirm.theme"))} ${chalk.cyan(theme)}`,
          `${chalk.dim(t("confirm.keybindings"))} ${chalk.cyan(keybindings)}`,
        ],
        edit: async () => {
          theme = await selectTheme();
          keybindings = await selectKeybindings();
        },
      },
      {
        label: t("custom.tabFeatures"),
        summary: () => t("custom.tabFeaturesHint", { count: extensions.length }),
        details: () => [
          chalk.dim(t("confirm.extensions")),
          extensions.length > 0 ? `  ${extensions.join(", ")}` : `  ${t("confirm.none")}`,
        ],
        edit: async () => {
          extensions = await selectExtensions();
        },
      },
      {
        label: t("custom.tabAgents"),
        summary: () => `${t("confirm.agents")} ${agents}`,
        details: () => [
          `${chalk.dim(t("confirm.agents"))} ${chalk.cyan(agents)}`,
          `${chalk.dim(t("confirm.thinking"))} ${chalk.cyan(initial.thinking)}`,
        ],
        edit: async () => {
          agents = await selectAgents();
        },
      },
      {
        label: t("custom.tabFinish"),
        summary: () => t("custom.tabFinishHint"),
        details: () => [
          chalk.dim(t("custom.tabFinishHelp")),
        ],
        edit: async () => {
          // Finish tab is read-only; use key F to complete.
        },
      },
    ],
  });

  if (!providerSetup) {
    throw new Error("Provider setup is required before finishing tabbed flow");
  }
  const finalProviderSetup = providerSetup as ProviderSetupResult;

  return {
    providers: finalProviderSetup.providers,
    providerStrategy: finalProviderSetup.providerStrategy,
    theme,
    keybindings,
    extensions,
    prompts: initial.prompts,
    agents,
    thinking: initial.thinking,
  };
}

function summarizeProviders(setup: ProviderSetupResult | null): string {
  if (!setup) return t("custom.providersUnset");
  if (setup.providerStrategy === "keep") return t("confirm.providerStrategyKeep");
  if (setup.providerStrategy === "add") {
    return setup.providers.length > 0
      ? t("custom.providersAdd", { list: setup.providers.map(p => p.name).join(", ") })
      : t("confirm.providerStrategyAdd");
  }
  if (setup.providers.length === 0) return t("confirm.providerStrategyReplace");
  return t("custom.providersReplace", { list: setup.providers.map(p => p.name).join(", ") });
}

function providerDetails(setup: ProviderSetupResult | null): string[] {
  if (!setup) return [chalk.dim(t("custom.needProviders"))];
  if (setup.providerStrategy === "keep") return [chalk.dim(t("confirm.providerStrategyKeep"))];
  if (setup.providers.length === 0) return [chalk.dim(t("confirm.none"))];

  const primary = setup.providers[0];
  return [
    `${chalk.dim(t("confirm.providerStrategy"))} ${chalk.cyan(setup.providerStrategy)}`,
    `${chalk.dim(t("confirm.providers"))} ${chalk.cyan(setup.providers.map(p => p.name).join(", "))}`,
    `${chalk.dim(t("confirm.model"))} ${chalk.cyan(primary?.defaultModel ?? t("confirm.none"))}`,
  ];
}
