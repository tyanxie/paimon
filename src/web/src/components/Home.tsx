// 首页：未选择实例时的占位页面

import { useLogoSrc } from "../hooks/useLogoSrc";
import { useTranslation } from "react-i18next";

export function Home() {
  const { t } = useTranslation();
  const logoSrc = useLogoSrc();

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center select-none">
        <img
          src={logoSrc}
          alt="Paimon"
          className="w-16 h-16 mx-auto mb-4 opacity-80"
        />
        <div className="text-[14px] text-[var(--label-tertiary)] tracking-wide">
          {t("eventStream.tagline")}
        </div>
      </div>
    </div>
  );
}
