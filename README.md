# Sydney's Translator - 轻量、方便的翻译器

[![](https://img.shields.io/badge/Version-0.0.2-blue.svg)](#)
[![](https://img.shields.io/badge/Tech-Tauri_2_%2B_React_19-orange.svg)](#)
[![](https://img.shields.io/badge/Platform-Windows-windows.svg)](#)

**Sydney's Translator** 是一款基于 Tauri 2、React 19 和 Rust 构建的轻量级 Windows 桌面翻译器。它旨在通过系统级集成和 AI 驱动的翻译能力，为开发者和科研人员提供丝滑的跨软件翻译体验。

---

## ✨ 功能特性

### 1. 核心翻译体验
* **多引擎驱动**：支持 OpenAI 兼容接口，并可灵活切换 Bing 或 Google 翻译插件。
* **智能流转**：支持中英文自动识别，无需手动切换翻译方向。
* **全局触达**：
    * **划词翻译**：选中文本即可触发翻译悬浮窗。
    * **全局快捷键**：通过自定义热键快速唤醒/隐藏翻译界面。

### 2. 交互与定制
* **原生集成**：支持窗口置顶、开机自启、系统托盘常驻。
* **视觉美学**：预设 Light、Dark 以及极致对比度的 **Absolutely** 主题，并支持注入 **自定义 CSS**。
* **网络支持**：内置代理配置功能，确保 API 调用畅通无阻。

### 3. 安全与性能
* **凭据安全**：API Key 托管于 Windows Credential Manager，确保存储安全性。
* **极致轻量**：利用 Rust 的内存安全性与 Tauri 的小体积优势，占用资源极低。

---

## 🛠️ 技术栈

* **前端**: [React 19](https://react.dev/), TypeScript, [Vitest](https://vitest.dev/)
* **后端**: [Tauri 2](https://tauri.app/), [Rust](https://www.rust-lang.org/)
* **底层增强**: `windows-helper` (基于 Rust 的 Windows 辅助进程，处理系统级 Hook)

---

## 📂 项目结构

```text
.
├── src/                # React 19 前端源代码
├── src-tauri/          # Tauri 核心逻辑与 Rust 后端代码
├── windows-helper/     # 处理全局快捷键与划词功能的 Windows 辅助模块
├── scripts/            # 自动化脚本与构建工具
└── ...
```

---

## 🚀 快速上手

### 开发环境要求
- [Node.js](https://nodejs.org/) (建议 LTS 版本)
- [Rust toolchain](https://rustup.rs/)
- Windows 10/11 操作系统

### 本地开发
1.  **安装依赖**
    ```bash
    npm install
    ```
2.  **启动前端热更新**
    ```bash
    npm run dev
    ```
3.  **启动 Tauri 桌面开发环境**
    ```bash
    npm run tauri:dev
    ```

### 运行测试
- 前端测试：`npm test`
- Rust/Tauri 测试：`cargo test --manifest-path "src-tauri/Cargo.toml"`

### 构建发布
```bash
npm run tauri:build
```

---

## ⚙️ 配置说明

应用配置文件及敏感数据存放路径：

-   **普通设置**：`%APPDATA%/translator/settings.json` (包含主题、快捷键、代理等)
-   **API 密钥**：存储于 Windows 凭据管理器，目标名为 `translator.api_key`

---

## 📝 许可证

[MIT License](LICENSE)
