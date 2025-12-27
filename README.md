# 🍒 Chibi

> Another Code Agent - 基于 AI 的智能代码搜索与理解工具

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Chibi 是一个使用 **ReAct（Reasoning + Acting）模式** 的 AI 代码助手，能够智能地探索代码库、回答问题并生成实现方案。

## ✨ 特性

- 🧠 **智能代码理解** - 基于 LLM 的代码搜索与分析，理解代码语义而非简单文本匹配
- 🔄 **ReAct 模式** - 结合推理与行动的多轮迭代，自动探索代码直至找到答案
- 🎨 **精美终端界面** - 基于 Ink (React for CLI) 的交互式界面，实时展示思考过程
- 🔌 **多 LLM 支持** - 支持火山引擎（豆包）、Anthropic（Claude）、OpenAI（GPT-4）
- 🛠️ **内置工具** - ripgrep 搜索、文件读取、目录浏览等代码探索工具
- 📝 **上下文管理** - 智能的 Token 预算管理与上下文压缩
- 🌏 **双语支持** - 支持中文和英文输出

## 📦 安装

```bash
# 克隆仓库
git clone https://github.com/gxcsoccer/chibi.git
cd chibi

# 安装依赖
npm install

# 构建项目
npm run build
```

## ⚙️ 配置

### 环境变量

创建 `.env` 文件配置 LLM 服务：

```bash
# 火山引擎（豆包）- 推荐
ARK_API_KEY=your-api-key
ARK_MODEL=doubao-seed-code-preview-251028
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# 或 Anthropic
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# 或 OpenAI
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=gpt-4o
```

### 配置文件

支持多种配置文件格式，在项目根目录创建：

- `chibi.config.js` / `chibi.config.mjs`
- `chibi.config.json` / `chibi.config.yaml`
- `.chibirc` / `.chibirc.json` / `.chibirc.yaml`

```javascript
// chibi.config.js
export default {
  llm: {
    provider: 'volcengine',
    model: 'doubao-seed-code-preview-251028',
    maxTokens: 8192,
    temperature: 0.7,
  },
  agent: {
    maxIterations: 20,      // 最大迭代次数
    stuckThreshold: 3,      // 卡住检测阈值
    enableThinking: false,  // 是否启用思考链
  },
  output: {
    language: 'zh',         // 输出语言: 'zh' | 'en'
    verbose: false,
  },
};
```

## 🚀 使用

### 基本命令

```bash
# 询问代码相关问题
chibi ask "这个项目的整体架构是什么？"

# 生成实现方案
chibi plan "添加一个用户认证模块"

# 解释代码或概念
chibi explain "src/agent/investigator.ts"
```

### 命令选项

```bash
chibi ask <query> [options]

选项:
  --cwd <path>      指定工作目录（默认: 当前目录）
  -c, --config      指定配置文件路径
  -v, --verbose     详细输出模式
  -q, --quiet       静默模式（非交互式）
  --json            以 JSON 格式输出
```

### 开发模式

```bash
# 使用 tsx 直接运行
npm run dev

# 或者
npm run chibi ask "你的问题"
```

## 🛠️ 内置工具

Chibi 配备了以下代码探索工具：

| 工具 | 描述 |
|------|------|
| `ripgrep` | 基于 ripgrep 的快速代码搜索，支持正则表达式 |
| `read_file` | 读取文件内容，支持行号范围 |
| `list_dir` | 列出目录结构 |
| `recall_detail` | 从上下文中召回详细信息 |

## 🏗️ 架构

```
src/
├── agent/              # Agent 核心逻辑
│   ├── investigator.ts # 调查员 - ReAct 循环实现
│   ├── orchestrator.ts # 调度器 - 任务编排
│   ├── synthesizer.ts  # 合成器 - 结果合成
│   ├── prompt-builder.ts # 提示词构建器
│   └── experts/        # 专家模块
├── llm/                # LLM 客户端
│   └── providers/      # 多 LLM 提供商支持
├── tools/              # 工具系统
│   ├── builtin/        # 内置工具
│   └── ripgrep/        # ripgrep 集成
├── context/            # 上下文管理
├── ui/                 # Ink UI 组件
└── cli/                # CLI 入口
```

### 工作流程

```
用户提问 → Orchestrator → Investigator → LLM 推理 → 工具调用 → Synthesizer → 生成回答
                              ↑                         ↓
                              └───────── 迭代 ──────────┘
```

## 📋 开发

```bash
# 运行测试
npm test

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 构建
npm run build
```

## 📄 License

[MIT](LICENSE)
