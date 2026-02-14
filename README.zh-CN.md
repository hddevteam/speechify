# 🎵 Speechify - VS Code 高级文本转语音扩展

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/luckyXmobile.speechify)](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/luckyXmobile.speechify)](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify)
[![GitHub License](https://img.shields.io/github/license/hddevteam/speechify)](https://github.com/hddevteam/speechify/blob/main/LICENSE)
[![CI/CD](https://github.com/hddevteam/speechify/actions/workflows/ci.yml/badge.svg)](https://github.com/hddevteam/speechify/actions)

<p align="center">
  <img src="./images/icon-128.png" alt="Speechify 图标" width="128" height="128">
</p>



📖 **[中文文档](README.zh-CN.md)** | **[English Documentation](README.md)** | **[在线演示](https://hddevteam.github.io/speechify/zh-cn.html)**

将您的 VS Code 转换为强大的 AI 驱动视频生产工作站！

## 💡 为什么选择 Speechify 3.0？（核心差异化）

市面上有很多剪辑软件（如剪映、Premiere Pro 等），但 Speechify 是专为**开发者工作流**设计的。

1. **零上下文切换**：为什么要离开你的“舒适区”？在 VS Code 内改代码、写文档，顺手就把演示视频做了。
2. **“脚本即代码”理念**：不要再在复杂的轨道和关键帧上浪费时间。你的视频是由 Markdown 脚本定义的。功能更新了？改改文字，一键重新生成。
3. **AI 视觉感知对齐**：传统剪辑需要人工听音画位。Speechify 利用 **视觉 AI** “观看”你的录屏，自动将你的旁白与 UI 操作对齐。
4. **低成本维护**：由于技术更新快，演示视频很容易过时。使用 Speechify，你维护的是一份脚本，而不是GB级的工程文件。这是视频创作领域的“CI/CD”。

## 🎯 应用场景与问题解决

### 📚 **教育与内容创作**
- **备课准备**：将讲义、代码示例和文档转换为音频教学材料
- **视频制作**：为编程教程、软件演示和教育内容生成专业配音
- **音频节目**：通过将书面内容转换为自然语音来制作编程播客
- **在线学习**：将技术文档转换为可访问的音频格式，用于远程学习

### 🎬 **媒体与广播**
- **有声书制作**：将技术书籍、编程指南和文档转换为有声书
- **演示解说**：为技术演示和展示生成专业解说
- **多语言内容**：使用母语者声音创建相同内容的多语言版本
- **无障碍访问**：为视觉障碍的开发者和学习者提供书面内容的音频版本

### 💼 **专业发展**
- **代码审查**：在审查代码时听取代码注释和文档
- **文档处理**：将 API 文档、README 文件和技术规范转换为音频
- **会议准备**：将会议记录和技术规格转换为音频简报
- **语言学习**：练习不同语言技术术语的发音

### 🔧 **开发工作流**
- **多任务处理**：在编码、测试或调试时听取文档
- **代码注释**：将内联注释和文档字符串转换为语音
- **错误分析**：生成错误日志和调试信息的音频摘要
- **团队沟通**：为团队分享创建技术规格的音频版本

### 🌐 **无障碍访问与包容性**
- **视觉障碍支持**：为视觉障碍程序员提供开发资源的无障碍访问
- **学习障碍**：支持有阅读困难或其他学习障碍的开发者
- **疲劳缓解**：通过听取文档而非阅读来减少眼部疲劳
- **移动学习**：在通勤或锻炼时继续学习

## ✨ 主要功能

### 🎤 **专业语音合成**
- **高质量音频**：使用 Azure 神经语音生成清晰的 MP3 音频文件
- **200+ 种声音**：从 60+ 种语言的大量自然声音中选择
- **智能分割**：通过将大文档分割成可管理的音频片段来自动处理
- **实时处理**：语音生成过程中的实时进度反馈

### 🎭 **高级语音定制**
- **语音风格**：选择友好、新闻播报、愉快、悲伤、愤怒等说话风格
- **角色扮演**：为支持的声音选择特定的角色（叙述者、年轻成人、老年人等）
- **性别选择**：按男性/女性偏好筛选声音
- **语言支持**：完全支持多语言内容，自动检测语言环境

### 🌍 **多语言界面**
- **中英双语**：支持原生界面，自动语言检测
- **可扩展国际化**：易于添加其他语言支持
- **一致术语**：专业翻译的界面元素

### 🛠️ **开发者友好**
- **TypeScript**：完全使用 TypeScript 编写，具有严格类型检查
- **VS Code 集成**：与 VS Code 命令和上下文菜单无缝集成
- **配置管理**：持久设置，支持工作区级别自定义
- **错误处理**：全面的错误处理，提供用户友好的消息

## 🚀 实际应用场景

### 👨‍🏫 **教育工作者与培训师**
**场景：制作编程教学视频**
1. 在 VS Code 中编写教学脚本或课程大纲
2. 选择文本内容，右键选择"Speechify: 文字转语音"
3. 生成专业配音文件，用于视频后期制作
4. 结果：节省录音时间，获得一致的语音质量

**实际用途：**
- 制作在线编程课程的配音
- 为技术演示生成解说音频
- 创建多语言版本的教学内容

### 🎬 **内容创作者**
**场景：制作技术播客**
1. 将技术文章或博客文章复制到 VS Code
2. 使用 Speechify 转换为高质量音频
3. 直接用于播客发布或作为音频素材
4. 结果：快速生成专业级播客内容

**实际用途：**
- 将技术博客转换为音频播客
- 制作技术新闻播报
- 创建代码讲解音频

### 📺 **视频制作者**
**场景：创建编程教程系列**
1. 在 VS Code 中准备每期视频的脚本
2. 选择不同的语音角色为不同角色配音
3. 批量生成音频文件用于视频剪辑
4. 结果：保持整个系列音频的一致性

**实际用途：**
- YouTube 编程教程配音
- 软件演示视频解说
- 产品介绍视频制作

### 🎓 **在线课程创作者**
**场景：制作完整的在线课程**
1. 将课程讲义和说明文档导入 VS Code
2. 逐章节转换为音频课程
3. 为不同难度级别选择不同语音风格
4. 结果：快速制作专业的在线音频课程

**实际用途：**
- Udemy/Coursera 等平台的课程制作
- 企业内训音频材料
- 技术认证培训内容

## 🚀 快速开始

### 1. 安装
从 [VS Code 市场](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify) 安装或在 VS Code 扩展中搜索 "Speechify"。

### 2. Azure 设置
1. 获取您的 [Azure 语音服务](https://azure.microsoft.com/services/cognitive-services/speech-services/) 订阅密钥
2. 打开 VS Code 命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）
3. 运行 "Speechify: 配置 Azure 设置"
4. 输入您的订阅密钥和区域

### 2.1 Azure OpenAI 配置（Vision）

Speechify 的 AI 视觉对齐功能依赖以下 VS Code 配置项：`speechify.visionApiKey`、`speechify.visionEndpoint`、`speechify.visionDeployment`、`speechify.refinementDeployment`。

最短配置路径：
1. 创建或打开 **Azure OpenAI** 资源。
2. 在 Azure 门户进入 **Keys and Endpoint**，复制：
  - Key → `speechify.visionApiKey`
  - Endpoint（示例：`https://<resource>.openai.azure.com`）→ `speechify.visionEndpoint`
3. 在 Azure AI Foundry/Studio 进入 **Deployments**，复制部署名：
  - 视觉分析模型 → `speechify.visionDeployment`
  - 文案精炼模型 → `speechify.refinementDeployment`
4. 在 VS Code 设置（Speechify）中填入以上值。

推荐填写策略：

| 策略 | visionDeployment | refinementDeployment | 适用场景 |
|---|---|---|---|
| 质量优先 | `gpt-5.2` | `gpt-5.2` | 对齐质量最佳，成本/时延较高 |
| 成本/速度优先 | `gpt-5-mini` | `gpt-5-mini` | 速度更快，成本更低 |
| 混合方案（推荐） | `gpt-5-mini` | `gpt-5.2` | 兼顾成本与精炼质量 |

### 3. 语音配置
1. 打开命令面板
2. 运行 "Speechify: 配置语音设置"
3. 选择您偏好的语言、声音和风格

### 4. 文本转语音
1. 在编辑器中选择任何文本
2. 右键点击选择 "Speechify: 文字转语音"
3. 您的音频文件将保存在源文件的同一目录中

## 📖 使用示例

### 基本文本转换
```typescript
// 选择此文本并转换为语音
const greeting = "您好，欢迎使用 VS Code Speechify 扩展！";
```

### 文档转换
将整个 markdown 文档、代码注释或任何基于文本的内容转换为语音，适用于：
- **无障碍访问**：支持视觉障碍或阅读困难的用户
- **内容审阅**：在做其他任务或通勤时听取您的写作
- **语言学习**：听取多种语言技术术语的正确发音
- **演示制作**：为演示、教程和教育内容生成音频解说
- **播客创作**：将书面文章转换为专业播客节目
- **课程材料**：将讲义和教育内容转换为音频格式

### 高级语音功能
```javascript
// 当使用支持角色扮演的声音时，您可以选择特定角色：
// - 叙述者：专业讲故事的声音
// - 年轻成年女性：充满活力和友善
// - 年长成年男性：权威和经验丰富
// - 儿童：活泼和热情
```

## ⚙️ 配置

### Azure 语音服务设置
- **订阅密钥**：您的 Azure 语音服务 API 密钥
- **区域**：Azure 区域（例如，eastus、westus2、westeurope）

### 语音定制
- **语音名称**：特定语音模型（例如，en-US-JennyNeural、zh-CN-YunyangNeural）
- **语音性别**：男性或女性偏好
- **语音风格**：说话风格（友好、新闻播报、愉快等）
- **语音角色**：支持角色扮演的声音的角色

### 文件输出设置
- **格式**：音频格式（MP3、WAV、OGG）
- **质量**：音频质量和比特率设置
- **命名**：智能文件命名，带时间戳

## 🎯 高级功能

### 智能文件管理
- **清晰命名**：`document_speechify_20250713_1430.mp3`
- **分块文件**：`document_speechify_part01_20250713_1430.mp3` 用于大文本
- **自动组织**：文件保存在源文档旁边

### 语音角色选择
对于支持角色扮演的声音：
1. 右键点击选中的文本
2. 选择 "Speechify: 选择语音角色"
3. 从可用的角色中选择
4. 设置会自动保存以供将来使用

### 批处理
- **大文档**：自动将长内容分割为多个音频文件
- **进度跟踪**：长时间操作的实时进度指示器
- **错误恢复**：强大的错误处理和重试机制

## 🔧 命令

| 命令 | 描述 | 快捷键 |
|------|------|--------|
| `Speechify: 文字转语音` | 转换选中的文本或文档 | 右键菜单 |
| `Speechify: 配置 Azure 设置` | 设置 Azure 凭据 | 命令面板 |
| `Speechify: 配置语音设置` | 选择语音偏好 | 命令面板 |
| `Speechify: 选择语音风格` | 更改说话风格 | 命令面板 |
| `Speechify: 选择语音角色` | 选择角色 | 命令面板 |
| `Speechify: 显示语音设置` | 显示当前配置 | 命令面板 |

## 📋 系统要求

- **VS Code**：版本 1.82.0 或更高
- **Azure 账户**：有效的 Azure 订阅和语音服务
- **Node.js**：用于扩展开发（仅开发者需要）
- **网络连接**：Azure 语音服务 API 需要

## 🔒 安全与隐私

- **本地处理**：文本仅发送到 Azure 语音服务进行转换
- **安全存储**：Azure 凭据安全存储在 VS Code 设置中
- **无数据保留**：Microsoft Azure 不存储您的文本内容
- **开源**：完整源代码可供安全审查

## 🌟 支持的语言和声音

### 热门语言
- **英语**：20+ 神经语音，多种风格和角色
- **中文（简体）**：15+ 声音，包括角色扮演
- **西班牙语**：10+ 地区变体，自然发音
- **法语**：专业和对话语音选项
- **德语**：商务和休闲说话风格
- **日语**：现代和传统语音特征

### 语音风格
- **专业**：新闻播报、客服、叙述
- **情感**：愉快、悲伤、愤怒、兴奋、友善
- **创意**：聊天、诗歌、抒情、耳语
- **角色**：助手、希望、呼喊、恐惧

## 🎯 专业工作流程

### 📚 **学术与研究**
- **论文写作**：将研究论文和技术文档转换为音频以供审阅
- **文献综述**：在做笔记时听取摘要和总结
- **会议演示**：为学术演示生成一致的解说
- **同行评议**：为协作评审会议创建论文的音频版本

### 🏢 **企业与商业**
- **技术文档**：将 API 文档、用户手册和规范转换为音频
- **培训材料**：创建入职和培训内容的音频版本
- **会议摘要**：将会议记录转换为团队分发的音频简报
- **产品文档**：为国际团队生成多语言音频指南

### 🎨 **创意产业**
- **剧本写作**：将剧本转换为音频用于声音表演指导
- **游戏开发**：为游戏对话和解说创建占位符音频
- **动画制作**：为动画内容生成临时配音
- **营销推广**：创建营销文案和促销内容的音频版本

## 🛠️ 开发

### 贡献
我们欢迎贡献！请查看我们的 [贡献指南](CONTRIBUTING.md) 了解详情。

### 从源码构建
```bash
git clone https://github.com/hddevteam/speechify.git
cd speechify
npm install
npm run compile
```

### 测试
```bash
npm run test:integration  # 运行所有测试
npm run lint             # 检查代码质量
```


## 🐛 已知问题

- 大文件（>10MB 文本）可能需要几分钟处理
- 某些 Azure 区域在高峰时段可能有速率限制
- 语音角色选择仅适用于支持的神经语音

## 📞 支持

- **GitHub 问题**：[报告错误或请求功能](https://github.com/hddevteam/speechify/issues)
- **文档**：[完整文档和指南](https://github.com/hddevteam/speechify)
- **VS Code 市场**：[扩展页面和评论](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify)

## 📄 许可证

本项目采用 MIT 许可证 - 详细信息请查看 [LICENSE](LICENSE) 文件。

## 🙏 致谢

- **Microsoft Azure**：提供出色的语音服务 API
- **VS Code 团队**：提供优秀的扩展开发平台
- **贡献者**：所有为此项目做出贡献的开发者
- **社区**：提供反馈和建议的用户

---

**为开发者社区用 ❤️ 制作**

*通过专业的文本转语音功能改变您的编码体验。完美适用于无障碍访问、内容创作和多语言开发工作流程。*
