import os
from datetime import datetime
from typing import Dict, List, Tuple, Optional


class SystemStore:
    
    def __init__(self):
        self.index = {}
        self.paths = set()
        self.svc = {}
        self._setup()
    
    def _setup(self):
        self.paths.update([
            "/",
            "/var",
            "/var/log",
            "/etc",
            "/proc",
            "/home",
            "/home/user",
            "/home/user/scripts",
        ])
        
        self._add_content(
            "/var/log/app.log",
            [
                "2026-03-30T08:15:23.123Z [INFO] Application started",
                "2026-03-30T08:15:45.456Z [DEBUG] Initializing database connection",
                "2026-03-30T09:22:17.789Z [ERROR] Database connection timeout",
                "2026-03-30T09:22:18.012Z [ERROR] Failed to fetch user data",
                "2026-03-30T09:22:19.234Z [ERROR] 500 Internal Server Error",
                "2026-03-30T09:23:01.567Z [INFO] Attempting reconnection",
                "2026-03-30T09:23:15.890Z [INFO] Connection restored",
            ],
            permissions=0o644
        )
        
        self._store_file(
            "/home/user/scripts/cleanup.sh",
            "#!/bin/bash\necho 'Running cleanup...'\nrm -rf /tmp/*.log\necho 'Cleanup complete'",
            permissions=0o644
        )
        
        self._store_file(
            "/etc/app.conf",
            "[database]\nhost=localhost\nport=5432\npool_size=10",
            permissions=0o640
        )
        
        self.svc = {
            "nginx": {"pid": 1024, "status": "running", "restartable": True},
            "postgres": {"pid": 5432, "status": "dead", "restartable": True},
            "redis": {"pid": 6379, "status": "running", "restartable": True},
        }
    
    def _store_file(self, path: str, content: str, permissions: int = 0o644):
        self.index[path] = {
            "content": content,
            "permissions": permissions,
            "created_at": datetime.now().isoformat(),
            "modified_at": datetime.now().isoformat(),
            "is_executable": bool(permissions & 0o111),
        }
    
    def _add_content(self, path: str, lines: List[str], permissions: int = 0o644):
        content = "\n".join(lines) + "\n"
        self._store_file(path, content, permissions)
    
    def fetch(self, path: str) -> Tuple[bool, str]:
        if path not in self.index:
            return False, f"cat: {path}: No such file or directory"
        return True, self.index[path]["content"]
    
    def entries(self, path: str) -> Tuple[bool, List[str]]:
        if path not in self.paths:
            return False, f"ls: cannot access '{path}': No such file or directory"
        
        items = set()
        for fpath in self.index.keys():
            if fpath.startswith(path.rstrip("/") + "/"):
                rel = fpath[len(path.rstrip("/")) + 1:]
                if "/" not in rel:
                    items.add(rel)
        
        for directory in self.paths:
            if directory != path and directory.startswith(path.rstrip("/") + "/"):
                rel = directory[len(path.rstrip("/")) + 1:]
                if "/" not in rel:
                    items.add(rel + "/")
        
        return True, sorted(list(items))
    
    def exists(self, path: str) -> bool:
        return path in self.index
    
    def perms(self, path: str) -> Tuple[bool, int]:
        if path not in self.index:
            return False, 0
        return True, self.index[path]["permissions"]
    
    def chmod(self, path: str, permissions: int) -> Tuple[bool, str]:
        if path not in self.index:
            return False, f"chmod: cannot access '{path}': No such file or directory"
        
        self.index[path]["permissions"] = permissions
        self.index[path]["is_executable"] = bool(permissions & 0o111)
        self.index[path]["modified_at"] = datetime.now().isoformat()
        return True, ""
    
    def info(self, path: str) -> Tuple[bool, Dict]:
        if path not in self.index:
            return False, {}
        
        data = self.index[path].copy()
        data["path"] = path
        data["size"] = len(data["content"])
        return True, data
    
    def svc_info(self, name: str) -> Tuple[bool, Dict]:
        if name not in self.svc:
            return False, {}
        return True, self.svc[name].copy()
    
    def svc_list(self) -> List[str]:
        return list(self.svc.keys())
    
    def svc_stop(self, name: str) -> Tuple[bool, str]:
        if name not in self.svc:
            return False, f"Process '{name}' not found"
        
        if self.svc[name]["status"] == "dead":
            return False, f"Process '{name}' is already dead"
        
        self.svc[name]["status"] = "dead"
        return True, ""
    
    def svc_start(self, name: str) -> Tuple[bool, str]:
        if name not in self.svc:
            return False, f"Process '{name}' not found"
        
        if not self.svc[name]["restartable"]:
            return False, f"Process '{name}' cannot be restarted"
        
        self.svc[name]["status"] = "running"
        return True, ""
    
    def snapshot(self) -> Dict:
        return {
            "files": self.index.copy(),
            "directories": list(self.paths),
            "processes": self.svc.copy(),
        }
    
    def clear(self):
        self.index.clear()
        self.paths.clear()
        self.svc.clear()
        self._setup()
