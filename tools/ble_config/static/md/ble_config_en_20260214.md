# WebBLE Device Configuration Tool (Pro)

A professional Web Bluetooth interface for provisioning and controlling IoT devices (e.g., ESP32) securely from your browser.

## Key Features

- **Multi-Account Sync**: Provision up to 3 Wi-Fi accounts at once. The device will automatically connect to the strongest available signal.
- **Compressed Protocol**: Uses minimized JSON keys (`s` for SSID, `p` for Password) to reduce BLE MTU overhead.
- **Professional UI**: Sidebar control layout consistent with Serial Studio, optimized for both desktop and mobile.
- **Privacy First**: Data is sent directly to hardware via encrypted BLE; no cloud storage involved.

## Data Format (JSON)

The web frontend sends the following JSON structure via the GATT characteristic:

```json
{
  "cmd": "SAVE_LIST",
  "list": [
    {"s": "Home_WiFi", "p": "12345678"},
    {"s": "Office_WiFi", "p": "87654321"}
  ]
}
```
- **cmd**: Command type. `SAVE_LIST` for provisioning, `CMD_REBOOT` for system actions.
- **s**: Short for SSID (max 32 bytes).
- **p**: Short for Password (max 64 bytes).

---

## ESP32 Integration (C Implementation)

### 1. Define Data Structure
In your `wifi_service.h`:

```c
#define MAX_WIFI_PROFILES 3

typedef struct {
    char ssid[32];
    char password[64];
} wifi_profile_t;

typedef struct {
    uint8_t count;
    wifi_profile_t profiles[MAX_WIFI_PROFILES];
} wifi_db_t;
```

### 2. Parse JSON (Using cJSON)
Handle the incoming BLE buffer:

```c
#include "cJSON.h"

void handle_ble_data(const char* json_str) {
    cJSON *root = cJSON_Parse(json_str);
    if (!root) return;

    cJSON *cmd = cJSON_GetObjectItem(root, "cmd");
    if (cmd && strcmp(cmd->valuestring, "SAVE_LIST") == 0) {
        cJSON *list = cJSON_GetObjectItem(root, "list");
        wifi_db_t new_db = {0};
        new_db.count = cJSON_GetArraySize(list);

        for (int i = 0; i < new_db.count && i < MAX_WIFI_PROFILES; i++) {
            cJSON *item = cJSON_GetArrayItem(list, i);
            cJSON *s = cJSON_GetObjectItem(item, "s");
            cJSON *p = cJSON_GetObjectItem(item, "p");
            
            if (s) strncpy(new_db.profiles[i].ssid, s->valuestring, 32);
            if (p) strncpy(new_db.profiles[i].password, p->valuestring, 64);
        }

        // Save to NVS (Non-volatile storage)
        save_to_nvs(&new_db);
        // Apply changes
        esp_wifi_disconnect();
        esp_wifi_connect();
    }
    cJSON_Delete(root);
}
```

## Security & Requirements

1. **MTU Setting**: Ensure BLE MTU is negotiated to at least 256 bytes.
2. **Browser Support**: 
   - Android/Desktop: Chrome, Edge.
   - iOS: Use **Bluefy** or **WebBLE** app.
3. **Connectivity**: **HTTPS** or **localhost** is strictly required for Web Bluetooth API.
