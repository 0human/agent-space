# 调试指南

本文档记录 Electron 主进程和渲染进程的本地调试方法。项目使用 `electron-vite`，调试时优先通过 CLI 参数打开 sourcemap、V8 inspector 和 Chromium remote debugging port。

## 端口约定

- 主进程 V8 inspector：`9229`
- 渲染进程 Chrome DevTools Protocol：`9222`

## VS Code 调试

推荐使用 `.vscode/launch.json` 中的配置：

- `Debug All`：启动应用，并同时调试主进程和渲染进程。
- `Debug Main Process`：只启动并调试主进程，适合断点放在 `src/main` 或 `src/preload`。
- `Attach Renderer Process`：附加到已启动应用的渲染进程，适合断点放在 `src/renderer`。
- `Attach All`：附加到一个已经通过 `pnpm dev:debug` 启动的应用。

常用步骤：

1. 在 `src/main`、`src/preload` 或 `src/renderer` 中设置断点。
2. 打开 VS Code Run and Debug 面板。
3. 选择 `Debug All` 并按 F5。

如果想先从终端启动应用，再用 VS Code 附加调试：

```sh
pnpm dev:debug
```

然后在 VS Code 选择 `Attach All`。

## 主进程调试

主进程包括 `src/main`，以及由主进程加载的 preload 构建产物。普通断点调试：

```sh
pnpm dev:debug:main
```

启动后用 VS Code 的 `Attach Main Process` 附加，或在 Chrome 打开 `chrome://inspect` 连接 `localhost:9229`。

如果需要在应用启动第一行就暂停：

```sh
pnpm dev:debug:main:break
```

这种方式适合排查应用启动、数据库初始化、IPC 注册、窗口创建等早期流程。

## 渲染进程调试

渲染进程包括 `src/renderer` 下的 React 页面、组件和状态逻辑。启动渲染进程 remote debugging：

```sh
pnpm dev:debug:renderer
```

然后选择以下任一方式：

- VS Code 使用 `Attach Renderer Process`。
- Chrome 打开 `http://localhost:9222`，选择 Electron 页面进入 DevTools。
- 在 Electron 窗口内使用系统菜单或快捷键打开 DevTools。

## 同时调试主进程和渲染进程

终端方式：

```sh
pnpm dev:debug
```

再用 VS Code 选择 `Attach All`。

VS Code 一键方式：

```text
Run and Debug -> Debug All -> F5
```

## 注意事项

- 调试源码断点时必须启用 `--sourcemap`，否则断点可能落到构建后的 `out` 文件。
- 渲染进程调试需要 Electron 应用已经启动；单独 attach 到 `9222` 不会启动应用。
- `9229` 或 `9222` 被占用时，修改 `package.json` 脚本和 `.vscode/launch.json` 中对应端口，并保持两处一致。
- 不建议在业务代码里默认调用 `webContents.openDevTools()`；需要时手动打开 DevTools，避免影响正常开发启动体验。
