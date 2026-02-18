import requests
import ipaddress
import time

class CloudflareValidator:
    _cached_ips = []
    _last_update = 0
    UPDATE_INTERVAL = 86400  # 24小时更新一次

    @classmethod
    def get_cloudflare_ips(cls):
        # 💡 优化：如果已经有缓存，哪怕过期了，也先返回缓存，在后台或下次请求再尝试更新
        # 这样可以保证请求绝不被阻塞
        if cls._cached_ips and (time.time() - cls._last_update < cls.UPDATE_INTERVAL):
            return cls._cached_ips

        # 💡 只有在没有任何 IP 记录时，才进行同步抓取
        if not cls._cached_ips:
            cls._sync_fetch()
        
        return cls._cached_ips

    @classmethod
    def _sync_fetch(cls):
        try:
            # 💡 增加严格的超时控制 (3秒)，防止卡死
            ipv4 = requests.get("https://www.cloudflare.com/ips-v4", timeout=3).text.splitlines()
            ipv6 = requests.get("https://www.cloudflare.com/ips-v6", timeout=3).text.splitlines()
            
            cls._cached_ips = [ipaddress.ip_network(ip) for ip in (ipv4 + ipv6) if ip.strip()]
            cls._last_update = time.time()
            print(f"✅ Cloudflare IPs updated.")
        except Exception as e:
            print(f"⚠️ Cloudflare IP update failed: {e}")
            # 如果失败了，但我们有旧数据，就继续用旧数据
            if not cls._cached_ips:
                # 最后的保底：如果实在拿不到，写入一些硬编码的核心段防止全站 403
                cls._cached_ips = [ipaddress.ip_network("103.21.244.0/22"), ipaddress.ip_network("104.16.0.0/13")]

    @classmethod
    def is_cloudflare_ip(cls, ip_str):
        if not ip_str: return False
        try:
            ip_obj = ipaddress.ip_address(ip_str)
            for network in cls.get_cloudflare_ips():
                if ip_obj in network:
                    return True
        except: return False
        return False
