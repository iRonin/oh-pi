import * as p from "@clack/prompts";
import chalk from "chalk";
import { emitKeypressEvents } from "node:readline";
import { t } from "../i18n.js";

export interface HorizontalTabItem {
  label: string;
  summary: () => string;
  details?: () => string[];
  edit: () => Promise<void>;
}

interface HorizontalTabsOptions {
  title: string;
  tabs: HorizontalTabItem[];
  canFinish: () => boolean;
  finishBlockedMessage?: () => string;
}

type TabAction = "left" | "right" | "edit" | "finish" | "cancel" | { jump: number };

interface KeypressLike {
  name?: string;
  ctrl?: boolean;
}

function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[H");
}

export function mapTabAction(str: string, key: KeypressLike, tabCount: number): TabAction | null {
  if (key.ctrl && key.name === "c") return "cancel";
  if (key.name === "left") return "left";
  if (key.name === "right") return "right";
  if (key.name === "return" || key.name === "enter" || key.name === "space" || key.name === "e") return "edit";
  if (key.name === "f") return "finish";
  if (/^[1-9]$/.test(str)) {
    const idx = Number(str) - 1;
    if (idx >= 0 && idx < tabCount) return { jump: idx };
  }
  return null;
}

function waitForAction(tabCount: number): Promise<TabAction> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const isRawCapable = !!stdin.isTTY && typeof stdin.setRawMode === "function";
    emitKeypressEvents(stdin);
    if (isRawCapable) stdin.setRawMode(true);

    const done = (action: TabAction) => {
      stdin.off("keypress", onKeypress);
      if (isRawCapable) stdin.setRawMode(false);
      resolve(action);
    };

    const onKeypress = (str: string, key: KeypressLike) => {
      const action = mapTabAction(str, key, tabCount);
      if (action) done(action);
    };

    stdin.on("keypress", onKeypress);
    if (!stdin.isTTY) {
      done("cancel");
    }
  });
}

function renderTabs(
  title: string,
  tabs: HorizontalTabItem[],
  activeIndex: number,
  notice?: string,
): void {
  clearScreen();
  console.log(chalk.bold(title));
  console.log();

  const tabLine = tabs
    .map((tab, i) => {
      const label = `${i + 1}. ${tab.label}`;
      return i === activeIndex
        ? chalk.bgCyan.black(` ${label} `)
        : chalk.gray(` ${label} `);
    })
    .join(chalk.gray("  |  "));
  console.log(tabLine);
  console.log(chalk.dim(t("custom.tabControls")));
  console.log();

  const active = tabs[activeIndex]!;
  console.log(chalk.cyan(active.summary()));
  const details = active.details?.() ?? [];
  for (const line of details) console.log(line);
  if (notice) {
    console.log();
    console.log(chalk.yellow(notice));
  }
}

export async function runHorizontalTabs(opts: HorizontalTabsOptions): Promise<void> {
  const tabs = opts.tabs;
  let activeIndex = 0;
  let notice: string | undefined;

  while (true) {
    renderTabs(opts.title, tabs, activeIndex, notice);
    notice = undefined;

    const action = await waitForAction(tabs.length);
    if (action === "cancel") {
      p.cancel(t("cancelled"));
      process.exit(0);
    }
    if (action === "left") {
      activeIndex = (activeIndex - 1 + tabs.length) % tabs.length;
      continue;
    }
    if (action === "right") {
      activeIndex = (activeIndex + 1) % tabs.length;
      continue;
    }
    if (action === "finish") {
      if (opts.canFinish()) {
        clearScreen();
        return;
      }
      notice = opts.finishBlockedMessage?.() ?? t("custom.needProviders");
      continue;
    }
    if (action === "edit") {
      await tabs[activeIndex]!.edit();
      continue;
    }
    if (typeof action === "object" && "jump" in action) {
      activeIndex = action.jump;
      continue;
    }
  }
}
