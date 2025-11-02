# MCP Server for www.printed.trade
  
  This MCP server provides browser automation tools for www.printed.trade using Stagehand.
  
  ## Available Tools
  
  1. **get_leaderboard_data**: Retrieve the full leaderboard data including rank, username, trades, and realized P&L for all displayed users.
2. **get_top_n_users**: Retrieve the data for the top N users on the leaderboard.
3. **filter_leaderboard_by_time_period**: Filter the leaderboard to display results for a specific time period.
4. **join_leaderboard**: Initiate the process to join the leaderboard.
5. **view_user_profile**: Navigate to a specific user's profile page.
  
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
     - If you already authenticated to www.printed.trade using mcpkit, you can reuse that session:
     ```bash
     mcpkit contexts show www.printed.trade
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
  🔗 Live view: https://app.browserbase.com/sessions/[session-id]
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
      "www_printed_trade": {
        "command": "node",
        "args": ["/Users/kevinoconnell/Desktop/mcpkit/mcp-stagehand-www_printed_trade/dist/index.js"],
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
  