# WebBLE Provisioning Pro Guide

Configure your IoT devices securely and instantly via Web Bluetooth API directly from your browser.

---

## 1. Environment Readiness

### 1.1 Browser Support
- **Android / Desktop**: Recommended: **Google Chrome** or **Microsoft Edge**.
- **iOS (iPhone/iPad)**: Safari is NOT supported. Please download **Bluefy** or **WebBLE** from the App Store.

### 1.2 Security Context
Web Bluetooth API requires a **Secure Context**. This tool must run under **HTTPS** or local **localhost**.

---

## 2. How to Use (Step-by-Step)

### Step 1: Prepare Hardware
Ensure your device (e.g., ESP32) is in BLE advertising mode with the correct Service UUID (`12345678-1234-5678-1234-56789abcdef0`).

### Step 2: Connect
1. Click **"Search & Connect"** on the sidebar.
2. Select your device from the browser's Bluetooth picker.
3. **Status Check**: 
   - The status dot turns **pulsing green**.
   - The configuration panel and hardware controls will unlock automatically.

### Step 3: Setup Wi-Fi List
1. Enter your primary SSID and Password.
2. Add backups by clicking **"Add Backup"**. You can sync up to **3 profiles**.
3. **Strategy**: The device will automatically connect to the one with the strongest signal (highest RSSI).

### Step 4: Synchronize
Click **"Provision Device"**.
- A green checkmark appears on success.
- The device receives the JSON payload, saves it to NVS, and reboots to connect.

---

## 3. Data Format (JSON)

Payload sent to the BLE characteristic:

```json
{
  "cmd": "SAVE_LIST",
  "list": [
    {"s": "Home_WiFi", "p": "12345678"},
    {"s": "Office_5G", "p": "work_password"}
  ]
}
```
- **cmd**: `SAVE_LIST`, `CMD_REBOOT`, `CMD_FACTORY`.
- **s**: Short for SSID (max 32 bytes).
- **p**: Short for Password (max 64 bytes).

---

## 4. ESP32 Implementation (C Example)

### 4.1 Storage Structure
```c
#define MAX_WIFI_PROFILES 3
#define NVS_NAMESPACE "storage"
#define NVS_KEY_WIFI "wifi_db"

typedef struct {
    char ssid[32];
    char password[64];
} wifi_profile_t;

typedef struct {
    uint8_t count;
    wifi_profile_t profiles[MAX_WIFI_PROFILES];
} wifi_db_t;
```

### 4.2 Handling Write Callback
```c
#include "cJSON.h"

void handle_ble_data(const char* json_str) {
    cJSON *root = cJSON_Parse(json_str);
    if (!root) return;

    cJSON *cmd = cJSON_GetObjectItem(root, "cmd");
    if (cmd && strcmp(cmd->valuestring, "SAVE_LIST") == 0) {
        cJSON *list = cJSON_GetObjectItem(root, "list");
        if (cJSON_IsArray(list)) {
            wifi_db_t new_db = {0};
            new_db.count = cJSON_GetArraySize(list);
            
            for (int i = 0; i < new_db.count && i < MAX_WIFI_PROFILES; i++) {
                cJSON *item = cJSON_GetArrayItem(list, i);
                cJSON *s = cJSON_GetObjectItem(item, "s");
                cJSON *p = cJSON_GetObjectItem(item, "p");
                if (s) strncpy(new_db.profiles[i].ssid, s->valuestring, 31);
                if (p) strncpy(new_db.profiles[i].password, p->valuestring, 63);
            }

            // Save to NVS and reboot
            save_wifi_db(&new_db);
            esp_restart();
        }
    }
    cJSON_Delete(root);
}
```

---

## 5. FAQ

- **Q: Nothing happens after clicking "Provision"?**
  - A: Check the negotiated BLE MTU. It should be >= 256 bytes to accommodate the JSON payload.
- **Q: Cannot find my device in the list?**
  - A: Ensure the device is not already connected to another App or system settings.
