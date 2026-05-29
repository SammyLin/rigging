# AI Development Standards

> [English](README.md)

**團隊起新系統時的 AI 編碼標準**，使用 progressive disclosure 安裝到 Claude Code、Kiro CLI 或 opencode — 該載的才載，該觸發的才觸發。

**Core Philosophy:** One feature at a time. Verify before moving on. No overengineering.

**Maintainer:** Sammy Lin

## 為什麼要有這個 repo

團隊起新系統時，每個成員的 AI agent 設定不一樣，導致：

- 程式風格不一致
- 有人跑 lint 有人不跑
- `.env` 會被不小心讀進 context
- commit message 各寫各的

這個 repo 把團隊的最佳實踐固化成**一條指令就能裝起來**的標準配置。安裝指令是 **`coderigup`**（npm 上 `rigging` 名字被搶了，所以套件用 `coderigup`，rigging 仍是這個專案的名字）：

```bash
npx coderigup init
```

## 裝了什麼？（Claude Code）

```
.claude/
├── rules/                    ← 規則（Claude 自動載入）
│   ├── ai-behavior.md           核心：5 步驟 flow、commit 頻率
│   ├── code-quality.md          核心：TDD、錯誤處理、typing
│   ├── architecture.md          核心：分層架構、DI
│   └── lang-go.md               語言：依偵測結果裝，paths: 限定只在 Go 檔案載入
├── skills/                   ← 技能（Claude 按需呼叫）
│   ├── security-check/          新增 API、上線前、處理使用者輸入
│   ├── infra-ops/               Docker、CI/CD、git workflow
│   ├── harness-review/          系統性改進
│   ├── browser-verify/          前端視覺驗證
│   └── code-review-expert/      git 變更的 SOLID + 安全審查
├── agents/
│   └── code-reviewer.md      ← Subagent：結構化審查變更
├── commands/
│   ├── commit.md             ← /commit 指令：lint + test + 產生規範化訊息
│   └── review.md             ← /review 指令：呼叫 code-reviewer
├── hooks/
│   ├── auto-format.sh        ← PostToolUse：改完檔自動 format
│   └── secret-guard.sh       ← PreToolUse Bash：擋 .env、rm -rf、curl | sh
└── settings.json             ← 團隊權限 + hooks 掛載
CLAUDE.md                     ← 主檔（短，用 @import 引入規則）
```

## 5 層架構

| 層 | 位置 | 載入時機 | 內容 |
|----|------|---------|------|
| **Core** | `.claude/rules/` | 永遠 | 每個任務都需要 |
| **Language** | `.claude/rules/` | 檔案符合 `paths:` 時 | 語言特定慣例 |
| **Skills** | `.claude/skills/` | Claude 判斷需要時 | 安全、ops、harness、browser |
| **Agent + Commands** | `.claude/agents/` + `.claude/commands/` | 使用者呼叫時 | Verify / Commit 流程 |
| **Hooks + Settings** | `.claude/hooks/` + `.claude/settings.json` | 事件觸發 | 自動 format、擋危險指令 |

### 5 步驟 flow 如何被工具支撐

| 步驟 | Claude Code | Kiro CLI | opencode |
|------|-------------|----------|----------|
| 1. Research | 內建 Explore subagent | 主對話 | 內建 `explore` subagent |
| 2. Plan | 內建 Plan subagent | 主對話 | 主對話 |
| 3. Implement | 主對話 + `auto-format` hook 自動整理 | 主對話 | 主對話（無 hooks） |
| 4. **Verify** | `/review` → `code-reviewer` subagent 獨立審查 | `kiro-cli chat --agent code-reviewer "review current changes"` | `/review` 或 `@code-reviewer` |
| 5. **Commit** | `/commit` → lint + test + 規範化 message | 手動跑 lint/test 後自行 commit（Kiro 無 slash command） | `/commit` → lint + test + 規範化 message |

**為什麼有差：** Kiro CLI 不支援使用者自訂 slash command 或 auto-format hook；opencode 支援 subagent 與 slash command 但沒有 event-hook 系統，所以 `auto-format` 跟 `secret-guard` 不會裝。`code-reviewer` agent 三邊都會裝，只是呼叫方式不同。

## 安裝

```bash
# Claude Code（自動偵測專案語言）
npx coderigup init

# Kiro CLI
npx coderigup init --target kiro

# opencode
npx coderigup init --target opencode

# 三個都裝
npx coderigup init --target all

# rigging 釋出新版後刷新
npx coderigup upgrade --target all

# 移除（保留 user 自編輯的檔案）
npx coderigup uninstall
```

### 語言自動偵測

| 偵測到 | 裝 |
|--------|-----|
| `go.mod` | `lang-go.md` |
| `package.json` | `lang-node.md` |
| `pyproject.toml` / `requirements.txt` | `lang-python.md` |
| `.tsx` / `vite.config.*` / React | `lang-frontend.md` |
| 都沒有 | 全裝 |

## Kiro CLI 的差別

Kiro CLI 跟 Claude Code 的設計模型不完全重疊，對應表：

| Claude Code | Kiro CLI | 狀態 |
|------------|---------|------|
| Rules（`paths:`） | Steering（`inclusion: fileMatch` + `fileMatchPattern`） | ✅ 自動轉換 |
| Skills | Skills (`.kiro/skills/<name>/SKILL.md`) | ✅ 裝在官方規範路徑 |
| Agents（markdown） | Agents（**JSON**） | ✅ 自動轉換格式 |
| Commands（`/commit`） | — | ❌ Kiro CLI 無對應功能 |
| Hooks | Hooks（event 名不同） | ❌ 模型差太多，不硬裝 |
| `settings.json`（專案） | 機器層級設定 | ❌ 不是專案共享 |

## opencode 的差別

> ⚠️ **實驗階段 — 還沒用 opencode 本體驗證過。** 安裝器產出的檔案是照 opencode 官方文件寫的格式（`mode: subagent`、`instructions` glob、command frontmatter），轉換邏輯也有單元測試覆蓋，但**沒有人**真的開過 opencode 跑過裝好的專案，確認它能不抱怨地吃完所有東西。試了之後麻煩[開 issue](https://github.com/SammyLin/rigging/issues) 回報哪些有效、哪些壞掉。

opencode 只會自動載入 `AGENTS.md` 跟在 `opencode.json` `instructions` 欄位列出的檔案，對應表：

| Claude Code | opencode | 狀態 |
|------------|----------|------|
| Rules（`paths:`） | `.opencode/rules/*.md`，由 `opencode.json` `instructions` glob 串起來 | ✅ 永遠載入（opencode 沒有 path-gating） |
| Skills | Skills（`.opencode/skills/<name>/SKILL.md`） | ✅ 跟 Claude 同樣的 frontmatter，原樣裝 |
| Agents（markdown frontmatter） | Agents（`.opencode/agents/<name>.md`，frontmatter 改成 `mode: subagent`） | ✅ 自動轉換格式 |
| Commands（`/commit`） | Commands（`.opencode/commands/<name>.md`） | ✅ 會裝；`allowed-tools` / `argument-hint` 會被丟掉 |
| Hooks | — | ❌ opencode 沒有 event-hook 系統 |
| `settings.json` | `opencode.json`（只寫 `instructions` 欄位，其他都讓使用者自己管） | ✅ 使用者已有 `opencode.json` 時改寫到 sidecar `opencode.rigging.json` |

**`--target all` + AGENTS.md 注意事項：** opencode 與 Claude Code 都會讀專案根目錄的 `AGENTS.md`。為了不互相覆蓋，每個 target 寫自己的 marker 區段（Claude 用 `<!-- rigging:start -->`、opencode 用 `<!-- rigging:opencode:start -->`），兩段在同一個檔案裡並存。

## 標準內容

### Core Rules — 永遠載入

| 檔案 | 內容 |
|------|------|
| [rules/ai-behavior.md](rules/ai-behavior.md) | 5 步驟 flow、commit 頻率、completion report |
| [rules/code-quality.md](rules/code-quality.md) | TDD、錯誤處理、typing、API endpoint 流程 |
| [rules/architecture.md](rules/architecture.md) | 分層架構、DI、模組邊界 |
| [rules/prp-template.md](rules/prp-template.md) | PRP 模板（任務 >3 檔時要先產 PRP） |

### Language Rules — 偵測到才裝

| 檔案 | 語言 | 涵蓋 |
|------|------|------|
| [rules/lang-node.md](rules/lang-node.md) | Node / TypeScript | pnpm、ESLint、Prettier、Zod、vitest |
| [rules/lang-python.md](rules/lang-python.md) | Python | uv、ruff、FastAPI、Pydantic、pytest |
| [rules/lang-go.md](rules/lang-go.md) | Go | go mod、golangci-lint、table-driven tests |
| [rules/lang-frontend.md](rules/lang-frontend.md) | Frontend | React、元件設計、a11y |

### Skills — Claude 按需呼叫

<!-- skills:table:start -->
| Skill | 來源 | 觸發場景 |
|-------|------|---------|
| `security-check` | [skills/security.md](skills/security.md) | 新增 API、上線前、處理使用者輸入 |
| `infra-ops` | [skills/project-ops.md](skills/project-ops.md) | Docker、CI/CD、git workflow |
| `harness-review` | [skills/harness-engineering.md](skills/harness-engineering.md) | 系統性改進 |
| `browser-verify` | [skills/agent-browser-skill.md](skills/agent-browser-skill.md) | 前端視覺驗證 |
| `code-review-expert` | [skills/code-review-expert/](skills/code-review-expert/) | 對當前 git 變更做 SOLID + 安全審查 |
<!-- skills:table:end -->

> 這個表格由 `cli/src/manifest.ts` 產生 —— 改動 skill 清單後請執行 `pnpm gen:docs`，不要手動編輯 markers 之間的內容。

前四個 skill 是單檔來源，安裝時包成 `SKILL.md`；`code-review-expert` 是**目錄式 skill**，原樣 vendor（自帶 `SKILL.md` + `references/`），上游來源見 [skills/code-review-expert/ATTRIBUTION.md](skills/code-review-expert/ATTRIBUTION.md)。

### Agent + Commands — 支撐 Verify / Commit

| 檔案 | 用途 |
|------|------|
| [agents/code-reviewer.md](agents/code-reviewer.md) | Subagent：結構化審查變更（Must Fix / Should Consider / OK） |
| [commands/commit.md](commands/commit.md) | `/commit`：lint + test + 規範化 commit message |
| [commands/review.md](commands/review.md) | `/review`：呼叫 code-reviewer subagent |

### Hooks + Settings

| 檔案 | 觸發 | 做什麼 |
|------|------|-------|
| [hooks/auto-format.sh](hooks/auto-format.sh) | `PostToolUse` Edit/Write | 依副檔名跑 gofmt / ruff / prettier（失敗不擋） |
| [hooks/secret-guard.sh](hooks/secret-guard.sh) | `PreToolUse` Bash | 擋 `.env`、`rm -rf`、`curl \| sh`、SSH key |
| [settings.json](settings.json) | — | 團隊預設權限 + hooks 掛載（裝成 `.claude/settings.json`） |

## 更新

```bash
npx coderigup upgrade --target all
```

## 知識庫 (`docs/`)

解釋背後設計原則的文章，**不**裝進專案：

| 文章 | 主題 |
|------|------|
| [逐步揭露.md](docs/逐步揭露.md) | 為什麼不該一次塞爆 context |
| [context管理.md](docs/context管理.md) | Skills、memory、subagents、compaction |
| [agent-harness-基本原則.md](docs/agent-harness-基本原則.md) | Agent 系統 3 原則 |
| [我可以停掉什麼.md](docs/我可以停掉什麼.md) | 定期檢視什麼還需要 |
| [使用指南.md](docs/使用指南.md) | 團隊使用指南（onboarding、daily workflow、狀況排解） |
| [github調查報告-dotclaude結構.md](docs/github調查報告-dotclaude結構.md) | GitHub 上 `.claude/` 結構的實況調查 |

## 貢獻：語言政策

- **給 AI 看的檔案**（rules、skills、agents、commands、hooks、`CLAUDE.md`）一律用**英文**。
- **給人看的文件**（`docs/`、本 README）可以中英並存。
- **改動 README 時，`README.md` 跟 [`README.zh-TW.md`](README.zh-TW.md) 必須同步更新**。

## License

MIT
