# mcpkit

> Easy setup for MCPs with Browserbase. Run browser automation anywhere with just an API key.

## What is mcpkit?

**mcpkit** is a CLI tool that automatically generates MCP servers for any website using AI-powered browser automation. It handles:

Perfect for developers who want to quickly create MCP servers for any web application without manual coding.

## Contributing
Within the repo, run

```bash
npm i && npm run build && npm link
```
now you should be able to run a local instance of mcpkit within your ci



## Quick Start

### Installation

```bash
npm install -g mcpkit
```

### Usage

```bash
# Create an MCP server for any website
mcpkit create https://linear.app
mcpkit create https://notion.so
mcpkit create  # Interactive mode - will prompt for URL

# Show help
mcpkit help

# Show version
mcpkit version
```

### How it works

## CLI Commands


### `mcpkit create <url>`
Generate an MCP server for a website.

**Arguments:**
- `url` (optional): The website URL. If omitted, you'll be prompted interactively.

**Examples:**
```bash
mcpkit create https://news.ycombinator.com/
```


**Examples:**
```bash
mcpkit contexts                    # Interactive mode
mcpkit contexts list               # List all contexts
mcpkit contexts show github.com    # Show github.com context details
mcpkit contexts delete linear.app  # Delete linear.app context
```

### `mcpkit help`
Display help information and available commands.

### `mcpkit version`
Show the current version of mcpkit.

### Flags
- `--help`, `-h`: Show help
- `--version`, `-v`: Show version

## Testing generated MCP servers
after running mcpkit create,
cd into the created folder,
run 
```bash
npm run i && npm run build
```
followed by 
```bash
npx @modelcontextprotocol/inspector node dist/index.js     
```
a screen like this should show
![Hacker News MCP Example](HNMCP.png)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
