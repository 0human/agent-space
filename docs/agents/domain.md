# Domain Docs

本文说明 engineering skills 在探索代码库时应如何使用本仓库的 domain documentation。

## 探索前读取

- 仓库根目录的 **`CONTEXT.md`**；或者
- 若根目录存在 **`CONTEXT-MAP.md`**，读取它指向的、与当前主题相关的各个 `CONTEXT.md`。
- **`docs/adr/`**：读取涉及待处理区域的 ADR。在 multi-context 仓库中，还应检查 `src/<context>/docs/adr/` 下的 context-scoped decisions。

如果这些文件不存在，**直接继续，不作提示**。不要报告缺失，也不要预先建议创建。`/domain-modeling` skill 会在术语或决策实际确定后按需创建这些文件。

## 文件结构

本仓库采用 single-context 布局：

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

供参考，存在根目录 `CONTEXT-MAP.md` 时表示 multi-context 布局：

```text
/
├── CONTEXT-MAP.md
├── docs/adr/
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用 glossary 中的词汇

当输出中出现 domain concept，例如 issue title、refactor proposal、hypothesis 或 test name 时，使用 `CONTEXT.md` 定义的术语，不要改用 glossary 明确排除的同义词。

如果 glossary 尚未包含所需概念，这通常意味着正在引入项目未使用的语言，或 domain model 确实存在缺口。前者应重新考虑，后者应记录并交由 `/domain-modeling` 处理。

## 标明 ADR 冲突

如果输出与现有 ADR 冲突，应明确指出，而不是静默覆盖：

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
