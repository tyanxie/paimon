// 主面板布局外壳：为 InstanceView / Home / Settings 提供统一容器

import { Outlet } from "react-router";

export function MainPanel() {
  return (
    <div className="relative flex-1 min-w-0 overflow-hidden flex flex-col">
      <Outlet />
    </div>
  );
}
