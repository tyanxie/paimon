import { useContext } from "react";
import {
  LazyMotion,
  domAnimation,
  MotionConfigContext,
  useIsPresent,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";
import * as m from "motion/react-m";

export function FloatingSurface(props: HTMLMotionProps<"div">) {
  return (
    <LazyMotion features={domAnimation} strict>
      <SurfaceContent {...props} />
    </LazyMotion>
  );
}

function SurfaceContent({
  className = "",
  children,
  ...props
}: HTMLMotionProps<"div">) {
  const present = useIsPresent();
  const policy = useContext(MotionConfigContext).reducedMotion;
  const reducedMotion = useReducedMotion() || policy === "always";
  return (
    <m.div
      {...props}
      className={`glass-popover ui-floating ${className}`}
      inert={!present}
      aria-hidden={!present || undefined}
      initial={{
        opacity: reducedMotion ? 1 : 0,
        y: reducedMotion ? 0 : 4,
        scale: reducedMotion ? 1 : 0.98,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        y: reducedMotion ? 0 : 4,
        scale: reducedMotion ? 1 : 0.98,
      }}
      transition={{ duration: reducedMotion ? 0 : 0.12 }}
    >
      {children}
    </m.div>
  );
}
