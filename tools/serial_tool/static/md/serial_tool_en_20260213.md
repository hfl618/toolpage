# Serial Studio Pro - Engineering Guide (v2.5)

## 1. Core Overview
- **Hardware Access**: Direct serial communication via browser at up to 921,600 baud.
- **Simulation Mode**: Test all logic (waves, search, auto-replies) without physical hardware.
- **Privacy**: No data is sent to the server. Everything is processed locally in RAM.

## 2. Advanced Debugging

### 2.1 Timestamp Modes
- **Absolute Time**: Local system clock.
- **Delta Time (Δ)**: Time difference from the previous message in milliseconds. Perfect for measuring packet frequency.
- *Switch*: Use the dropdown in terminal header.

### 2.2 Multi-Channel Waveform
The plotter extracts numerical data from the raw stream automatically:
- **Simple Mode**: Output raw numbers (e.g., `25.5`).
- **Multi-Key Mode**: Output `Key:Value` pairs (e.g., `volt:3.3,curr:0.5`).
- **Colors**: The system assigns unique colors to each Key and shows a live legend.

### 2.3 Intelligent Highlighter
Auto-detects and colors log rows based on keywords:
- **Presets**: `ERROR` (Red), `SUCCESS` (Green), `WARN` (Yellow).
- **Custom**: Add your own business-specific keywords via the sidebar palette icon.

## 3. Automation Features

### 3.1 Macros
| Feature | Details | Example |
| :--- | :--- | :--- |
| **Text Mode** | Supports escape sequences | `AT+VERSION\r\n` |
| **HEX Mode** | Send raw bytes | `55 AA 01` |
| **Auto-Polling** | Interval-based repeating send | `2000ms` |

### 3.2 Auto-Responder
Set rules to trigger automatic replies. Once a "Match Word" is detected in the incoming stream, the "Reply Word" is sent immediately within milliseconds.

## 4. Configuration & Logs
- **Backup/Restore**: Save your macros and rules as JSON files for cross-device synchronization.
- **Export Logs**: Save current terminal buffer as a `.txt` file.

---
*Last Update: 2026-02-13*
