# AI Nexus

AI Nexus is a sophisticated, browser-based AI character generator and chat platform. It empowers users to create, manage, and interact with complex AI personalities with rich, persistent memory and lore. The application is designed with privacy in mind, featuring strong, production-grade end-to-end encryption for all local data, and offers a powerful plugin system to extend its capabilities.

It is designed for interoperability, supporting the import and export of character cards from other popular platforms.

## ✨ Features

- **🔒 Secure Local Storage**: All your characters, conversations, and plugins are stored locally in your browser's IndexedDB and encrypted with a master password using the Web Crypto API (PBKDF2 and AES-GCM).
- **🎨 Per-Chat Customization**: Personalize each conversation with its own unique background and banner images. Upload your own, or use the built-in AI to generate atmospheric images based on your current chat context or the active characters' personas.
- **Compatibility First**:
  - **Import Character Cards & Lorebooks**: Import character `.json` files compatible with formats like Character Card V2, or import `.json` lorebooks from SillyTavern's "World Info" format.
  - **Export Universal Cards**: Export your characters in a compatible V2 format, including a base64-encoded avatar, for use in other applications.
- **👤 Advanced Character Creation**:
  - Define core identity, physical appearance, personality traits, and tags.
  - Write detailed `Role Instructions` (system prompts) to guide AI behavior.
  - A `Memory` system that automatically summarizes conversation highlights to ensure continuity.
- **📚 Dynamic Lorebooks (World Info)**:
  - Create and manage repositories of world information completely separate from characters.
  - Each lorebook entry is activated by keywords. When a keyword appears in the chat, the associated lore is dynamically injected into the AI's context.
  - Attach one or more lorebooks to any chat session, making characters instantly aware of the world's rules, locations, and history.
- **💬 Dynamic Chat Interface**:
  - **Multi-Character Chat**: Create group chats with two or more AI characters who can interact with you and each other.
  - **AI Self-Conversation**: Use the `/converse` command to have characters talk to each other based on a topic you provide.
  - **Cross-Chat Memory**: Import memories from one chat session into another, allowing characters to recall experiences from different "storylines".
- **🔌 Extensible Plugin System**:
  - Write custom JavaScript plugins to modify application behavior.
  - Configure the default Image Generation plugin with preset styles, negative prompts, and custom API endpoints.
- **🌐 Multi-API Support**:
  - Default support for Google Gemini.
  - Per-character or per-plugin configuration for custom API keys or any OpenAI-compatible API (e.g., Ollama, LM Studio).
- **💾 Granular Data Management**:
  - **Archiving**: "Delete" characters and chats to archive them instead of permanently removing them. View and restore them from the archive at any time.
  - **Full Backup**: Export and import your entire application data in a single JSON file.
  - **Individual Export**: Export single characters, chat histories, or lorebooks.
  - **Smart Import**: The app automatically detects whether you are importing a full backup, a character card, a lorebook, or a chat session.

---

## 🚀 Running Locally

AI Nexus is a static web application and does not require a complex build process. You just need a way to serve the `index.html` file.

**Prerequisites**:
- A modern web browser (Chrome, Firefox, Edge).
- A simple local web server. Python's built-in server is a great option if you have Python installed.

**Step-by-Step Guide**:

1.  **Download the Code**:
    Download or clone the project files to a folder on your computer.

2.  **Serve the Application**:
    You need to serve the files from a local web server. Opening `index.html` directly from the file system (`file://...`) will not work due to browser security policies.

    **Option A: Using Python (Recommended)**
    - Open a terminal or command prompt in the project's root directory (where `index.html` is located).
    - Run the following command:
      ```bash
      python -m http.server
      ```
    - If you have Python 2, the command is `python -m SimpleHTTPServer`.

    **Option B: Using VS Code Live Server**
    - If you are using Visual Studio Code, you can install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension.
    - After installation, right-click on `index.html` in the file explorer and select "Open with Live Server".

3.  **Access the App**:
    - Once the server is running, open your web browser and navigate to the address provided by your server, which is typically `http://localhost:8000`.

**Important Note on API Keys**:
The application is designed to use an API key from a `process.env.API_KEY` environment variable. When running locally, this variable won't be set. To use AI features, you must configure a custom API key within the app:
- For a character: Edit the character -> API Configuration -> Select "Google Gemini (Custom Key)" or "OpenAI-Compatible" and enter your details.
- For image generation: Go to Plugins -> Edit "Image Generation" -> Configure the API settings there.

---

## 🔧 Troubleshooting & FAQ

**Q: The app is asking me to create a password on the first run. What is this for?**
A: This master password is used to encrypt all your data (characters, chats, etc.) before it's saved to your browser's local storage (IndexedDB). Your password is never stored; instead, it's processed with a unique salt through a key derivation function (PBKDF2) to generate a secure encryption key. The data is then encrypted using the AES-GCM authenticated encryption standard via the Web Crypto API. This ensures your data remains private and secure on your machine. You will need this password every time you open the app.

**Q: I forgot my master password. Can I recover it?**
A: No. Due to the local, zero-knowledge encryption model, there is no password recovery. The only way to regain access is to clear your browser's site data for the application, which will delete all your encrypted data permanently.

**Q: How do I import a character or a lorebook?**
A: Use the "Import" button in the bottom-left sidebar. Select the `.json` file. AI Nexus will automatically detect if it's a character card, a SillyTavern World Info file (lorebook), a chat session, or a full backup, and handle it accordingly.

**Q: How do I use a local AI model like Ollama?**
A: You can connect to local models that expose an OpenAI-compatible API.
1. Make sure your local model server (e.g., Ollama) is running.
2. In AI Nexus, edit a character and go to the "API Configuration" section.
3. Select "OpenAI-Compatible".
4. Set the **API Endpoint** to your local server's address (e.g., `http://localhost:11434/v1/chat/completions`).
5. Set the **Model Name** to the model you want to use (e.g., `llama3`).
6. The API Key can often be left blank or set to `ollama` as required by the local service.

**Q: Image generation or chat is not working.**
A: This is usually an API key or endpoint issue.
- **For default Gemini**: The app relies on a pre-configured environment variable which may not be available.
- **Solution**: Always use the "API Configuration" settings. Go into the Character settings (for chat) or the Image Generation plugin settings and explicitly set your API service, endpoint, and key. Double-check that the keys and URLs are correct and have no extra spaces.

**Q: How do I back up my data?**
A: Use the "Export Backup" button on the bottom-left sidebar. This will save a single `ai-nexus-backup-YYYY-MM-DD.json` file containing everything. To restore, use the "Import" button and select your backup file—note that this will overwrite all current data. To save individual characters or chats, use the download icon next to their names in the sidebar lists.