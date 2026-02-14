# WebBLE 设备配网工具 (Pro)

本工具利用浏览器原生的 **Web Bluetooth API**，通过加密的蓝牙通道直接对嵌入式设备（如 ESP32）进行多组 Wi-Fi 账号下发及硬件指令控制。

## 核心特性

- **多账号同步**: 支持一次性下发最多 3 组 Wi-Fi 账号，设备可根据信号强度自动切换。
- **数据压缩协议**: 采用缩写键名的 JSON 格式，最大程度减小 BLE MTU 传输压力。
- **专业级 UI**: 采用与 Serial Studio 一致的侧边栏控制布局，适配 PC 与移动端。
- **离线安全**: 所有配网数据直接传输至硬件，不经过任何云端服务器，保障隐私安全。

## 数据传输格式 (JSON)

下发 Wi-Fi 列表时，网页端会通过特征值发送如下格式的字符串：

```json
{
  "cmd": "SAVE_LIST",
  "list": [
    {"s": "Home_WiFi", "p": "12345678"},
    {"s": "Office_WiFi", "p": "87654321"},
    {"s": "Guest_WiFi", "p": "password"}
  ]
}
```
- **cmd**: 指令类型，`SAVE_LIST` 表示保存 Wi-Fi 列表，`CMD_REBOOT` 表示重启等。
- **s**: SSID 的缩写，最大 32 字节。
- **p**: Password 的缩写，最大 64 字节。

---

## ESP32 端对接实现 (C 语言)

### 1. 数据结构定义
在 `wifi_service.h` 中定义配网数据库结构：

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

### 2. JSON 解析逻辑 (使用 cJSON)
在 BLE 接收回调函数中解析收到的数据：

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

        // 写入 NVS 永久保存
        save_to_nvs(&new_db);
        // 重启或重新扫描 Wi-Fi
        esp_restart(); 
    }
    cJSON_Delete(root);
}
```

## 兼容性与安全

1. **协议要求**: BLE 必须开启 MTU 交换（MTU >= 256 字节以容纳完整 JSON）。
2. **浏览器**: 
   - Android/Chrome, Edge。
   - iOS 需使用 **Bluefy** 或 **WebBLE** 浏览器。
3. **环境**: 必须在 **HTTPS** 或 **localhost** 下运行。
