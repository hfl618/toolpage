# tools/support/seo_config.py

SEO_DB = {
    # ---------------- 主页 (Hub) ----------------
    # 目标：告诉搜索引擎这是一个集合站，抢占大词“嵌入式在线工具”。
    "index": {
        "title_zh": "Core618 智连在线工具箱 | 网页串口助手与嵌入式开发 Hub",
        "title_en": "Core618 | We,b Serial & Embedded Developer Toolbox",
        "desc_zh": "专为硬件开发者与创客打造的免安装在线工具集。提供基于 Web 的串口调试、BOM元器件管理、LVGL图像转换与低功耗蓝牙(BLE)配网，跨平台极速提效。",
        "desc_en": "Driverless online toolkit for hardware engineers. Features Web Serial debugging, BOM inventory management, LVGL UI conversion, and Web Bluetooth configuration.",
        "key_zh": "嵌入式在线工具, 网页串口助手, ESP32开发工具, BOM解析, CoreHub, 618002",
        "key_en": "Embedded Dev Tools, Online Web Serial, ESP32 Toolkit, BOM Parser, CoreHub",
        "hidden_zh": "Core618 (618002.xyz) 致力于为电子信息工程师提供高效的 Web 原生工具集，涵盖硬件通信与物料资产管理。",
        "hidden_en": "Core618 (618002.xyz) provides efficient, web-native toolsets for electronic engineers, covering hardware communication and asset management."
    },
    
    # ---------------- 串口工具 (Serial) ----------------
    # 目标：强调“免安装”、“浏览器直连”、“硬件型号”，与主页完全区分。
    "serial": {
        "title_zh": "在线网页串口助手 - Web Serial API 免驱调试工具 | CoreHub",
        "title_en": "Web Serial Terminal - Online Browser Serial Monitor | CoreHub",
        "desc_zh": "扔掉传统的串口调试软件！CoreHub 提供纯网页版串口助手。支持 Chrome/Edge 直连 ESP32、Arduino 等单片机，免装驱动，即开即用，支持 HEX 收发与日志导出。",
        "desc_en": "Free online serial port monitor based on Web Serial API. Connect to ESP32, Arduino, and other MCUs directly from your browser. No drivers needed.",
        "key_zh": "在线串口助手, Web Serial API, 网页串口调试, ESP32串口, 免驱串口工具",
        "key_en": "Web Serial API, Online Serial Terminal, Browser Serial Monitor, ESP32 Debug",
        "hidden_zh": "该 Web Serial 在线调试工具允许开发者直接通过浏览器与 RS232/TTL/MCU 硬件设备进行串口通信，无需配置本地环境。",
        "hidden_en": "This Web Serial tool allows developers to communicate with RS232/TTL/MCU hardware devices directly via the browser without local environment setup."
    },

    # ---------------- 元器件管理 (Inventory) ----------------
    # 目标：抓住“硬件采购、仓储管理”的痛点，加入具体应用场景。
    "inventory": {
        "title_zh": "电子元器件库存管理与 BOM 在线解析工具 | Core618",
        "title_en": "Electronic Component & BOM Management Tool | Core618",
        "desc_zh": "专为电子工程师设计的元器件资产管理系统。支持智能解析 Yageo、XFCN 等供应商 BOM 表单，一键生成二维码，手机扫码入库出库，告别实验室库存混乱。",
        "desc_en": "Smart inventory management for electronics engineers. Parse supplier BOMs, generate QR codes, and track component stock effortlessly right from your browser.",
        "key_zh": "元器件管理系统, BOM在线解析, 电子物料库存, 扫码入库, 实验室耗材管理",
        "key_en": "Component Inventory, BOM Parser, Electronic Stock Management, QR Scanner",
        "hidden_zh": "智能元器件管理系统提供 BOM 自动解析与二维码仓储追踪功能，帮助硬件团队精确掌握电阻、电容及芯片等物料库存状态。",
        "hidden_en": "The smart component management system offers BOM parsing and QR-based tracking to help hardware teams monitor stock of resistors, capacitors, and ICs."
    },

    # ---------------- 蓝牙配网 (BLE) ----------------
    "ble_config": {
        "title_zh": "Web BLE 蓝牙在线配网工具 - 极简调试控制台 | Core618",
        "title_en": "Web BLE Configurator - Online IoT Provisioning Tool | Core618",
        "desc_zh": "基于 Web Bluetooth API 的在线调试工具。无需 APP，直接通过浏览器对 ESP32、智能家居设备进行蓝牙配网、参数下发与状态监控。",
        "desc_en": "Provision and debug IoT devices via Web Bluetooth API. No app required, connect to ESP32 and other BLE devices directly from your browser.",
        "key_zh": "Web BLE, 蓝牙配网, 在线蓝牙调试, 浏览器蓝牙, ESP32配网",
        "key_en": "Web Bluetooth API, BLE Provisioning, IoT Config, ESP32 BLE",
        "hidden_zh": "通过浏览器 Web Bluetooth 接口实现硬件设备的低功耗蓝牙通信，支持多组 SSID 自动扫描与下发。",
        "hidden_en": "Implement BLE communication for hardware devices via browser, supporting SSID scanning and parameter provisioning."
    },

    # ---------------- LVGL 转换 (LVGL) ----------------
    "lvgl_image": {
        "title_zh": "LVGL 在线图像转换工具 - 嵌入式 UI 素材处理 | Core618",
        "title_en": "LVGL Image Converter - Online Embedded UI Tool | Core618",
        "desc_zh": "专为嵌入式图形库 LVGL 打造。在线将图片转换为 C 数组或二进制文件，支持 RGB565、A8 等多种颜色格式，优化显存占用。",
        "desc_en": "Professional image converter for LVGL. Convert images to C arrays or binary files with support for various color formats like RGB565 and A8.",
        "key_zh": "LVGL图片转换, 嵌入式UI工具, RGB565转换, 图像转C数组, 网页版LVGL工具",
        "key_en": "LVGL Converter, Image to C Array, Embedded Graphics, RGB565, A8 Format",
        "hidden_zh": "高效的嵌入式图像资源转换引擎，适配最新的 LVGL v8/v9 版本，提供实时预览与压缩选项。",
        "hidden_en": "Efficient image asset converter for LVGL v8/v9, providing real-time preview and memory optimization options."
    }
}

def get_seo_data(page_id):
    return SEO_DB.get(page_id, SEO_DB["index"])