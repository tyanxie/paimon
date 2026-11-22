import { useMemo, useRef, type ReactNode } from "react";
import { useReducedMotion, type Variants } from "motion/react";
import * as m from "motion/react-m";

/** 保留内容组件，折叠后限制焦点与辅助技术访问。 */
export function Collapsible({
  id,
  expanded,
  children,
}: {
  id: string;
  expanded: boolean;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const elementRef = useRef<HTMLDivElement>(null);
  const variants = useMemo<Variants>(() => {
    let collapseHeight: number | undefined;
    return {
      expanded: { height: "auto", opacity: 1, visibility: "visible" },
      collapsed: () => {
        // 每次收起只采集一次起点，内容更新不会重启动画
        collapseHeight ??=
          elementRef.current?.getBoundingClientRect().height ?? 0;
        return {
          // 数字关键帧避免 Motion 临时应用 height: 0 测量时改变内层滚动位置
          height: [collapseHeight, 0],
          opacity: 0,
          transitionEnd: { visibility: "hidden" },
        };
      },
    };
  }, [expanded]);
  return (
    <m.div
      ref={elementRef}
      id={id}
      initial={false}
      animate={expanded ? "expanded" : "collapsed"}
      variants={variants}
      transition={{
        duration: reducedMotion ? 0 : expanded ? 0.2 : 0.15,
        ease: "easeInOut",
      }}
      aria-hidden={!expanded}
      inert={!expanded}
      className="min-w-0 overflow-hidden"
    >
      {children}
    </m.div>
  );
}
