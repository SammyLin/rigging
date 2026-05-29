# GitHub 上 `.claude/` 結構的實況調查報告

> 2026-04 調查。涵蓋 agents、commands、hooks、settings.json 在公開 repo 的實際使用情況，用來決定我們的團隊標準要裝什麼、不裝什麼。

---

## 資料規模

| 項目 | GitHub 公開 repo 數 |
|------|------|
| `.claude/agents/*.md` | ~7,800 |
| `.claude/commands/*.md` | ~44,000 |
| `.claude/settings.json` | ~3,700 |
| `.claude/hooks/*` | ~1,400 |

數字差異已經暗示重點：**commands 是大眾工具**（低門檻、即時價值），**hooks + settings 是進階使用者**，**agents 介於中間**。

---

## 1. Agents

### 最常見的 7 種（依檔名頻率）

| 名稱 | 出現 repo 數 | 用途 |
|------|-------------|------|
| `reviewer` / `code-reviewer` | 1,672 / 956 | PR / diff 審查 |
| `architect` | 1,208 | 高層設計、拆任務 |
| `debugger` | 928 | 找 bug 根因 |
| `researcher` | 832 | 探索 codebase |
| `*-test-writer`（minitest / vitest / kotest …） | 640 | 生成測試 |
| `doc-writer` | 183+ | 同步文件 |
| `refactorer` / `code-refactorer` | 124+ | 不改行為的重寫 |

### Frontmatter 慣例

3,840 個 agent 檔案使用這組 frontmatter，幾乎成為事實標準：

```yaml
---
name: code-reviewer
description: 觸發描述（orchestrator 會用自然語言比對）
tools: Read, Grep, Glob, Bash
model: sonnet | haiku | opus
---
```

- **`description` 就是觸發詞**。寫得越像使用者會問的話，Claude 越容易自動呼叫
- **檔案長度**：50–200 行。太短沒有 role 感，太長跟 skill 功能重複
- **常見 tools 組合**：
  - 審查/研究類：`Read, Grep, Glob, Bash`
  - 改碼類：再加 `Edit, Write`

### 反模式（不該抄的做法）

- **人設動物園**：`backend_dev`、`frontend-engineer`、`senior-code-reviewer`、`pm`、`dba`、`rte`、`bsa`……  
  Claude 本來就能扮演任何角色，這些只增加表面積，沒有品質提升
- **subagent 跟 skill 重複**：`security-reviewer` agent + `security-check` skill 並存 → 其中一個是死碼
- **`tools:` 全開**：違反 scoped subagent 的初衷
- **大 repo 堆砌**：`rohitg00/awesome-claude-code-toolkit` 塞 135 個 agents、42 commands，是 discovery catalog 不是實際配置；`feiskyer/claude-code-settings`（1.4k stars）把 agents 切進 specialist/ 子目錄，也是過度工程
- **真實工作 repo 通常只裝 2–8 個 agents**（tambo, git-town, flox, liam-hq, Nethereum, mongodb 等）

---

## 2. Commands

### 最常見的 10 個

| 指令 | 出現 repo 數 |
|-----|--------------|
| **`/commit`** | **2,040** 🥇 |
| `/plan` | 1,668 |
| `/test` | 1,368 |
| `/review` | 1,288 |
| `/pr`（+ pr-review, pr-summary） | 1,280 |
| `/fix`（fix-issue） | 1,004 |
| `/debug` | 930 |
| `/release` | 644 |
| `/refactor` | 562 |
| `/explain` | 150 |

### Frontmatter 慣例

13,088 個 command 檔案用這組 frontmatter：

```yaml
---
description: 一行摘要，會顯示在指令選單
argument-hint: [optional args]
allowed-tools: Bash(git:*), Read
---

（prompt body，可用 $ARGUMENTS 插入使用者輸入）
```

- **長度**：通常 20–80 行，範本式的步驟指示
- **allowed-tools 要嚴格**：常見壞例是 `allowed-tools: Bash(*)` 等於沒設

### 反模式

- **單字母指令**（`/w`、`/t`、`/d`）：記不住也帶不走
- **湊數指令**（`/explain`、`/fix`、`/debug`）：直接跟 Claude 對話更快，沒必要包指令
- **42+ 的 command 大禮包**：看起來像失散的 ticket backlog

---

## 3. Hooks

### 最常見的 7 類

| Hook | 觸發點 | 做什麼 | 份量 |
|------|--------|--------|------|
| **auto-format** | `PostToolUse` Edit/Write | `prettier` / `gofmt` / `ruff` | 10-30 行 bash，最常見 |
| **type-check** | `PostToolUse` / `Stop` | `tsc --noEmit` / `mypy` | 10-20 行 |
| **stop-gate** | `Stop` | 阻止結束直到 lint/test 綠 | 20-40 行 |
| **pre-commit/push guard** | `PreToolUse` `git push/commit` | exit 2 擋下 | 20-40 行 |
| **secret scanner** | `PreToolUse` Bash | 擋 `.env`、`rm -rf`、`curl \| sh` | 20-40 行 |
| **session bootstrap** | `SessionStart` | 印 git status、載環境 | 10-30 行 |
| **notify / TTS** | `Notification` | 桌面通知 | 5-15 行 |

### 技術慣例

- 吃 stdin JSON 用 `jq` 解析 `.tool_input.*`
- 用 `$CLAUDE_PROJECT_DIR` 拿專案根目錄
- **exit code 2 = 擋下工具使用**（必須用 stderr 顯示原因給 Claude 看）
- 主力語言是 bash，Python 少數，Node 極少
- 典型長度：10–40 行

### 反模式

- **每次 edit 跑完整測試套件** → 每次改檔 +30 秒，使用者直接關掉
- **遙測 hook** 每次工具使用 POST 到伺服器 → 隱私 + 延遲雙輸
- **OS 分叉**（`.windows` / `.unix` / `##os.Darwin`）→ hook 不跨平台的 hack
- **備份檔進 git**（`settings.json.backup-20260214`、甚至資料夾裡堆 6 個版本）

---

## 4. `settings.json`

### 典型形狀

```jsonc
{
  "permissions": {
    "allow": [
      "Bash(npm run test:*)", "Bash(git status)", "Bash(git diff:*)",
      "Read(**)", "Edit(src/**)"
    ],
    "deny": [
      "Bash(rm -rf *)", "Bash(git push --force*)",
      "Read(.env*)", "Write(.env*)"
    ]
  },
  "hooks": { /* 2-3 個 hook 掛載點 */ }
}
```

- **30–40%** 的 repo **只有 permissions 沒有 hooks**
- 有 hooks 的通常 2-3 個：PreToolUse + PostToolUse + 可能一個 Stop

### Deny 清單共識

| Deny pattern | 為什麼 |
|-------------|--------|
| `Read(.env*)` / `Write(.env*)` | 秘密外洩最大宗 |
| `Bash(rm -rf *)` | 誤刪 |
| `Bash(git push --force*)` | 誤覆蓋遠端歷史 |
| `Bash(curl * \| sh)` | 供應鏈攻擊 |
| `Read(**/.ssh/**)` | SSH key 外洩 |

### Allow 清單共識

| Allow pattern | 用意 |
|--------------|------|
| `Read(**)` | 讀不會壞事 |
| `Bash(git status\|diff\|log:*)` | 安全的 git 讀操作 |
| `Bash(npm test:*)`、`Bash(pytest:*)`、`Bash(go test:*)` | 專案測試指令 |

### 反模式

- **Allow 肥到 100+ 條**（`Bash(npm:*)` 這種實質等於全開）
- **200+ 行的 settings.json** 塞滿 env / model / statusLine script
- **把 `settings.local.json` commit 進 git**（該放個人偏好，不該團隊共享）

---

## 5. 大專案怎麼做？

從認真對待 `.claude/` 的 org 觀察（Equinor、dailydotdev、WordPress playground、quarto-dev、ModelEngine-Group、checkly 等）：

| 規模 | Agents | Commands | Hooks | settings.json |
|------|--------|----------|-------|---------------|
| 工具型小 repo | 0-2 | 0-3 | 0-1 | permissions only |
| 內部團隊 repo | 2-5 | 3-8 | 1-3 | permissions + hooks |
| 平台型大 repo | 5-10 | 8-15 | 3-6 | 完整 |

**收斂點：沒有一個認真的工作 repo 裝超過 15 個 agents 或 40 個 commands。** 那種數量級都是 awesome / showcase repo。

---

## 6. Kiro CLI 的對應關係

Kiro CLI（AWS，從 Amazon Q CLI 升級而來）跟 Claude Code 的對應不是 1:1：

| Claude Code | Kiro CLI | 相容性 |
|------------|----------|-------|
| `.claude/rules/` | `.kiro/steering/` | ✅ 概念一致 |
| `paths:` YAML array | `inclusion: fileMatch` + `fileMatchPattern: "*.ts\|*.tsx"`（單一字串，用 `\|` 分隔） | ✅ 可轉換 |
| `.claude/skills/<name>/SKILL.md` | `.kiro/steering/` with `inclusion: manual` | ⚠️ 手動呼叫 |
| `.claude/agents/*.md`（markdown） | `.kiro/agents/*.json`（**JSON 格式**） | ⚠️ 格式需轉換 |
| `.claude/commands/*.md` | ❌ 沒有對應 | Kiro CLI 不支援使用者自訂 slash commands |
| `.claude/hooks/` | `.kiro/hooks/` + 不同 event 名稱（`agentSpawn` / `userPromptSubmit` / `preToolUse`） | ⚠️ 事件模型不同 |
| `.claude/settings.json` | Kiro settings（machine-level，不在專案內） | ❌ 無法共享團隊標準 |

### Kiro CLI 的 agent JSON 範例

```json
{
  "name": "code-reviewer",
  "description": "審查目前未提交變更",
  "tools": ["fs_read", "fs_write", "execute_bash"],
  "allowedTools": ["fs_read"],
  "prompt": "你是一位嚴謹的 code reviewer...",
  "model": "claude-sonnet-4"
}
```

差異重點：
- Kiro agent 是 JSON，不是 markdown with frontmatter
- tool 名稱不同（Kiro 用 `fs_read` / `fs_write` / `execute_bash`，Claude 用 `Read` / `Write` / `Bash`）
- Kiro 有 `allowedTools` 細分（預設允許哪些，其他需要確認）

---

## 7. 對我們 coderigup repo 的決策依據

基於以上觀察，我們的團隊標準要裝什麼：

### Claude Code — 裝這些

| Layer | 裝什麼 | 理由 |
|-------|-------|------|
| **Rules (paths-scoped)** | 4 個 lang rules | 文章 + 我們的 progressive disclosure 一致 |
| **Skills** | 既有 4 個 | 已經在用，表現好 |
| **Agent** | 只裝 1 個 `code-reviewer` | 對應 5 步驟的 Verify；多裝變人設動物園 |
| **Commands** | 只裝 `/commit` + `/review` | `/commit` 是 2040 repos 共識；`/review` 呼叫 code-reviewer |
| **Hooks** | 2 個：`auto-format`、`secret-guard` | 與語言無關、高頻、低風險 |
| **settings.json** | 裝，但 existing 檔案當 sidecar 不覆蓋 | 團隊權限共識 |

### Kiro CLI — 裝這些

| Layer | 裝什麼 | 理由 |
|-------|-------|------|
| **Steering** | 同 Claude 的 rules，paths → fileMatch 轉換 | 直接對應 |
| **On-demand steering** | 既有 4 個 skills | 同 Claude |
| **Agent** | `code-reviewer.json`（從 md 轉換） | Kiro 有原生支援 |
| **Commands** | ❌ 不裝 | Kiro CLI 不支援 |
| **Hooks** | ❌ 不裝 | Kiro CLI 事件模型不同，硬搬會壞 |
| **settings.json** | ❌ 不裝 | Kiro 設定是 machine-level |

### 不裝的理由摘要

> 「每多裝一層預設值就多逼使用者去 diff 一次。有立場，但要對齊 progressive disclosure 的核心哲學。」

---

## 附錄：參考來源

- **文章**：「如何設計 .claude 資料夾？一篇文搞懂 agents、commands、hooks 到 rules」（thisweb.dev）
- **官方文件**：Kiro CLI docs — `https://kiro.dev/docs/cli/`
- **GitHub 搜尋**：`path:.claude/agents/`、`path:.claude/commands/`、`path:.claude/hooks/`、`path:.claude filename:settings.json`
- **反面教材**：`ChrisWiles/claude-code-showcase`、`rohitg00/awesome-claude-code-toolkit`、`feiskyer/claude-code-settings`
- **正面教材**：`tambo`、`git-town`、`flox`、`liam-hq`、`Nethereum`、`mongodb`、`anthropics/skills`、`github/spec-kit`
