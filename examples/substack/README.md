# MCP Server for substack.com
  
  This MCP server provides browser automation tools for substack.com using Stagehand.
  
  ## Available Tools
  
  1. **search_posts**: Search for posts and publications on Substack.
2. **create_new_post**: Start creating a new post on Substack.
3. **navigate_to_section**: Navigate to a specific main section of the Substack website.
4. **follow_creator**: Follow a creator suggested on the platform.
5. **interact_with_post**: Perform an interaction (like, comment, restack, or share) on a specific post.
6. **read_post**: Open and read a specific post or article.
  
  ## Setup
  
  1. Install dependencies:
     ```bash
     npm install
     ```
  
  2. Create a `.env` file with your API keys:
     ```bash
     cp .env.example .env
     ```
  
  3. Add your API keys to the `.env` file:
     - Get a Browserbase API key from https://browserbase.com
     - Get a Gemini API key from https://ai.google.dev
  
  4. (Optional) Use saved browser context with authentication:
     - If you already authenticated to substack.com using mcpkit, you can reuse that session:
     ```bash
     mcpkit contexts show substack.com
     ```
     - Copy the context ID and add it to your `.env` file:
     ```
     BROWSERBASE_CONTEXT_ID=your_context_id_here
     ```
     - This will preserve your login session and cookies across runs!
  
  5. Build the project:
     ```bash
     npm run build
     ```
  
  ## Usage
  
  ### Running the server
  
  ```bash
  npm start
  ```
  
  When the server starts, it will output a live view URL that you can use to watch the browser automation in real-time:
  
  ```
  🔗 Live view: https://browserbase.com/sessions/[session-id]
  ```
  
  ### Development mode
  
  ```bash
  npm run dev
  ```
  
  ### Using with Claude Desktop
  
  Add this to your Claude Desktop config file:
  
  **MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
  **Windows**: `%APPDATA%/Claude/claude_desktop_config.json`
  
  ```json
  {
    "mcpServers": {
      "substack_com": {
        "command": "node",
        "args": ["/Users/kevinoconnell/Desktop/mcpkit/mcp-stagehand-substack_com/dist/index.js"],
        "env": {
          "BROWSERBASE_PROJECT_ID": "your_project_id",
          "BROWSERBASE_API_KEY": "your_api_key",
          "GEMINI_API_KEY": "your_gemini_key"
        }
      }
    }
  }
  ```
  
  ## License
  
  MIT
  