// React 入口

import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./App";
import "./i18n"; // 初始化 i18n（必须在 App 渲染前）
import "./stores/useSettings"; // 初始化设置（DOM 同步）
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
