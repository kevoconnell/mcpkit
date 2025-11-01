# MCP Server for docs.stagehand.dev

This is an auto-generated MCP (Model Context Protocol) server that provides browser automation capabilities for **docs.stagehand.dev** using [Stagehand V3](https://stagehand.dev).

## Features

1. **search_extensions_and_themes** - Search for extensions or themes in the Chrome Web Store
2. **navigate_to_category_or_tab** - Navigate to a specific category (e.g., Shopping, Tools) or a main tab (e.g., Extensions, Themes) on the Chrome Web Store
3. **view_item_details** - View the detailed page of a specific extension or theme

## Prerequisites

- Node.js 18+
- [Browserbase](https://browserbase.com) account
- Gemini API key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` and add your credentials:
   - Get Browserbase credentials from https://browserbase.com
   - Get Gemini API key from https://aistudio.google.com/apikey

4. Build the project:
   ```bash
   npm run build
   ```

## Usage

### As an MCP Server

Add this to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "docs_stagehand_dev": {
      "command": "node",
      "args": ["/Users/kevinoconnell/Desktop/mcpkit/mcp-stagehand-docs_stagehand_dev/dist/index.js"],
      "env": {
        "BROWSERBASE_PROJECT_ID": "your_project_id",
        "BROWSERBASE_API_KEY": "your_api_key",
        "GEMINI_API_KEY": "your_gemini_api_key"
      }
    }
  }
}
```

### Testing with MCP Inspector

The easiest way to test your MCP server is using the MCP Inspector:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

This will:
1. Start the MCP server
2. Open a web interface in your browser (usually at http://localhost:6274)
3. Show all available tools in the left sidebar
4. Let you execute tools and see results in real-time

**How to test:**
- Click any tool in the left sidebar
- Fill in required parameters (if any)
- Click "Execute" to run the tool
- Watch the results appear in the results panel

### Standalone Testing

Run the server directly:
```bash
npm start
```

## Available Tools

### `search_extensions_and_themes`
Search for extensions or themes in the Chrome Web Store

**Steps:**
1. Type {query} into the search combobox labeled 'Search Chrome Web Store'
2. Press enter

### `navigate_to_category_or_tab`
Navigate to a specific category (e.g., Shopping, Tools) or a main tab (e.g., Extensions, Themes) on the Chrome Web Store

**Steps:**
1. Click on the {target_name} link or tab

### `view_item_details`
View the detailed page of a specific extension or theme

**Steps:**
1. Click on the link for {item_name}


## Customization

The generated actions use Stagehand's AI-powered browser automation. You can customize the behavior by:

1. **Modifying extraction schemas**: Edit the zod schemas in `src/index.ts` for data extraction actions
2. **Adjusting action steps**: Modify the `stagehand.act()` calls to change behavior
3. **Adding new tools**: Follow the existing patterns to add more automation

## Stagehand API Reference

- `stagehand.act("instruction")` - Perform atomic actions (click, type, etc.)
- `stagehand.extract("instruction", schema)` - Extract structured data
- `stagehand.observe("instruction")` - Get candidate actions before acting
- `stagehand.agent({ ... }).execute()` - Run multi-step autonomous tasks

For full documentation, visit: https://docs.stagehand.dev

## Troubleshooting

- **"No Browserbase session"**: Make sure your BROWSERBASE_PROJECT_ID and BROWSERBASE_API_KEY are set correctly
- **"Model not found"**: Verify your GEMINI_API_KEY is valid
- **Actions failing**: Check the Browserbase session logs for detailed error messages

## Generated with

This MCP server was auto-generated using [mcpkit](https://github.com/yourusername/mcpkit).
