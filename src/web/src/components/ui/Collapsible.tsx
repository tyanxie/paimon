import type { ReactNode } from "react";
import { useReducedMotion } from "motion/react";
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
  return (
    <m.div
      id={id}
      initial={false}
      animate={expanded ? "expanded" : "collapsed"}
      variants={{
        expanded: { height: "auto", opacity: 1, visibility: "visible" },
        collapsed: {
          height: 0,
          opacity: 0,
          transitionEnd: { visibility: "hidden" },
        },
      }}
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
