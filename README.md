# Buddy

**Your screen, understood.** Buddy is a Windows desktop companion that lets you ask an AI about what you are looking at, right when you need help. Capture a monitor, a window, or a hand-picked region; ask a question in plain language; keep the conversation grounded as you follow up.

## ⬇️ Download Buddy

Get the Windows installer from the [Buddy Releases page](https://github.com/ArashMaghsoodi/Buddy/releases). Download the `.exe` there to try Buddy; you do not need to clone the repository or build it yourself.

## 💡 Why Buddy?

I created Buddy because asking a quick question about my screen had turned into a whole routine: open a browser, wait for it, find an AI service, wait again, figure out how to attach a screenshot, send the question, then close the browser when I was done. A few minutes later, I would have another question and have to start all over. Leaving browser tabs open just to be ready was not appealing either, especially when the browser was using memory while I was doing something else.

I wanted an always-ready companion on the desktop instead. With Buddy, I can bring up the floating chat, choose what it should see right in the composer, and ask. The conversation stays there for follow-ups, and the companion is still ready when the next question comes up. No browser-opening ritual, no separate screenshot-upload detour, no keeping an AI tab around between questions.

## ✨ What you can do today

- **Capture exactly what matters.** Choose a monitor, the current window, a listed application window, or drag to select a screen region. Capture respects monitor size and scaling differences.
- **Ask about what you see.** Send a question with a screenshot attached, then ask follow-ups that retain the conversation's visual context.
- **Work from either view.** Use the full chat or the movable, always-on-top companion; both stay synced to the same conversations.
- **Explore alternate answers without losing work.** Edit a prompt or regenerate a response as a new branch, switch between sibling messages, or inspect and manage the conversation in the graph view.
- **Keep useful conversation tools close.** Copy message text, search conversation history, and open screenshot attachments at full size.
- **Choose your AI provider.** Buddy supports OpenAI, Anthropic, Google Gemini, and OpenAI-compatible services such as OpenRouter, xAI, DeepSeek, Groq, GitHub Copilot-compatible endpoints, 9Router, and local or custom endpoints. Configure providers and models in Settings.
- **Use global shortcuts.** Open the companion with `Alt+Space`; trigger screen analysis with `Alt+Shift+Space`. The companion shortcut can be changed in Settings.

## 🔒 Privacy and control

Buddy stores settings and conversations locally on your device. It does not continuously upload your screen: a screenshot is sent to the provider you configured only when you choose to send a message with capture enabled. Turn capture off in the composer for a text-only message. Check your provider's privacy policy to understand how it handles requests it receives.

## 🛣️ What's next

Buddy is being developed incrementally. Ideas on the roadmap include:

- **Richer screen context:** optional OCR for text-heavy screens, plus active application, window title, and capture-source details when available.
- **Point and ask:** click or mark an area on screen to direct Buddy's attention to a chart, control, equation, or other detail.
- **Meaningful change detection:** recognize significant screen changes while filtering out cursor movement, animation, and other visual noise.
- **Opt-in proactive help:** let Buddy offer assistance based on relevant changes, with user-selected targets, cooldowns, and controls over interruptions.
- **Careful computer interaction:** explore mouse and keyboard actions through an observe, plan, act, and verify workflow, keeping seeing and acting distinct.

## 🚀 Get started

### Requirements

- Windows 10 or later
- Node.js 18 or later and npm (Node.js 22.6+ is required for `npm run test:tree`)
- A vision-capable model from a provider you can access; local OpenAI-compatible models are supported too

### 👩‍💻 Run from source

```powershell
git clone https://github.com/ArashMaghsoodi/Buddy.git
cd Buddy
npm ci
npm run dev
```

`npm run dev` launches the desktop app with renderer hot reload. The first time you open Buddy:

1. Open **Settings** and choose an AI provider.
2. Add the provider's API key if required, fetch available models, and choose a vision-capable model.
3. In the chat composer, choose what Buddy should capture, or turn capture off for a text-only question.
4. Ask something like *"What is this chart showing?"* or *"Can you explain this error?"*

Press **Enter** to send a message or **Shift+Enter** to add a line break. Use `Alt+Space` to open or focus the companion, or `Alt+Shift+Space` to capture and open it.

## 🧪 Build and test

```powershell
npm run typecheck
npm run test:tree
npm run build
```

To create a Windows installer:

```powershell
npm run build:win
```

The NSIS installer is written to `dist/Buddy Setup <version>.exe` (for example, `dist/Buddy Setup 0.1.0.exe`). Upload that `.exe` to a GitHub Release. The installer is currently unsigned, so Windows may show a security warning when it is opened.

## 🤝 Contributing

Buddy is currently a solo project, and I’m not accepting outside contributions or pull requests. I may revisit this as the app matures and reaches future milestones. Thanks for understanding and following along.

## 📄 License

There is no `LICENSE` file in the repository yet. Until a license is added, the project is not licensed for reuse; please open an issue before redistributing or incorporating its code.

## 🧰 Built with

Buddy is built with Electron, electron-vite, React, and TypeScript, with provider-specific integrations kept behind a shared vision-provider interface.

## 👀 Take a look

Download Buddy from [GitHub Releases](https://github.com/ArashMaghsoodi/Buddy/releases), connect a vision-capable model, and ask what it sees. If you try it, share what worked well and what you would like Buddy to understand next.
