# Web Serial Studio Pro - Engineering Guide (v2.5)

## 1. Core Technical Advantages (SEO)
- **Web Serial API Serial Debugging Tool**: Based on modern native browser APIs, it interacts directly with hardware, supporting high baud rates up to **2,000,000**.
- **Driverless Browser Serial Assistant**: No need to install any drivers or .exe plugins. Simply use Chrome or Edge on Windows, macOS, or Linux to establish a connection.
- **Privacy & Security**: Built on the browser sandbox mechanism, all data processing occurs 100% locally. Our servers never touch or store your communication logs.

## 2. Advanced Debugging Techniques

### 2.1 High-Precision Timestamp Modes
- **Absolute Time (ABS)**: Displays standard local 24-hour time (e.g., `15:30:05`).
- **Delta Time (DELTA Δ)**: Displays the time interval since the last message in milliseconds. **Click the timestamp in the log** to toggle between modes instantly.
- **Continuous Background Sync**: The timer keeps running accurately even in ABS mode, ensuring precision when switching to DELTA mode.

### 2.2 Multi-Channel Waveform Chart
The system uses high-performance Canvas rendering to extract numeric data from raw streams:
- **Matching Formats**: Supports pure numbers or `Key:Value` pairs (e.g., `temp:25.5,humi:60`).
- **Auto-Legend**: Dynamically identifies multiple sensor channels and assigns professional color palettes.

### 2.3 Intelligent Keyword Highlighter
Monitor log streams in real-time and locate anomalies using color coding:
- **Auto-Assignment**: New keywords are automatically assigned one of 5 professional colors (Red, Green, Blue, Orange, Purple).
- **Manual Cycle**: **Click any keyword in the sidebar** to cycle through background colors.
- **High-Frequency Optimization**: Internal caching ensures zero CPU lag even during extreme data floods.

## 3. Automation Workflow

### 3.1 Enhanced Macros
- **Line Ending Support**: Supports `CRLF (\r\n)`, `LF (\n)`, and `NONE`, compatible with all AT command sets.
- **HEX Mode**: Send standard hex byte streams (automatically filters spaces).
- **Periodic Polling**: Set millisecond-level intervals for heartbeat or status queries.

### 3.2 Intelligent Auto-Responder
- **Millisecond Response**: Runs on the browser's main thread to trigger replies immediately upon keyword matching.
- **Usage Guide**:
    1. Click the `+` icon next to the **Responder** title in the sidebar.
    2. **Match**: Enter the expected incoming string (e.g., `PING`).
    3. **Reply**: Enter the command to be sent back (e.g., `PONG\r\n`).
    4. **Advanced Support**: Reply strings support escape characters like `\r` and `\n`.
- **Protocol Simulation**: Combined with **SIM Mode**, it simulates full bidirectional communication without physical hardware.

## 4. Data & Configuration
- **Global Stability**: Hosted via Cloudflare with Hong Kong CN2 high-speed routing for global access.
- **Local Persistence**: All rules, macros, and responders are stored in the browser's `localStorage`.
- **Log Export**: Save raw communication records with timestamps to a `.txt` file with one click.

---
*Last updated: 2026-02-17 (Based on v2.5 Architecture)*
