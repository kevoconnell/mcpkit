# mcpkit

> Easy setup for MCPs with Browserbase and 1Password. Run browser automation anywhere with just an API key.

## What is mcpkit?

**mcpkit** is a CLI tool that automatically generates MCP servers for any website using AI-powered browser automation. It handles:

Perfect for developers who want to quickly create MCP servers for any web application without manual coding.

## Quick Start

### Installation

```bash
npm install -g mcpkit
```

### Usage

```bash
# First time setup - configure 1Password and environment
mcpkit setup

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

#### 1. Initial Setup (One-time)
```bash
mcpkit setup
```
The above sets up 1password with mcpkit, so its easier to auth as needed (still a WIP)

## CLI Commands

### `mcpkit setup`
Run the interactive 1Password setup wizard to configure your environment.

**What it does:**
- Installs 1Password CLI if needed
- Connects to your 1Password account
- Creates a service account with vault access
- Saves credentials to `.env`

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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
