# WebBLE 设备配网工具实战指南

本工具通过 Web Bluetooth API 实现 PC/手机浏览器与硬件的直连配网。无需安装 App，即可安全、极速地同步网络配置。

---

## 一、 环境准备

### 1.1 浏览器要求
- **Android / Windows / macOS**: 请使用 **Google Chrome** 或 **Microsoft Edge**。
- **iOS (iPhone/iPad)**: 系统原生 Safari 不支持蓝牙。请从 App Store 下载 **Bluefy** 或 **WebBLE** 浏览器使用。

### 1.2 安全要求
Web Bluetooth API 强制要求安全环境。本工具必须在 **HTTPS** 域名下或本地 **localhost** 环境运行。

---

## 二、 使用方法 (操作步骤)

### 第 1 步：准备硬件
确保您的 ESP32 等硬件已开启蓝牙广播，并配置了正确的 Service UUID (`12345678-1234-5678-1234-56789abcdef0`)。

### 第 2 步：搜索并连接
1. 点击页面右侧的 **“搜索并连接设备”** 按钮。
2. 在浏览器弹出的系统对话框中，选择对应的硬件名称。
3. **状态观察**: 
   - 按钮变为红色“断开连接”。
   - 顶部状态灯变为 **绿色呼吸状态**。
   - 界面左侧的配置区和高级功能区自动解锁。

### 第 3 步：配置 Wi-Fi 列表
1. 在 **“首选连接网络”** 中输入您最常用的 Wi-Fi 名称和密码。
2. 如需备份，点击标题栏右侧的 **“添加备用”**。本工具支持最多 **3 组** 账号同步。
3. **信号策略**: 硬件收到多组配置后，会自动扫描环境并连接信号最强的一组。

### 第 4 步：同步并生效
点击底部的 **“下发配置到设备”**。
- 成功后按钮会显示绿色的勾选标记。
- 设备接收到 JSON 报文后，通常会自动重启并尝试联网。

---

## 三、 数据协议规范 (JSON Over BLE)

网页端发送至 BLE 特征值的报文格式：

```json
{
  "cmd": "SAVE_LIST",
  "list": [
    {"s": "Home_WiFi", "p": "12345678"},
    {"s": "Office_5G", "p": "work_password"}
  ]
}
```
- **cmd**: `SAVE_LIST` (保存列表), `CMD_REBOOT` (重启), `CMD_FACTORY` (重置)。
- **s**: SSID（网络名称）。
- **p**: Password（密码）。

---

## 四、 ESP32 端代码实现 (C 语言)

建议使用 **ESP-IDF** 框架配合 **cJSON** 库实现。

### 4.1 存储结构定义
```c
#include "nvs_flash.h"

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

### 4.2 核心处理逻辑
```c
#include "cJSON.h"
#include "esp_log.h"

void handle_ble_data(const char* json_str) {
    cJSON *root = cJSON_Parse(json_str);
    if (!root) return;

    cJSON *cmd = cJSON_GetObjectItem(root, "cmd");
    if (cmd && strcmp(cmd->valuestring, "SAVE_LIST") == 0) {
        cJSON *list = cJSON_GetObjectItem(root, "list");
        if (cJSON_IsArray(list)) {
            wifi_db_t new_db = {0};
            new_db.count = cJSON_GetArraySize(list);
            if (new_db.count > MAX_WIFI_PROFILES) new_db.count = MAX_WIFI_PROFILES;

            for (int i = 0; i < new_db.count; i++) {
                cJSON *item = cJSON_GetArrayItem(list, i);
                cJSON *s = cJSON_GetObjectItem(item, "s");
                cJSON *p = cJSON_GetObjectItem(item, "p");
                if (s) strncpy(new_db.profiles[i].ssid, s->valuestring, 31);
                if (p) strncpy(new_db.profiles[i].password, p->valuestring, 63);
            }

            // 存入 NVS 永久保存
            nvs_handle_t handle;
            if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle) == ESP_OK) {
                nvs_set_blob(handle, NVS_KEY_WIFI, &new_db, sizeof(wifi_db_t));
                nvs_commit(handle);
                nvs_close(handle);
            }
            esp_restart(); // 应用新配网
        }
    }
    cJSON_Delete(root);
}
```

---

## 五、 常见问题 (FAQ)

- **Q: 为什么点击“下发”后硬件无反应？**
  - A: 请检查 BLE MTU 是否协商成功（建议 256 或 512）。如果 MTU 过小（如默认 23 字节），JSON 数据会被截断导致解析失败。
- **Q: 蓝牙连接后自动断开？**
  - A: 请检查硬件端的连接超时设置，或确认是否有其他设备正在争抢连接。
